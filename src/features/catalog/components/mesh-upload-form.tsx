"use client";

import { useId, useState, useTransition } from "react";

import { Button } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/client";
import { MODELS_BUCKET } from "@/lib/supabase/storage-constants";

import { confirmPartMesh, createMeshUploadUrl } from "../actions";

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
  const [file, setFile] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [isPending, startTransition] = useTransition();

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setSuccess(false);

    if (!file) {
      setError("Escolha um arquivo .stl primeiro.");
      return;
    }
    if (!file.name.toLowerCase().endsWith(".stl")) {
      setError("Só arquivos .stl são aceitos.");
      return;
    }

    startTransition(async () => {
      // 1) Pede uma URL de upload assinada — não passa o arquivo pelo servidor.
      const prepared = await createMeshUploadUrl(partId);
      if (prepared.error || !prepared.path || !prepared.token) {
        setError(prepared.error ?? "Falha ao preparar o upload.");
        return;
      }

      // 2) Envia o arquivo direto do navegador pro Supabase Storage.
      const supabase = createClient();
      const { error: uploadError } = await supabase.storage
        .from(MODELS_BUCKET)
        .uploadToSignedUrl(prepared.path, prepared.token, file, { contentType: "model/stl" });
      if (uploadError) {
        setError(`Falha ao enviar o arquivo: ${uploadError.message}`);
        return;
      }

      // 3) Confirma no servidor: grava a URL pública na parte do produto.
      const confirmed = await confirmPartMesh(productId, partId, prepared.path);
      if (confirmed.error) {
        setError(confirmed.error);
        return;
      }

      setFile(null);
      setSuccess(true);
    });
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-2 border-t pt-3">
      <label htmlFor={inputId} className="text-sm font-medium">
        {hasMesh ? "Substituir o arquivo .stl" : "Enviar arquivo .stl"}
      </label>
      <input
        id={inputId}
        type="file"
        accept=".stl"
        onChange={(event) => {
          setFile(event.target.files?.[0] ?? null);
          setError(null);
          setSuccess(false);
        }}
        className="text-sm"
      />
      <Button type="submit" size="sm" variant="outline" disabled={isPending || !file} className="mt-1 self-start">
        {isPending ? "Enviando..." : "Confirmar envio"}
      </Button>
      {hasMesh ? <span className="text-xs text-muted-foreground">Malha 3D cadastrada ✓</span> : null}
      {success ? <span className="text-xs text-primary">Arquivo enviado com sucesso.</span> : null}
      {error ? <span className="text-xs text-destructive">{error}</span> : null}
    </form>
  );
}
