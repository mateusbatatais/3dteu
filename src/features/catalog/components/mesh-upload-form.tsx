"use client";

import { useId, useRef, useState, useTransition } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  getMeshExtension,
  MAX_MESH_FILE_SIZE_BYTES,
  MESH_CONTENT_TYPE_BY_EXTENSION,
  MODELS_BUCKET,
} from "@/lib/supabase/storage-constants";
import { createClient } from "@/lib/supabase/client";

import { applySuggestedDimensions, autoGenerateSizeOptions, confirmPartMesh, createMeshUploadUrl } from "../actions";
import { measureMesh, type MeshMeasurements } from "../mesh-measure";
import { detectPaintedStates } from "../mmu-3mf";
import { estimatePrintWeight } from "../print-estimate";

function formatMegabytes(bytes: number): string {
  return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
}

export function MeshUploadForm({
  productId,
  partId,
  hasMesh,
}: {
  productId: string;
  partId: string;
  hasMesh: boolean;
}) {
  const inputId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [isDraggingOver, setIsDraggingOver] = useState(false);
  const [isPending, startTransition] = useTransition();
  // Regiões pintadas (MMU) detectadas no .3mf selecionado — null = ainda não
  // detectado/não é um .3mf pintado. A detecção rola no navegador, no arquivo
  // que o próprio admin acabou de escolher, antes de qualquer upload.
  const [detectedStates, setDetectedStates] = useState<number[] | null>(null);
  const [isDetecting, setIsDetecting] = useState(false);
  // Medidas + volume do arquivo — usadas pra sugerir tamanhos e preço, e pra
  // preencher peso/dimensões automaticamente (ver passo 5 do handleSubmit).
  const [measurements, setMeasurements] = useState<MeshMeasurements | null>(null);
  const [appliedPhysicalProps, setAppliedPhysicalProps] = useState<{
    weightGrams: number;
    heightCm: number;
    widthCm: number;
    lengthCm: number;
  } | null>(null);

  const weightEstimate = measurements ? estimatePrintWeight(measurements.volumeMm3, measurements.surfaceAreaMm2) : null;
  // Arredonda pra cima — pra uma estimativa de embalagem, é mais seguro
  // sugerir uma caixa levemente maior do que uma que não fecha de verdade.
  const suggestedDimensionsCm = measurements
    ? {
        widthCm: Math.max(1, Math.ceil(measurements.widthMm / 10)),
        heightCm: Math.max(1, Math.ceil(measurements.heightMm / 10)),
        lengthCm: Math.max(1, Math.ceil(measurements.depthMm / 10)),
      }
    : null;

  function processSelectedFile(selected: File) {
    setSuccess(false);
    setError(null);
    setDetectedStates(null);
    setMeasurements(null);
    setAppliedPhysicalProps(null);

    const extension = getMeshExtension(selected.name);
    if (!extension) {
      setError("Formato não suportado. Use .stl, .obj ou .3mf.");
      setFile(null);
      return;
    }

    // Checa o tamanho já na hora de escolher o arquivo — não faz sentido
    // esperar o upload pra descobrir que passa do teto do Supabase.
    if (selected.size > MAX_MESH_FILE_SIZE_BYTES) {
      setError(
        `Esse arquivo tem ${formatMegabytes(selected.size)}, e o máximo é ${formatMegabytes(MAX_MESH_FILE_SIZE_BYTES)} (teto do plano gratuito do Supabase). Reduza a malha (menos triângulos) ou exporte em binário antes de enviar.`,
      );
      setFile(null);
      return;
    }

    setFile(selected);
    measureMesh(selected, extension).then(setMeasurements);

    if (extension === "3mf") {
      setIsDetecting(true);
      detectPaintedStates(selected)
        .then(setDetectedStates)
        .catch(() => {
          // Arquivo não é um 3MF pintado (ou não deu pra ler) — trata como arquivo normal, sem erro pro admin.
          setDetectedStates(null);
        })
        .finally(() => setIsDetecting(false));
    }
  }

  function handleFileChange(event: React.ChangeEvent<HTMLInputElement>) {
    const selected = event.target.files?.[0] ?? null;
    if (!selected) {
      setFile(null);
      return;
    }
    processSelectedFile(selected);
  }

  function handleDrop(event: React.DragEvent<HTMLDivElement>) {
    event.preventDefault();
    setIsDraggingOver(false);
    const dropped = event.dataTransfer.files?.[0];
    if (dropped) processSelectedFile(dropped);
  }

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setSuccess(false);

    const extension = file ? getMeshExtension(file.name) : null;
    if (!file || !extension) {
      setError("Escolha um arquivo .stl, .obj ou .3mf primeiro.");
      return;
    }

    startTransition(async () => {
      // 1) Pede uma URL de upload assinada — não passa o arquivo pelo servidor.
      const prepared = await createMeshUploadUrl(partId, extension);
      if (prepared.error || !prepared.path || !prepared.token) {
        setError(prepared.error ?? "Falha ao preparar o upload.");
        return;
      }

      // 2) Envia o arquivo direto do navegador pro Supabase Storage.
      const supabase = createClient();
      const { error: uploadError } = await supabase.storage
        .from(MODELS_BUCKET)
        .uploadToSignedUrl(prepared.path, prepared.token, file, {
          contentType: MESH_CONTENT_TYPE_BY_EXTENSION[extension],
        });
      if (uploadError) {
        setError(`Falha ao enviar o arquivo: ${uploadError.message}`);
        return;
      }

      // 3) Confirma no servidor: grava a URL pública na parte do produto (+
      // as regiões pintadas detectadas no passo anterior, se houver, + o
      // peso desta peça — usado no preço ao vivo por material/cor).
      const confirmed = await confirmPartMesh(
        productId,
        partId,
        prepared.path,
        detectedStates ?? undefined,
        weightEstimate?.weightGrams,
      );
      if (confirmed.error) {
        setError(confirmed.error);
        return;
      }

      // 4) Sugere P/M/G a partir da medida do arquivo — só cria se o
      // produto ainda não tiver nenhum tamanho (nunca sobrescreve ajuste manual).
      if (measurements) {
        const mainDimensionMm = Math.max(measurements.widthMm, measurements.heightMm, measurements.depthMm);
        const sizeResult = await autoGenerateSizeOptions(productId, mainDimensionMm);
        if (sizeResult.created && sizeResult.labels) {
          toast.success(`Tamanhos criados a partir do arquivo: ${sizeResult.labels.join(", ")}.`);
        }
      }

      // 5) Dimensões de embalagem são sempre derivadas do arquivo — preenche
      // automaticamente, sem precisar de um clique extra (diferente do
      // preço, que segue exigindo confirmação por afetar cobrança direta).
      // Peso já foi gravado no passo 3 (por peça, com recálculo do
      // agregado do produto) — não precisa de uma segunda chamada aqui.
      if (suggestedDimensionsCm) {
        const dimensionsResult = await applySuggestedDimensions(productId, suggestedDimensionsCm);
        if (dimensionsResult.error) {
          toast.error(dimensionsResult.error ?? "Não foi possível salvar as dimensões.");
        } else if (weightEstimate) {
          setAppliedPhysicalProps({ weightGrams: weightEstimate.weightGrams, ...suggestedDimensionsCm });
        }
      }

      setFile(null);
      setDetectedStates(null);
      setSuccess(true);
    });
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-2">
      <div
        onClick={() => inputRef.current?.click()}
        onDragOver={(event) => {
          event.preventDefault();
          setIsDraggingOver(true);
        }}
        onDragLeave={() => setIsDraggingOver(false)}
        onDrop={handleDrop}
        role="button"
        tabIndex={0}
        onKeyDown={(event) => {
          if (event.key === "Enter" || event.key === " ") inputRef.current?.click();
        }}
        className={`flex cursor-pointer flex-col items-center gap-2 rounded-xl border-2 border-dashed p-6 text-center transition-colors ${
          isDraggingOver ? "border-primary bg-primary/5" : "border-border hover:border-primary/60 hover:bg-muted/40"
        }`}
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth={1.5}
          className="size-8 text-muted-foreground"
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 16.5V9m0 0-3 3m3-3 3 3" />
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M6.75 19.5a4.5 4.5 0 0 1-1.41-8.775 5.25 5.25 0 0 1 10.233-2.33 3 3 0 0 1 3.758 3.848A3.752 3.752 0 0 1 18 19.5H6.75Z"
          />
        </svg>
        <p className="text-sm font-semibold">{hasMesh ? "Substituir arquivo 3D" : "Enviar arquivo 3D"}</p>
        <p className="text-xs text-muted-foreground">
          Arraste o arquivo aqui ou <span className="font-medium text-primary underline-offset-2">clique pra escolher</span>
        </p>
        <p className="text-[11px] text-muted-foreground">
          STL, OBJ ou 3MF — máximo {formatMegabytes(MAX_MESH_FILE_SIZE_BYTES)}
        </p>
        <input
          ref={inputRef}
          id={inputId}
          type="file"
          accept=".stl,.obj,.3mf"
          onChange={handleFileChange}
          onClick={(event) => event.stopPropagation()}
          className="sr-only"
        />
      </div>

      {file ? (
        <p className="text-xs text-muted-foreground">
          Selecionado: <span className="font-medium text-foreground">{file.name}</span> ({formatMegabytes(file.size)})
        </p>
      ) : null}

      {measurements ? (
        <p className="text-xs text-muted-foreground">
          Medidas detectadas: {(measurements.widthMm / 10).toFixed(1)} × {(measurements.heightMm / 10).toFixed(1)} ×{" "}
          {(measurements.depthMm / 10).toFixed(1)} cm, ~{weightEstimate ? Math.round(weightEstimate.weightGrams) : "?"}
          g estimados ({weightEstimate?.assumptionLabel}) — ao confirmar o envio, tamanhos, peso e dimensões de
          embalagem são preenchidos automaticamente a partir dessas medidas.
        </p>
      ) : null}

      {isDetecting ? (
        <p className="text-xs text-muted-foreground">Verificando se o .3mf tem regiões pintadas (MMU)...</p>
      ) : null}
      {detectedStates && detectedStates.length > 0 ? (
        <p className="text-xs font-medium text-primary">
          Detectamos {detectedStates.length} região(ões) pintada(s) neste arquivo — o cliente vai poder escolher
          uma cor por região.
        </p>
      ) : null}

      <Button type="submit" disabled={isPending || isDetecting || !file} className="mt-1 self-start">
        {isPending ? "Enviando..." : "Confirmar envio"}
      </Button>

      {hasMesh ? <span className="text-xs text-muted-foreground">Malha 3D cadastrada ✓</span> : null}
      {success ? (
        <span className="text-xs font-medium text-primary">
          Arquivo enviado com sucesso.
          {appliedPhysicalProps
            ? ` Peso (~${Math.round(appliedPhysicalProps.weightGrams)}g) e dimensões (${appliedPhysicalProps.heightCm} × ${appliedPhysicalProps.widthCm} × ${appliedPhysicalProps.lengthCm} cm) atualizados automaticamente.`
            : ""}
        </span>
      ) : null}
      {error ? <span className="text-xs text-destructive">{error}</span> : null}
    </form>
  );
}
