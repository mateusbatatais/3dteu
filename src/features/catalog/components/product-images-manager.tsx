"use client";

import Image from "next/image";
import { useId, useRef, useState, useTransition } from "react";

import { ConfirmDeleteButton } from "@/components/confirm-delete-button";
import { Button } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/client";
import {
  ALLOWED_MEDIA_EXTENSIONS,
  ALLOWED_MEDIA_EXTENSIONS_ACCEPT,
  getMediaExtension,
  MAX_MEDIA_FILE_SIZE_BYTES,
  MEDIA_BUCKET,
  MEDIA_CONTENT_TYPE_BY_EXTENSION,
} from "@/lib/supabase/storage-constants";

import { confirmProductImage, createProductImageUploadUrl, deleteProductImage } from "../actions";

function formatMegabytes(bytes: number): string {
  return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
}

interface ProductImageRow {
  id: string;
  url: string;
}

export function ProductImagesManager({ productId, images }: { productId: string; images: ProductImageRow[] }) {
  const inputId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isDraggingOver, setIsDraggingOver] = useState(false);
  const [isPending, startTransition] = useTransition();

  function processSelectedFile(selected: File) {
    setError(null);

    if (!getMediaExtension(selected.name)) {
      setError(`Formato não suportado. Use ${ALLOWED_MEDIA_EXTENSIONS.join(", ")}.`);
      setFile(null);
      return;
    }

    if (selected.size > MAX_MEDIA_FILE_SIZE_BYTES) {
      setError(`Esse arquivo tem ${formatMegabytes(selected.size)}, e o máximo é ${formatMegabytes(MAX_MEDIA_FILE_SIZE_BYTES)}.`);
      setFile(null);
      return;
    }

    setFile(selected);
  }

  function handleFileChange(event: React.ChangeEvent<HTMLInputElement>) {
    const selected = event.target.files?.[0];
    event.target.value = "";
    if (selected) processSelectedFile(selected);
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

    const extension = file ? getMediaExtension(file.name) : null;
    if (!file || !extension) {
      setError("Escolha uma imagem primeiro.");
      return;
    }

    startTransition(async () => {
      const prepared = await createProductImageUploadUrl(productId, extension);
      if (prepared.error || !prepared.path || !prepared.token) {
        setError(prepared.error ?? "Falha ao preparar o upload.");
        return;
      }

      const supabase = createClient();
      const { error: uploadError } = await supabase.storage
        .from(MEDIA_BUCKET)
        .uploadToSignedUrl(prepared.path, prepared.token, file, {
          contentType: MEDIA_CONTENT_TYPE_BY_EXTENSION[extension],
        });
      if (uploadError) {
        setError(`Falha ao enviar o arquivo: ${uploadError.message}`);
        return;
      }

      const confirmed = await confirmProductImage(productId, prepared.path);
      if (confirmed.error) {
        setError(confirmed.error);
        return;
      }

      setFile(null);
    });
  }

  return (
    <div>
      <h2 className="text-lg font-medium">Fotos e gifs do produto</h2>
      <p className="mt-1 text-sm text-muted-foreground">
        Complementam o preview 3D — aparecem na galeria da página do produto e como imagem de compartilhamento. A
        primeira foto é usada como capa.
      </p>

      {images.length > 0 ? (
        <div className="mt-4 flex flex-wrap gap-3">
          {images.map((image, index) => (
            <div key={image.id} className="relative">
              <Image
                src={image.url}
                alt=""
                width={96}
                height={96}
                unoptimized
                className="size-24 rounded-lg object-cover ring-1 ring-foreground/10"
              />
              {index === 0 ? (
                <span className="absolute left-1 top-1 rounded bg-background/80 px-1 text-[10px] font-medium">
                  Capa
                </span>
              ) : null}
              <ConfirmDeleteButton
                action={deleteProductImage.bind(null, productId, image.id)}
                label="×"
                description="Excluir esta imagem? Se ela for a capa, a próxima da lista assume o lugar."
                className="absolute -right-1.5 -top-1.5 size-5 rounded-full bg-destructive p-0 text-xs text-destructive-foreground shadow hover:bg-destructive/90"
              />
            </div>
          ))}
        </div>
      ) : null}

      <form onSubmit={handleSubmit} className="mt-4 flex max-w-sm flex-col gap-2">
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
          <p className="text-sm font-semibold">Enviar foto ou gif</p>
          <p className="text-xs text-muted-foreground">
            Arraste o arquivo aqui ou <span className="font-medium text-primary underline-offset-2">clique pra escolher</span>
          </p>
          <p className="text-[11px] text-muted-foreground">
            {ALLOWED_MEDIA_EXTENSIONS.join(", ").toUpperCase()} — máximo {formatMegabytes(MAX_MEDIA_FILE_SIZE_BYTES)}
          </p>
          <input
            ref={inputRef}
            id={inputId}
            type="file"
            accept={ALLOWED_MEDIA_EXTENSIONS_ACCEPT}
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

        <Button type="submit" size="sm" disabled={isPending || !file} className="mt-1 self-start">
          {isPending ? "Enviando..." : "Enviar"}
        </Button>

        {error ? <span className="text-xs text-destructive">{error}</span> : null}
      </form>
    </div>
  );
}
