"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { db } from "@/server/db/client";
import { products } from "@/server/db/schema";

import { productFormSchema, type ProductFormValues } from "./schemas";

export interface ProductActionResult {
  error?: string;
}

function isUniqueViolation(error: unknown): boolean {
  return typeof error === "object" && error !== null && (error as { code?: string }).code === "23505";
}

function toRow(values: ProductFormValues) {
  return {
    name: values.name,
    slug: values.slug,
    description: values.description || null,
    categoryId: values.categoryId || null,
    basePriceCents: Math.round(values.basePriceReais * 100),
    status: values.status,
  };
}

export async function createProduct(values: ProductFormValues): Promise<ProductActionResult> {
  const parsed = productFormSchema.safeParse(values);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Dados inválidos." };
  }

  let productId: string;
  try {
    const [row] = await db.insert(products).values(toRow(parsed.data)).returning({ id: products.id });
    productId = row.id;
  } catch (error) {
    return {
      error: isUniqueViolation(error) ? "Já existe um produto com esse slug." : "Não foi possível salvar o produto.",
    };
  }

  revalidatePath("/admin/produtos");
  redirect(`/admin/produtos/${productId}`);
}

export async function updateProduct(id: string, values: ProductFormValues): Promise<ProductActionResult> {
  const parsed = productFormSchema.safeParse(values);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Dados inválidos." };
  }

  try {
    await db.update(products).set(toRow(parsed.data)).where(eq(products.id, id));
  } catch (error) {
    return {
      error: isUniqueViolation(error) ? "Já existe um produto com esse slug." : "Não foi possível salvar o produto.",
    };
  }

  revalidatePath("/admin/produtos");
  revalidatePath(`/admin/produtos/${id}`);
  return {};
}
