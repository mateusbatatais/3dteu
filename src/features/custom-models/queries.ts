import { desc, eq } from "drizzle-orm";

import { db } from "@/server/db/client";
import { customModelRequests } from "@/server/db/schema";

export async function getCustomModelRequestById(id: string) {
  return db.query.customModelRequests.findFirst({ where: eq(customModelRequests.id, id) });
}

export async function getCustomModelRequestsByCustomerId(customerId: string) {
  return db.query.customModelRequests.findMany({
    where: eq(customModelRequests.customerId, customerId),
    orderBy: [desc(customModelRequests.createdAt)],
  });
}

export type CustomModelRequest = NonNullable<Awaited<ReturnType<typeof getCustomModelRequestById>>>;
