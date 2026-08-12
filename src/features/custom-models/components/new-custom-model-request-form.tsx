"use client";

import { useRouter } from "next/navigation";
import { useId, useRef, useState, useTransition } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { measureMesh, type MeshMeasurements } from "@/features/catalog/mesh-measure";
import { createClient } from "@/lib/supabase/client";
import {
  ALLOWED_MEDIA_EXTENSIONS,
  ALLOWED_MESH_EXTENSIONS,
  CUSTOM_MODEL_PHOTOS_BUCKET,
  getMediaExtension,
  getMeshExtension,
  MAX_CUSTOM_MODEL_PHOTO_BYTES,
  MAX_MESH_FILE_SIZE_BYTES,
  MESH_CONTENT_TYPE_BY_EXTENSION,
  MODELS_BUCKET,
} from "@/lib/supabase/storage-constants";

import { createCustomModelPhotoUploadUrl, createDirectMeshUploadUrl, submitCustomModelRequest, submitDirectMeshModelRequest } from "../actions";

const MAX_PHOTOS = 4;
type Mode = "ai" | "upload";

function formatMegabytes(bytes: number): string {
  return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
}

/**
 * Fase 4 do ROADMAP.md: cliente descreve o que quer imprimir + sobe 1-4
 * fotos do mesmo objeto por ângulos diferentes, e a IA gera um modelo.
 *
 * Fase 4b: cliente que já TEM o próprio arquivo 3D pula a geração
 * inteira — toggle no topo escolhe entre os dois modos, ambos terminando
 * no mesmo `/conta/modelo-3d/[id]` (que já sabe renderizar tanto o estado
 * "gerando" quanto "pronto" direto, sem mudança nenhuma). Mesmo padrão de
 * dropzone + upload direto pro Supabase Storage já usado em
 * MeshUploadForm/NewProductForm em ambos os modos — só muda o bucket.
 */
export function NewCustomModelRequestForm() {
  const router = useRouter();
  const inputId = useId();
  const meshInputId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const meshInputRef = useRef<HTMLInputElement>(null);

  const [mode, setMode] = useState<Mode>("ai");
  const [description, setDescription] = useState("");
  const [photos, setPhotos] = useState<File[]>([]);
  const [meshFile, setMeshFile] = useState<File | null>(null);
  const [meshMeasurements, setMeshMeasurements] = useState<MeshMeasurements | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isDraggingOver, setIsDraggingOver] = useState(false);
  const [isPending, startTransition] = useTransition();

  function addPhotos(files: FileList | File[]) {
    setError(null);
    const incoming = Array.from(files);

    for (const file of incoming) {
      if (!getMediaExtension(file.name)) {
        setError(`"${file.name}" não é ${ALLOWED_MEDIA_EXTENSIONS.join("/")}.`);
        return;
      }
      if (file.size > MAX_CUSTOM_MODEL_PHOTO_BYTES) {
        setError(`"${file.name}" tem ${formatMegabytes(file.size)} — o máximo por foto é ${formatMegabytes(MAX_CUSTOM_MODEL_PHOTO_BYTES)}.`);
        return;
      }
    }

    setPhotos((prev) => {
      const next = [...prev, ...incoming].slice(0, MAX_PHOTOS);
      return next;
    });
  }

  function removePhoto(index: number) {
    setPhotos((prev) => prev.filter((_, i) => i !== index));
  }

  function selectMeshFile(selected: File) {
    setError(null);
    setMeshMeasurements(null);

    const extension = getMeshExtension(selected.name);
    if (!extension) {
      setError("Formato não suportado. Use .stl, .obj ou .3mf.");
      return;
    }
    if (selected.size > MAX_MESH_FILE_SIZE_BYTES) {
      setError(`Esse arquivo tem ${formatMegabytes(selected.size)}, e o máximo é ${formatMegabytes(MAX_MESH_FILE_SIZE_BYTES)}.`);
      return;
    }

    setMeshFile(selected);
    // Só pra feedback imediato — a medida que vale pro preço é sempre
    // remedida no servidor a partir do arquivo de verdade (nunca confia
    // no que o navegador calculou).
    measureMesh(selected, extension).then(setMeshMeasurements);
  }

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    if (!description.trim()) {
      setError(mode === "ai" ? "Descreva o que você quer imprimir." : "Escreva uma breve descrição da peça.");
      return;
    }

    if (mode === "ai") {
      if (photos.length === 0) {
        setError("Envie pelo menos 1 foto.");
        return;
      }

      startTransition(async () => {
        const supabase = createClient();
        const photoPaths: string[] = [];

        for (const photo of photos) {
          const extension = getMediaExtension(photo.name)!;
          const prepared = await createCustomModelPhotoUploadUrl(extension);
          if (prepared.error || !prepared.path || !prepared.token) {
            setError(prepared.error ?? "Falha ao preparar o upload.");
            return;
          }

          const { error: uploadError } = await supabase.storage
            .from(CUSTOM_MODEL_PHOTOS_BUCKET)
            .uploadToSignedUrl(prepared.path, prepared.token, photo);
          if (uploadError) {
            setError(`Falha ao enviar "${photo.name}": ${uploadError.message}`);
            return;
          }

          photoPaths.push(prepared.path);
        }

        const result = await submitCustomModelRequest({ description, photoPaths });
        if (result.error || !result.requestId) {
          setError(result.error ?? "Não foi possível criar o pedido.");
          return;
        }

        toast.success("Pedido enviado — a IA já está gerando o modelo.");
        router.push(`/conta/modelo-3d/${result.requestId}`);
      });
      return;
    }

    // mode === "upload"
    const extension = meshFile ? getMeshExtension(meshFile.name) : null;
    if (!meshFile || !extension) {
      setError("Escolha um arquivo .stl, .obj ou .3mf primeiro.");
      return;
    }

    startTransition(async () => {
      const prepared = await createDirectMeshUploadUrl(extension);
      if (prepared.error || !prepared.path || !prepared.token) {
        setError(prepared.error ?? "Falha ao preparar o upload.");
        return;
      }

      const supabase = createClient();
      const { error: uploadError } = await supabase.storage
        .from(MODELS_BUCKET)
        .uploadToSignedUrl(prepared.path, prepared.token, meshFile, {
          contentType: MESH_CONTENT_TYPE_BY_EXTENSION[extension],
        });
      if (uploadError) {
        setError(`Falha ao enviar o arquivo: ${uploadError.message}`);
        return;
      }

      const result = await submitDirectMeshModelRequest({ description, meshPath: prepared.path, extension });
      if (result.error || !result.requestId) {
        setError(result.error ?? "Não foi possível processar o arquivo.");
        return;
      }

      toast.success("Arquivo recebido — já dá pra escolher material e ver o preço.");
      router.push(`/conta/modelo-3d/${result.requestId}`);
    });
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4 rounded-xl bg-card p-4 ring-1 ring-foreground/10">
      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          variant={mode === "ai" ? "default" : "outline"}
          size="sm"
          onClick={() => {
            setMode("ai");
            setError(null);
          }}
        >
          Quero que a IA gere um modelo
        </Button>
        <Button
          type="button"
          variant={mode === "upload" ? "default" : "outline"}
          size="sm"
          onClick={() => {
            setMode("upload");
            setError(null);
          }}
        >
          Já tenho o arquivo 3D
        </Button>
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="description">{mode === "ai" ? "O que você quer imprimir?" : "Alguma observação sobre a peça?"}</Label>
        <Textarea
          id="description"
          value={description}
          onChange={(event) => setDescription(event.target.value)}
          placeholder={
            mode === "ai"
              ? "Ex.: um porta-chaves em formato do meu cachorro, uns 8cm de altura"
              : "Ex.: quero em outra cor, é pra presente..."
          }
          rows={3}
        />
      </div>

      {mode === "ai" ? (
        <div className="flex flex-col gap-2">
          <Label>Fotos (1 a {MAX_PHOTOS}, mesmo objeto em ângulos diferentes)</Label>
          <div
            onClick={() => inputRef.current?.click()}
            onDragOver={(event) => {
              event.preventDefault();
              setIsDraggingOver(true);
            }}
            onDragLeave={() => setIsDraggingOver(false)}
            onDrop={(event) => {
              event.preventDefault();
              setIsDraggingOver(false);
              if (event.dataTransfer.files?.length) addPhotos(event.dataTransfer.files);
            }}
            role="button"
            tabIndex={0}
            onKeyDown={(event) => {
              if (event.key === "Enter" || event.key === " ") inputRef.current?.click();
            }}
            className={`flex cursor-pointer flex-col items-center gap-2 rounded-xl border-2 border-dashed p-6 text-center transition-colors ${
              isDraggingOver ? "border-primary bg-primary/5" : "border-border hover:border-primary/60 hover:bg-muted/40"
            }`}
          >
            <p className="text-sm font-semibold">Arraste as fotos aqui ou clique pra escolher</p>
            <p className="text-[11px] text-muted-foreground">
              {ALLOWED_MEDIA_EXTENSIONS.join(", ").toUpperCase()} — máximo {formatMegabytes(MAX_CUSTOM_MODEL_PHOTO_BYTES)}{" "}
              por foto
            </p>
            <input
              ref={inputRef}
              id={inputId}
              type="file"
              accept="image/*"
              multiple
              onChange={(event) => {
                if (event.target.files?.length) addPhotos(event.target.files);
                event.target.value = "";
              }}
              onClick={(event) => event.stopPropagation()}
              className="sr-only"
            />
          </div>

          {photos.length > 0 ? (
            <ul className="flex flex-wrap gap-2">
              {photos.map((photo, index) => (
                <li key={`${photo.name}-${index}`} className="flex items-center gap-1.5 rounded-md bg-muted px-2 py-1 text-xs">
                  {photo.name}
                  <button
                    type="button"
                    onClick={() => removePhoto(index)}
                    className="text-muted-foreground hover:text-destructive"
                    aria-label={`Remover ${photo.name}`}
                  >
                    ×
                  </button>
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          <Label>Arquivo 3D</Label>
          <div
            onClick={() => meshInputRef.current?.click()}
            onDragOver={(event) => {
              event.preventDefault();
              setIsDraggingOver(true);
            }}
            onDragLeave={() => setIsDraggingOver(false)}
            onDrop={(event) => {
              event.preventDefault();
              setIsDraggingOver(false);
              const dropped = event.dataTransfer.files?.[0];
              if (dropped) selectMeshFile(dropped);
            }}
            role="button"
            tabIndex={0}
            onKeyDown={(event) => {
              if (event.key === "Enter" || event.key === " ") meshInputRef.current?.click();
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
            <p className="text-sm font-semibold">Enviar arquivo 3D</p>
            <p className="text-xs text-muted-foreground">
              Arraste o arquivo aqui ou <span className="font-medium text-primary underline-offset-2">clique pra escolher</span>
            </p>
            <p className="text-[11px] text-muted-foreground">
              {ALLOWED_MESH_EXTENSIONS.join(", ").toUpperCase()} — máximo {formatMegabytes(MAX_MESH_FILE_SIZE_BYTES)}
            </p>
            <input
              ref={meshInputRef}
              id={meshInputId}
              type="file"
              accept=".stl,.obj,.3mf"
              onChange={(event) => {
                const selected = event.target.files?.[0];
                if (selected) selectMeshFile(selected);
                event.target.value = "";
              }}
              onClick={(event) => event.stopPropagation()}
              className="sr-only"
            />
          </div>

          {meshFile ? (
            <p className="text-xs text-muted-foreground">
              Selecionado: <span className="font-medium text-foreground">{meshFile.name}</span> ({formatMegabytes(meshFile.size)})
            </p>
          ) : null}

          {meshMeasurements ? (
            <p className="text-xs text-muted-foreground">
              Detectamos: {(meshMeasurements.widthMm / 10).toFixed(1)} × {(meshMeasurements.heightMm / 10).toFixed(1)} ×{" "}
              {(meshMeasurements.depthMm / 10).toFixed(1)} cm.
            </p>
          ) : null}
        </div>
      )}

      {error ? <p className="text-sm text-destructive">{error}</p> : null}

      <Button type="submit" disabled={isPending} className="self-start">
        {isPending ? "Enviando..." : mode === "ai" ? "Pedir modelo customizado" : "Enviar arquivo pra orçamento"}
      </Button>
    </form>
  );
}
