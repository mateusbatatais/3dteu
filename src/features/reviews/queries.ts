import { avg, count, desc, eq } from "drizzle-orm";

import { db } from "@/server/db/client";
import { productReviews } from "@/server/db/schema";

export async function getProductReviews(productId: string) {
  return db.query.productReviews.findMany({
    where: eq(productReviews.productId, productId),
    orderBy: [desc(productReviews.createdAt)],
  });
}

export async function getProductRatingSummary(productId: string) {
  const [row] = await db
    .select({ averageRating: avg(productReviews.rating), reviewCount: count() })
    .from(productReviews)
    .where(eq(productReviews.productId, productId));

  return {
    averageRating: row?.averageRating ? Number(row.averageRating) : null,
    reviewCount: row?.reviewCount ?? 0,
  };
}
