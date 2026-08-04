"use client";

import { useId, useState, useTransition } from "react";

import { Button } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/client";
import { getMeshExtension, MAX_MESH_FILE_SIZE_BYTES, MODELS_BUCKET } from "@/lib/supabase/storage-constants";

import { confirmPartMesh, createMeshUploadUrl } from "../actions";

const CONTENT_TYPE_BY_EXTENSION: Record<string, string> = {
  stl: "model/stl",
  obj: "model/obj",
  "3mf": "model/3mf",
};

function formatMegabytes(bytes: number): string {
  return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
}

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

  function handleFileChange(event: React.ChangeEvent<HTMLInputElement>) {
    const selected = event.target.files?.[0] ?? null;
    setSuccess(false);
    setError(null);

    if (!selected) {
      setFile(null);
      return;
    }

    if (!getMeshExtension(selected.name)) {
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

      <Button type="submit" size="sm" disabled={isPending || !file} className="mt-1 self-start">
        {isPending ? "Enviando..." : "Confirmar envio"}
      </Button>

      {hasMesh ? <span className="text-xs text-muted-foreground">Malha 3D cadastrada ✓</span> : null}
      {success ? <span className="text-xs font-medium text-primary">Arquivo enviado com sucesso.</span> : null}
      {error ? <span className="text-xs text-destructive">{error}</span> : null}
    </form>
  );
}
