import { count, desc, eq, gte, inArray, sum } from "drizzle-orm";

import { db } from "@/server/db/client";
import { orders, payments, products } from "@/server/db/schema";

const PAID_ORDER_STATUSES = ["paid", "printing", "ready", "shipped", "delivered"] as const;

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

/** Histórico de pedidos de uma conta — só pedidos feitos com sessão ativa (customerId preenchido). */
export async function getOrdersByCustomerId(customerId: string) {
  return db.query.orders.findMany({
    where: eq(orders.customerId, customerId),
    orderBy: [desc(orders.createdAt)],
    with: { items: true },
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

export interface AdminDashboardStats {
  publishedProductCount: number;
  awaitingPaymentCount: number;
  ordersLast7DaysCount: number;
  totalRevenueCents: number;
}

/** Números reais pro dashboard do admin — substitui os 3 cards que só duplicavam o menu. */
export async function getAdminDashboardStats(): Promise<AdminDashboardStats> {
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

  const [[publishedProducts], [awaitingPayment], [last7Days], [revenue]] = await Promise.all([
    db.select({ value: count() }).from(products).where(eq(products.status, "published")),
    db.select({ value: count() }).from(orders).where(eq(orders.status, "awaiting_payment")),
    db.select({ value: count() }).from(orders).where(gte(orders.createdAt, sevenDaysAgo)),
    db
      .select({ value: sum(orders.totalCents) })
      .from(orders)
      .where(inArray(orders.status, PAID_ORDER_STATUSES)),
  ]);

  return {
    publishedProductCount: publishedProducts.value,
    awaitingPaymentCount: awaitingPayment.value,
    ordersLast7DaysCount: last7Days.value,
    totalRevenueCents: Number(revenue.value ?? 0),
  };
}
