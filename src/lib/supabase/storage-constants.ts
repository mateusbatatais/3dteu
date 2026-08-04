// Separado de storage.ts (que usa a service role key, só servidor) porque
// estas constantes também são usadas em Client Components.
export const MODELS_BUCKET = "models";

// Teto do plano gratuito do Supabase (Storage > Configuration > Global file
// size limit) — não dá pra passar disso sem virar plano pago. Ver
// scripts/storage-setup.sql para o limite configurado no bucket em si.
export const MAX_MESH_FILE_SIZE_BYTES = 50 * 1024 * 1024;
