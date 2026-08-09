"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";

import { createClient } from "@/lib/supabase/server";
import { db } from "@/server/db/client";
import { productReviews, products } from "@/server/db/schema";

export interface ReviewActionResult {
  error?: string;
}

export interface ReviewInput {
  rating: number;
  comment: string;
}

/**
 * Um cliente só tem uma avaliação por produto (índice único
 * product_id+customer_id) — enviar de novo atualiza a existente em vez de
 * duplicar, então o formulário funciona pra "criar" e "editar" com a mesma
 * action.
 */
export async function submitProductReview(productId: string, input: ReviewInput): Promise<ReviewActionResult> {
  if (!Number.isInteger(input.rating) || input.rating < 1 || input.rating > 5) {
    return { error: "Escolha uma nota de 1 a 5." };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { error: "Entre na sua conta pra avaliar este produto." };
  }

  const customerName =
    (typeof user.user_metadata?.name === "string" && user.user_metadata.name.trim()) ||
    user.email?.split("@")[0] ||
    "Cliente";
  const comment = input.comment.trim() || null;

  await db
    .insert(productReviews)
    .values({ productId, customerId: user.id, customerName, rating: input.rating, comment })
    .onConflictDoUpdate({
      target: [productReviews.productId, productReviews.customerId],
      set: { rating: input.rating, comment, customerName, updatedAt: new Date() },
    });

  const [product] = await db.select({ slug: products.slug }).from(products).where(eq(products.id, productId));
  if (product) revalidatePath(`/produtos/${product.slug}`);

  return {};
}
