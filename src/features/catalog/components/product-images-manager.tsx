"use client";

import Image from "next/image";
import { useId, useState, useTransition } from "react";

import { ConfirmDeleteButton } from "@/components/confirm-delete-button";
import { Button } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/client";
import { getMediaExtension, MAX_MEDIA_FILE_SIZE_BYTES, MEDIA_BUCKET } from "@/lib/supabase/storage-constants";

import { confirmProductImage, createProductImageUploadUrl, deleteProductImage } from "../actions";

const CONTENT_TYPE_BY_EXTENSION: Record<string, string> = {
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
  gif: "image/gif",
};

function formatMegabytes(bytes: number): string {
  return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
}

interface ProductImageRow {
  id: string;
  url: string;
}

export function ProductImagesManager({ productId, images }: { productId: string; images: ProductImageRow[] }) {
  const inputId = useId();
  const [file, setFile] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleFileChange(event: React.ChangeEvent<HTMLInputElement>) {
    const selected = event.target.files?.[0] ?? null;
    setError(null);

    if (!selected) {
      setFile(null);
      return;
    }

    if (!getMediaExtension(selected.name)) {
      setError("Formato não suportado. Use jpg, png, webp ou gif.");
      setFile(null);
      event.target.value = "";
      return;
    }

    if (selected.size > MAX_MEDIA_FILE_SIZE_BYTES) {
      setError(`Esse arquivo tem ${formatMegabytes(selected.size)}, e o máximo é ${formatMegabytes(MAX_MEDIA_FILE_SIZE_BYTES)}.`);
      setFile(null);
      event.target.value = "";
      return;
    }

    setFile(selected);
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
          contentType: CONTENT_TYPE_BY_EXTENSION[extension],
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

      <form
        onSubmit={handleSubmit}
        className="mt-4 flex max-w-sm flex-col gap-2 rounded-lg border-2 border-dashed border-border p-3"
      >
        <div className="flex items-center justify-between">
          <label htmlFor={inputId} className="text-sm font-medium">
            Adicionar foto/gif
          </label>
          <span className="text-xs text-muted-foreground">Máximo {formatMegabytes(MAX_MEDIA_FILE_SIZE_BYTES)}</span>
        </div>

        <input id={inputId} type="file" accept=".jpg,.jpeg,.png,.webp,.gif" onChange={handleFileChange} className="text-sm" />

        {file ? (
          <p className="text-xs text-muted-foreground">
            Selecionado: {file.name} ({formatMegabytes(file.size)})
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
