"use client";

import { useRouter } from "next/navigation";
import { useId, useRef, useState, useTransition } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { createClient } from "@/lib/supabase/client";
import { ALLOWED_MEDIA_EXTENSIONS, CUSTOM_MODEL_PHOTOS_BUCKET, getMediaExtension, MAX_CUSTOM_MODEL_PHOTO_BYTES } from "@/lib/supabase/storage-constants";

import { createCustomModelPhotoUploadUrl, submitCustomModelRequest } from "../actions";

const MAX_PHOTOS = 4;

function formatMegabytes(bytes: number): string {
  return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
}

/**
 * Fase 4 do ROADMAP.md: cliente descreve o que quer imprimir + sobe 1-4
 * fotos do mesmo objeto por ângulos diferentes. Mesmo padrão de dropzone +
 * upload direto pro Supabase Storage já usado em MeshUploadForm/
 * NewProductForm — só muda o bucket (fotos do cliente, não arquivo 3D nem
 * mídia da loja).
 */
export function NewCustomModelRequestForm() {
  const router = useRouter();
  const inputId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const [description, setDescription] = useState("");
  const [photos, setPhotos] = useState<File[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [isDraggingOver, setIsDraggingOver] = useState(false);
  const [isPending, startTransition] = useTransition();

  function addPhotos(files: FileList | File[]) {
    setError(null);
    const incoming = Array.from(files);

    for (const file of incoming) {
      if (!getMediaExtension(file.name)) {
        setError(`"${file.name}" não é jpg/png/webp/gif.`);
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

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    if (!description.trim()) {
      setError("Descreva o que você quer imprimir.");
      return;
    }
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
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4 rounded-xl bg-card p-4 ring-1 ring-foreground/10">
      <div className="flex flex-col gap-2">
        <Label htmlFor="description">O que você quer imprimir?</Label>
        <Textarea
          id="description"
          value={description}
          onChange={(event) => setDescription(event.target.value)}
          placeholder="Ex.: um porta-chaves em formato do meu cachorro, uns 8cm de altura"
          rows={3}
        />
      </div>

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

      {error ? <p className="text-sm text-destructive">{error}</p> : null}

      <Button type="submit" disabled={isPending} className="self-start">
        {isPending ? "Enviando..." : "Pedir modelo customizado"}
      </Button>
    </form>
  );
}
