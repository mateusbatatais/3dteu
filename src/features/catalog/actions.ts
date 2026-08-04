"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { db } from "@/server/db/client";
import { productPartMaterialOptions, productParts, products, sizeOptions } from "@/server/db/schema";

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

// ---------------------------------------------------------------------------
// Tamanhos (por produto) — usadas direto como `action` de <form>, por isso
// recebem FormData em vez de um objeto tipado.
// ---------------------------------------------------------------------------

export async function addSizeOption(productId: string, formData: FormData) {
  const label = String(formData.get("label") ?? "").trim();
  const scaleFactor = Number(formData.get("scaleFactor"));
  const priceModifierReais = Number(formData.get("priceModifierReais") ?? 0);
  const weightModifierGrams = Number(formData.get("weightModifierGrams") ?? 0);

  if (!label || !Number.isFinite(scaleFactor) || scaleFactor <= 0) return;

  await db.insert(sizeOptions).values({
    productId,
    label,
    scaleFactor: scaleFactor.toString(),
    priceModifierCents: Math.round(priceModifierReais * 100),
    weightModifierGrams: Math.round(weightModifierGrams),
  });

  revalidatePath(`/admin/produtos/${productId}`);
}

export async function deleteSizeOption(productId: string, sizeId: string) {
  await db.delete(sizeOptions).where(eq(sizeOptions.id, sizeId));
  revalidatePath(`/admin/produtos/${productId}`);
}

// ---------------------------------------------------------------------------
// Partes do produto + materiais atribuídos a cada parte
// ---------------------------------------------------------------------------

export async function addProductPart(productId: string, formData: FormData) {
  const name = String(formData.get("name") ?? "").trim();
  if (!name) return;

  await db.insert(productParts).values({ productId, name });
  revalidatePath(`/admin/produtos/${productId}`);
}

export async function deleteProductPart(productId: string, partId: string) {
  await db.delete(productParts).where(eq(productParts.id, partId));
  revalidatePath(`/admin/produtos/${productId}`);
}

export async function setPartMaterials(productId: string, partId: string, formData: FormData) {
  const filamentOptionIds = formData.getAll("filamentOptionId").map(String);

  await db.transaction(async (tx) => {
    await tx.delete(productPartMaterialOptions).where(eq(productPartMaterialOptions.productPartId, partId));
    if (filamentOptionIds.length > 0) {
      await tx
        .insert(productPartMaterialOptions)
        .values(filamentOptionIds.map((filamentOptionId) => ({ productPartId: partId, filamentOptionId })));
    }
  });

  revalidatePath(`/admin/produtos/${productId}`);
}
