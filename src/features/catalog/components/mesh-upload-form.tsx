"use client";

import { useActionState } from "react";

import { Button } from "@/components/ui/button";
import { uploadPartMesh, type UploadMeshResult } from "../actions";

const initialState: UploadMeshResult = {};

export function MeshUploadForm({
  productId,
  partId,
  hasMesh,
}: {
  productId: string;
  partId: string;
  hasMesh: boolean;
}) {
  const [state, formAction, isPending] = useActionState(
    (_prevState: UploadMeshResult, formData: FormData) => uploadPartMesh(productId, partId, formData),
    initialState,
  );

  return (
    <form action={formAction} className="mt-3 flex flex-wrap items-center gap-3 border-t pt-3">
      <input type="file" name="file" accept=".stl" required className="text-sm" />
      <Button type="submit" size="sm" variant="outline" disabled={isPending}>
        {isPending ? "Enviando..." : hasMesh ? "Substituir STL" : "Enviar STL"}
      </Button>
      {hasMesh ? <span className="text-xs text-muted-foreground">Malha 3D cadastrada ✓</span> : null}
      {state.error ? <span className="text-xs text-destructive">{state.error}</span> : null}
    </form>
  );
}
