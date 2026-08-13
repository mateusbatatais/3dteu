"use client";

import { useRef, useState, useTransition } from "react";
import { toast } from "sonner";
import type { OrbitControls as OrbitControlsImpl } from "three-stdlib";

import { Button } from "@/components/ui/button";
import { updateProductViewerAngle } from "@/features/catalog/actions";

import { ProductViewer3D, type ViewerPart } from "./product-viewer-3d";

// Preview interativo da montagem inteira (todas as peças, não uma só —
// diferente do PartThumbnailCapture, que continua existindo do jeito que
// está, só pra gerar fotos de catálogo). O admin gira até achar um
// enquadramento bom e salva a posição atual da câmera como o ângulo
// inicial que o cliente vê ao abrir a página do produto.
export function ProductViewerAngleControl({
  productId,
  parts,
  initialCameraPosition,
}: {
  productId: string;
  parts: ViewerPart[];
  initialCameraPosition: { x: number; y: number; z: number } | null;
}) {
  const controlsRef = useRef<OrbitControlsImpl | null>(null);
  const [isPending, startTransition] = useTransition();
  const [hasCustomAngle, setHasCustomAngle] = useState(initialCameraPosition !== null);

  function handleSetAngle() {
    const controls = controlsRef.current;
    if (!controls) return;
    const { x, y, z } = controls.object.position;

    startTransition(async () => {
      const result = await updateProductViewerAngle(productId, { x, y, z });
      if (result.error) {
        toast.error(result.error);
        return;
      }
      setHasCustomAngle(true);
      toast.success("Ângulo salvo — é o que o cliente vê ao abrir a página do produto.");
    });
  }

  function handleReset() {
    startTransition(async () => {
      const result = await updateProductViewerAngle(productId, null);
      if (result.error) {
        toast.error(result.error);
        return;
      }
      setHasCustomAngle(false);
      toast.success("Voltou pro ângulo padrão.");
    });
  }

  return (
    <div className="max-w-xs">
      <ProductViewer3D
        parts={parts}
        initialCameraPosition={initialCameraPosition}
        onControlsReady={(controls) => {
          controlsRef.current = controls;
        }}
      />
      <p className="mt-1.5 text-center text-[11px] text-muted-foreground">Arraste pra girar, role pra dar zoom</p>
      <div className="mt-1.5 flex gap-2">
        <Button type="button" size="sm" variant="outline" disabled={isPending} onClick={handleSetAngle} className="flex-1">
          {isPending ? "Salvando..." : "Usar este ângulo como padrão"}
        </Button>
        {hasCustomAngle ? (
          <Button type="button" size="sm" variant="ghost" disabled={isPending} onClick={handleReset}>
            Restaurar padrão
          </Button>
        ) : null}
      </div>
    </div>
  );
}
