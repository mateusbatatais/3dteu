"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";

import { db } from "@/server/db/client";
import { orderStatusEnum, orders } from "@/server/db/schema";

import type { OrderStatus } from "./types";

const ORDER_STATUSES = orderStatusEnum.enumValues;

export interface UpdateOrderStatusResult {
  error?: string;
}

export async function updateOrderStatus(orderId: string, status: string): Promise<UpdateOrderStatusResult> {
  if (!ORDER_STATUSES.includes(status as (typeof ORDER_STATUSES)[number])) {
    return { error: "Status inválido." };
  }

  await db
    .update(orders)
    .set({ status: status as OrderStatus, updatedAt: new Date() })
    .where(eq(orders.id, orderId));

  revalidatePath("/admin/pedidos");
  revalidatePath(`/admin/pedidos/${orderId}`);
  return {};
}
