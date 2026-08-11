import { createClient } from "@supabase/supabase-js";

export { CUSTOM_MODEL_PHOTOS_BUCKET, MEDIA_BUCKET, MODELS_BUCKET } from "./storage-constants";

/**
 * Cliente com a service role key, só para uso em Server Actions/rotas de
 * servidor que precisam gravar no Storage (bypassa RLS). Nunca importar isto
 * em um Client Component.
 */
export function createStorageClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !serviceRoleKey) {
    throw new Error("NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY não configuradas.");
  }

  return createClient(url, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}
