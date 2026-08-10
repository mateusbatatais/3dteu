"use client";

import { useId, useState, useTransition } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/client";
import { formatPriceCents } from "@/lib/format";
import { getMeshExtension, MAX_MESH_FILE_SIZE_BYTES, MODELS_BUCKET } from "@/lib/supabase/storage-constants";

import {
  applySuggestedDimensions,
  applySuggestedPrice,
  applySuggestedWeight,
  autoGenerateSizeOptions,
  confirmPartMesh,
  createMeshUploadUrl,
} from "../actions";
import { measureMesh, type MeshMeasurements } from "../mesh-measure";
import { detectPaintedStates } from "../mmu-3mf";
import { estimatePrintWeight } from "../print-estimate";

const CONTENT_TYPE_BY_EXTENSION: Record<string, string> = {
  stl: "model/stl",
  obj: "model/obj",
  "3mf": "model/3mf",
};

function formatMegabytes(bytes: number): string {
  return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
}

interface PricingSettings {
  pricePerGramCents: number | null;
  fixedFeeCents: number | null;
}

export function MeshUploadForm({
  productId,
  partId,
  hasMesh,
  pricingSettings,
}: {
  productId: string;
  partId: string;
  hasMesh: boolean;
  pricingSettings: PricingSettings;
}) {
  const inputId = useId();
  const [file, setFile] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [isPending, startTransition] = useTransition();
  // Regiões pintadas (MMU) detectadas no .3mf selecionado — null = ainda não
  // detectado/não é um .3mf pintado. A detecção rola no navegador, no arquivo
  // que o próprio admin acabou de escolher, antes de qualquer upload.
  const [detectedStates, setDetectedStates] = useState<number[] | null>(null);
  const [isDetecting, setIsDetecting] = useState(false);
  // Medidas + volume do arquivo — usadas pra sugerir tamanhos, peso e preço.
  const [measurements, setMeasurements] = useState<MeshMeasurements | null>(null);
  const [isApplyingSuggestion, startSuggestionTransition] = useTransition();

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
  const suggestedPriceCents =
    weightEstimate && pricingSettings.pricePerGramCents
      ? Math.round(weightEstimate.weightGrams * pricingSettings.pricePerGramCents + (pricingSettings.fixedFeeCents ?? 0))
      : null;

  async function handleFileChange(event: React.ChangeEvent<HTMLInputElement>) {
    const selected = event.target.files?.[0] ?? null;
    setSuccess(false);
    setError(null);
    setDetectedStates(null);
    setMeasurements(null);

    if (!selected) {
      setFile(null);
      return;
    }

    const extension = getMeshExtension(selected.name);
    if (!extension) {
      setError("Formato não suportado. Use .stl, .obj ou .3mf.");
      setFile(null);
      event.target.value = "";
      return;
    }

    // Checa o tamanho já na hora de escolher o arquivo — não faz sentido
    // esperar o upload pra descobrir que passa do teto do Supabase.
    if (selected.size > MAX_MESH_FILE_SIZE_BYTES) {
      setError(
        `Esse arquivo tem ${formatMegabytes(selected.size)}, e o máximo é ${formatMegabytes(MAX_MESH_FILE_SIZE_BYTES)} (teto do plano gratuito do Supabase). Reduza a malha (menos triângulos) ou exporte em binário antes de enviar.`,
      );
      setFile(null);
      event.target.value = "";
      return;
    }

    setFile(selected);
    measureMesh(selected, extension).then(setMeasurements);

    if (extension === "3mf") {
      setIsDetecting(true);
      try {
        const states = await detectPaintedStates(selected);
        setDetectedStates(states);
      } catch {
        // Arquivo não é um 3MF pintado (ou não deu pra ler) — trata como arquivo normal, sem erro pro admin.
        setDetectedStates(null);
      } finally {
        setIsDetecting(false);
      }
    }
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
          contentType: CONTENT_TYPE_BY_EXTENSION[extension],
        });
      if (uploadError) {
        setError(`Falha ao enviar o arquivo: ${uploadError.message}`);
        return;
      }

      // 3) Confirma no servidor: grava a URL pública na parte do produto (+
      // as regiões pintadas detectadas no passo anterior, se houver).
      const confirmed = await confirmPartMesh(productId, partId, prepared.path, detectedStates ?? undefined);
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

      setFile(null);
      setDetectedStates(null);
      setSuccess(true);
      // Mantém a medida (e a sugestão de peso/preço) visível depois do envio
      // — o admin ainda pode querer clicar "usar" nelas.
    });
  }

  function handleApplyWeight() {
    if (!weightEstimate) return;
    startSuggestionTransition(async () => {
      const result = await applySuggestedWeight(productId, weightEstimate.weightGrams);
      if (result.error) {
        toast.error(result.error);
        return;
      }
      toast.success(`Peso do produto atualizado pra ~${Math.round(weightEstimate.weightGrams)}g.`);
    });
  }

  function handleApplyDimensions() {
    if (!suggestedDimensionsCm) return;
    startSuggestionTransition(async () => {
      const result = await applySuggestedDimensions(productId, suggestedDimensionsCm);
      if (result.error) {
        toast.error(result.error);
        return;
      }
      toast.success(
        `Dimensões da embalagem atualizadas pra ${suggestedDimensionsCm.heightCm} × ${suggestedDimensionsCm.widthCm} × ${suggestedDimensionsCm.lengthCm} cm.`,
      );
    });
  }

  function handleApplyPrice() {
    if (!suggestedPriceCents) return;
    startSuggestionTransition(async () => {
      const result = await applySuggestedPrice(productId, suggestedPriceCents);
      if (result.error) {
        toast.error(result.error);
        return;
      }
      toast.success(`Preço base do produto atualizado pra ${formatPriceCents(suggestedPriceCents)}.`);
    });
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="flex flex-col gap-2 rounded-lg border-2 border-dashed border-border p-3"
    >
      <div className="flex items-center justify-between">
        <label htmlFor={inputId} className="text-sm font-medium">
          {hasMesh ? "Substituir arquivo 3D" : "Enviar arquivo 3D"}
        </label>
        <span className="text-xs text-muted-foreground">Máximo {formatMegabytes(MAX_MESH_FILE_SIZE_BYTES)}</span>
      </div>

      <input id={inputId} type="file" accept=".stl,.obj,.3mf" onChange={handleFileChange} className="text-sm" />
      <p className="text-xs text-muted-foreground">Formatos aceitos: STL, OBJ ou 3MF.</p>

      {file ? (
        <p className="text-xs text-muted-foreground">
          Selecionado: {file.name} ({formatMegabytes(file.size)})
        </p>
      ) : null}

      {measurements ? (
        <p className="text-xs text-muted-foreground">
          Medidas detectadas: {(measurements.widthMm / 10).toFixed(1)} × {(measurements.heightMm / 10).toFixed(1)} ×{" "}
          {(measurements.depthMm / 10).toFixed(1)} cm — usadas pra sugerir os tamanhos, se o produto ainda não tiver
          nenhum.
        </p>
      ) : null}

      {weightEstimate ? (
        <p className="text-xs text-muted-foreground">
          Peso estimado: ~{Math.round(weightEstimate.weightGrams)}g ({weightEstimate.assumptionLabel} — aproximado,
          ajuste se usar outra configuração).{" "}
          <button
            type="button"
            disabled={isApplyingSuggestion}
            onClick={handleApplyWeight}
            className="font-medium text-primary underline-offset-2 hover:underline disabled:opacity-50"
          >
            Usar esse peso
          </button>
        </p>
      ) : null}

      {suggestedDimensionsCm ? (
        <p className="text-xs text-muted-foreground">
          Dimensões de embalagem estimadas: {suggestedDimensionsCm.heightCm} × {suggestedDimensionsCm.widthCm} ×{" "}
          {suggestedDimensionsCm.lengthCm} cm (tamanho do próprio arquivo, sem margem extra — ajuste se a embalagem
          real precisar ser maior).{" "}
          <button
            type="button"
            disabled={isApplyingSuggestion}
            onClick={handleApplyDimensions}
            className="font-medium text-primary underline-offset-2 hover:underline disabled:opacity-50"
          >
            Usar essas dimensões
          </button>
        </p>
      ) : null}

      {suggestedPriceCents ? (
        <p className="text-xs text-muted-foreground">
          Preço sugerido: {formatPriceCents(suggestedPriceCents)} (peso estimado × preço por grama, configurado em
          Configurações da loja).{" "}
          <button
            type="button"
            disabled={isApplyingSuggestion}
            onClick={handleApplyPrice}
            className="font-medium text-primary underline-offset-2 hover:underline disabled:opacity-50"
          >
            Usar esse preço
          </button>
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

      <Button type="submit" size="sm" disabled={isPending || isDetecting || !file} className="mt-1 self-start">
        {isPending ? "Enviando..." : "Confirmar envio"}
      </Button>

      {hasMesh ? <span className="text-xs text-muted-foreground">Malha 3D cadastrada ✓</span> : null}
      {success ? <span className="text-xs font-medium text-primary">Arquivo enviado com sucesso.</span> : null}
      {error ? <span className="text-xs text-destructive">{error}</span> : null}
    </form>
  );
}
