"use client";

import Image from "next/image";
import { useId, useState, useTransition } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/client";
import { getMediaExtension, MAX_MEDIA_FILE_SIZE_BYTES, MEDIA_BUCKET } from "@/lib/supabase/storage-constants";

import { confirmCategoryImage, createCategoryImageUploadUrl } from "../category-actions";

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

// Uma imagem por categoria (troca a anterior), não uma galeria — por isso o
// fluxo é mais simples que ProductImagesManager: sem lista, só "atual" +
// "trocar".
export function CategoryImageUpload({ categoryId, imageUrl }: { categoryId: string; imageUrl: string | null }) {
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

  function handleUpload() {
    const extension = file ? getMediaExtension(file.name) : null;
    if (!file || !extension) {
      setError("Escolha uma imagem primeiro.");
      return;
    }

    setError(null);
    startTransition(async () => {
      const prepared = await createCategoryImageUploadUrl(categoryId, extension);
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

      const confirmed = await confirmCategoryImage(categoryId, prepared.path);
      if (confirmed.error) {
        setError(confirmed.error);
        return;
      }

      setFile(null);
      toast.success("Imagem da categoria atualizada.");
    });
  }

  return (
    <div className="flex items-center gap-3">
      {imageUrl ? (
        <Image
          src={imageUrl}
          alt=""
          width={64}
          height={64}
          unoptimized
          className="size-16 shrink-0 rounded-lg object-cover ring-1 ring-foreground/10"
        />
      ) : (
        <div className="flex size-16 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-primary/20 to-brand-orange/20 text-[10px] text-muted-foreground ring-1 ring-foreground/10">
          sem foto
        </div>
      )}

      <div className="flex flex-col gap-1.5">
        <div className="flex items-center gap-2">
          <input id={inputId} type="file" accept=".jpg,.jpeg,.png,.webp,.gif" onChange={handleFileChange} className="text-xs" />
          <Button type="button" size="sm" variant="outline" disabled={isPending || !file} onClick={handleUpload}>
            {isPending ? "Enviando..." : "Enviar"}
          </Button>
        </div>
        <p className="text-xs text-muted-foreground">Banner da categoria — máximo {formatMegabytes(MAX_MEDIA_FILE_SIZE_BYTES)}.</p>
        {error ? <p className="text-xs text-destructive">{error}</p> : null}
      </div>
    </div>
  );
}
