// Separado de storage.ts (que usa a service role key, só servidor) porque
// estas constantes também são usadas em Client Components.
export const MODELS_BUCKET = "models";

// Teto do plano gratuito do Supabase (Storage > Configuration > Global file
// size limit) — não dá pra passar disso sem virar plano pago. Ver
// scripts/storage-setup.sql para o limite configurado no bucket em si.
export const MAX_MESH_FILE_SIZE_BYTES = 50 * 1024 * 1024;

// Formatos de malha 3D aceitos no upload — usado tanto na validação do
// cliente (MeshUploadForm) quanto no servidor (createMeshUploadUrl), pra não
// desalinhar as duas listas.
export const ALLOWED_MESH_EXTENSIONS = ["stl", "obj", "3mf"] as const;
export type MeshExtension = (typeof ALLOWED_MESH_EXTENSIONS)[number];

export function getMeshExtension(filename: string): MeshExtension | null {
  const ext = filename.toLowerCase().split(".").pop();
  return (ALLOWED_MESH_EXTENSIONS as readonly string[]).includes(ext ?? "") ? (ext as MeshExtension) : null;
}
