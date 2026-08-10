"use client";

import { useRef, useState, useTransition } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/client";
import { MEDIA_BUCKET } from "@/lib/supabase/storage-constants";

import { confirmProductImage, createProductImageUploadUrl } from "../actions";
import { ProductViewer3D, type ViewerPart } from "./product-viewer-3d";

// Preview interativo (o admin pode girar/aproximar) com um botão que
// fotografa o ângulo atual do <canvas> e manda pra galeria do produto —
// resolve a peça sempre nascer virada de um jeito ruim: em vez de tentar
// adivinhar um enquadramento melhor, deixa o próprio admin escolher.
export function PartThumbnailCapture({
  productId,
  part,
  meshUrl,
}: {
  productId: string;
  part: ViewerPart;
  meshUrl: string | null;
}) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [isPending, startTransition] = useTransition();
  const [justCaptured, setJustCaptured] = useState(false);

  function handleCapture() {
    const canvas = canvasRef.current;
    if (!canvas) return;
    setJustCaptured(false);

    startTransition(async () => {
      const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/png"));
      if (!blob) {
        toast.error("Não foi possível capturar a imagem deste preview.");
        return;
      }

      const prepared = await createProductImageUploadUrl(productId, "png");
      if (prepared.error || !prepared.path || !prepared.token) {
        toast.error(prepared.error ?? "Falha ao preparar o upload.");
        return;
      }

      const supabase = createClient();
      const { error: uploadError } = await supabase.storage
        .from(MEDIA_BUCKET)
        .uploadToSignedUrl(prepared.path, prepared.token, blob, { contentType: "image/png" });
      if (uploadError) {
        toast.error(`Falha ao enviar a imagem: ${uploadError.message}`);
        return;
      }

      const confirmed = await confirmProductImage(productId, prepared.path);
      if (confirmed.error) {
        toast.error(confirmed.error);
        return;
      }

      setJustCaptured(true);
      toast.success("Foto adicionada à galeria do produto (aba Imagens).");
    });
  }

  return (
    <div className="w-full max-w-40 shrink-0">
      <ProductViewer3D
        parts={[part]}
        onCanvasReady={(canvas) => {
          canvasRef.current = canvas;
        }}
      />
      <p className="mt-1.5 text-center text-[11px] text-muted-foreground">Arraste pra girar, role pra dar zoom</p>
      {meshUrl ? (
        <a
          href={meshUrl}
          target="_blank"
          rel="noreferrer"
          className="mt-1 block break-all text-center text-xs text-muted-foreground underline-offset-2 hover:underline"
        >
          Ver arquivo enviado
        </a>
      ) : null}
      <Button
        type="button"
        size="sm"
        variant="outline"
        disabled={isPending}
        onClick={handleCapture}
        className="mt-1.5 w-full"
      >
        {isPending ? "Salvando..." : "Usar este ângulo como foto"}
      </Button>
      {justCaptured ? (
        <p className="mt-1 text-center text-[11px] font-medium text-primary">Adicionada à galeria ✓</p>
      ) : null}
    </div>
  );
}
