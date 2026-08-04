"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";

import { db } from "@/server/db/client";
import { orderStatusEnum, orders } from "@/server/db/schema";

const ORDER_STATUSES = orderStatusEnum.enumValues;

export async function updateOrderStatus(orderId: string, formData: FormData) {
  const status = String(formData.get("status") ?? "");
  if (!ORDER_STATUSES.includes(status as (typeof ORDER_STATUSES)[number])) return;

  await db
    .update(orders)
    .set({ status: status as (typeof ORDER_STATUSES)[number], updatedAt: new Date() })
    .where(eq(orders.id, orderId));

  revalidatePath("/admin/pedidos");
  revalidatePath(`/admin/pedidos/${orderId}`);
}
