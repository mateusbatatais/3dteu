import { desc, eq } from "drizzle-orm";

import { db } from "@/server/db/client";
import { orders, payments } from "@/server/db/schema";

export async function getOrderByToken(token: string) {
  return db.query.orders.findFirst({
    where: eq(orders.publicToken, token),
    with: {
      items: true,
      payments: { orderBy: [desc(payments.createdAt)] },
    },
  });
}

export async function getAllOrdersForAdmin() {
  return db.query.orders.findMany({
    orderBy: [desc(orders.createdAt)],
  });
}

export async function getOrderByIdForAdmin(id: string) {
  return db.query.orders.findFirst({
    where: eq(orders.id, id),
    with: {
      items: true,
      payments: { orderBy: [desc(payments.createdAt)] },
      shipment: true,
    },
  });
}

export type OrderWithItems = NonNullable<Awaited<ReturnType<typeof getOrderByToken>>>;
