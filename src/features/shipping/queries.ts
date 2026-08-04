import { eq } from "drizzle-orm";

import { db } from "@/server/db/client";
import { storeSettings } from "@/server/db/schema";

/** Linha única (id "default") com o endereço de remetente da loja. */
export async function getStoreSettings() {
  return db.query.storeSettings.findFirst({ where: eq(storeSettings.id, "default") });
}
