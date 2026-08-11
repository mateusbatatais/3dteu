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

// Usado por qualquer upload direto pro Storage (signed URL) que precisa
// declarar o content-type certo — MeshUploadForm e NewProductForm.
export const MESH_CONTENT_TYPE_BY_EXTENSION: Record<MeshExtension, string> = {
  stl: "model/stl",
  obj: "model/obj",
  "3mf": "model/3mf",
};

// Bucket separado do de malhas 3D — fotos/gifs do produto impresso, usadas
// na galeria da página pública e como imagem de Open Graph.
export const MEDIA_BUCKET = "product-media";

// Fotos/gifs não precisam do teto de 50MB usado pra malha 3D.
export const MAX_MEDIA_FILE_SIZE_BYTES = 10 * 1024 * 1024;

export const ALLOWED_MEDIA_EXTENSIONS = ["jpg", "jpeg", "png", "webp", "gif"] as const;
export type MediaExtension = (typeof ALLOWED_MEDIA_EXTENSIONS)[number];

export function getMediaExtension(filename: string): MediaExtension | null {
  const ext = filename.toLowerCase().split(".").pop();
  return (ALLOWED_MEDIA_EXTENSIONS as readonly string[]).includes(ext ?? "") ? (ext as MediaExtension) : null;
}

// Fase 4 do ROADMAP.md: fotos que o cliente sobe pra pedir um modelo 3D
// customizado via IA — bucket separado do de mídia da loja (product-media)
// porque é conteúdo enviado por cliente, não curado pelo admin. Precisa ser
// público: a Meshy busca a foto pela URL.
export const CUSTOM_MODEL_PHOTOS_BUCKET = "custom-model-photos";
export const MAX_CUSTOM_MODEL_PHOTO_BYTES = 10 * 1024 * 1024;
