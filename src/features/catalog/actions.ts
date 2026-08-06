"use server";

import { eq, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { createStorageClient, MEDIA_BUCKET, MODELS_BUCKET } from "@/lib/supabase/storage";
import { ALLOWED_MEDIA_EXTENSIONS, ALLOWED_MESH_EXTENSIONS, type MediaExtension, type MeshExtension } from "@/lib/supabase/storage-constants";
import { db } from "@/server/db/client";
import {
  productImages,
  productPartMaterialOptions,
  productPartRegions,
  productParts,
  products,
  sizeOptions,
} from "@/server/db/schema";

import { productFormSchema, type ProductFormValues } from "./schemas";

export interface ProductActionResult {
  error?: string;
}

function isUniqueViolation(error: unknown): boolean {
  return typeof error === "object" && error !== null && (error as { code?: string }).code === "23505";
}

/**
 * Qualquer mudança em tamanhos/partes/materiais/preço de um produto precisa
 * revalidar não só a tela do admin, mas também a página pública do produto
 * e a listagem — sem isso, o cliente (e o admin, ao navegar de volta pro
 * catálogo) podia continuar vendo a versão antiga.
 */
async function revalidateProductPages(productId: string) {
  const [product] = await db.select({ slug: products.slug }).from(products).where(eq(products.id, productId));

  revalidatePath(`/admin/produtos/${productId}`);
  revalidatePath("/produtos");
  if (product) revalidatePath(`/produtos/${product.slug}`);
}

function toRow(values: ProductFormValues) {
  return {
    name: values.name,
    slug: values.slug,
    description: values.description || null,
    categoryId: values.categoryId || null,
    basePriceCents: Math.round(values.basePriceReais * 100),
    status: values.status,
    weightGrams: values.weightGrams || null,
    heightCm: values.heightCm || null,
    widthCm: values.widthCm || null,
    lengthCm: values.lengthCm || null,
    metaTitle: values.metaTitle || null,
    metaDescription: values.metaDescription || null,
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
  await revalidateProductPages(id);
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

  await revalidateProductPages(productId);
}

export async function deleteSizeOption(productId: string, sizeId: string) {
  await db.delete(sizeOptions).where(eq(sizeOptions.id, sizeId));
  await revalidateProductPages(productId);
}

// ---------------------------------------------------------------------------
// Partes do produto + materiais atribuídos a cada parte
// ---------------------------------------------------------------------------

export async function addProductPart(productId: string, formData: FormData) {
  const name = String(formData.get("name") ?? "").trim();
  if (!name) return;

  await db.insert(productParts).values({ productId, name });
  await revalidateProductPages(productId);
}

export async function deleteProductPart(productId: string, partId: string) {
  await db.delete(productParts).where(eq(productParts.id, partId));
  await revalidateProductPages(productId);
}

// ---------------------------------------------------------------------------
// Upload de STL em duas etapas: o arquivo NUNCA passa pelo servidor Next.js.
// Vercel Functions (inclusive Server Actions) têm um teto de 4,5MB por
// requisição que não dá pra configurar — um .stl real passa disso com
// frequência. Por isso:
//   1) o servidor só gera uma URL assinada de upload (payload minúsculo);
//   2) o navegador manda o arquivo DIRETO pro Supabase Storage com essa URL;
//   3) o servidor só confirma, gravando a URL pública no banco.
// ---------------------------------------------------------------------------

export interface CreateMeshUploadUrlResult {
  error?: string;
  path?: string;
  token?: string;
}

export async function createMeshUploadUrl(partId: string, extension: string): Promise<CreateMeshUploadUrlResult> {
  const normalizedExt = extension.toLowerCase().replace(/^\./, "");
  if (!(ALLOWED_MESH_EXTENSIONS as readonly string[]).includes(normalizedExt)) {
    return { error: `Formato .${normalizedExt} não suportado. Use .stl, .obj ou .3mf.` };
  }

  try {
    const storage = createStorageClient();
    const path = `${partId}-${Date.now()}.${normalizedExt as MeshExtension}`;

    const { data, error } = await storage.storage.from(MODELS_BUCKET).createSignedUploadUrl(path);
    if (error || !data) {
      return { error: `Falha ao preparar o upload: ${error?.message ?? "erro desconhecido"}` };
    }

    return { path: data.path, token: data.token };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Erro desconhecido.";
    return { error: `Falha ao preparar o upload: ${message}` };
  }
}

export interface ConfirmMeshResult {
  error?: string;
}

function defaultRegionLabel(paintState: number): string {
  return paintState === 0 ? "Região padrão" : `Extrusora ${paintState}`;
}

/**
 * `paintStates`: estados detectados no navegador na hora do upload (ver
 * mmu-3mf.ts) quando o arquivo é um .3mf pintado (MMU) — undefined/vazio pra
 * um arquivo normal. Substitui completamente as regiões da parte: um novo
 * upload troca o arquivo inteiro, então as regiões antigas não fazem
 * sentido mais (podem nem existir no arquivo novo).
 */
export async function confirmPartMesh(
  productId: string,
  partId: string,
  path: string,
  paintStates?: number[],
): Promise<ConfirmMeshResult> {
  try {
    const storage = createStorageClient();
    const {
      data: { publicUrl },
    } = storage.storage.from(MODELS_BUCKET).getPublicUrl(path);

    await db.transaction(async (tx) => {
      await tx
        .update(productParts)
        .set({ meshFileUrl: publicUrl, stlFileUrl: publicUrl })
        .where(eq(productParts.id, partId));

      await tx.delete(productPartRegions).where(eq(productPartRegions.productPartId, partId));

      if (paintStates && paintStates.length > 0) {
        await tx.insert(productPartRegions).values(
          paintStates.map((paintState, index) => ({
            productPartId: partId,
            paintState,
            label: defaultRegionLabel(paintState),
            sortOrder: index,
          })),
        );
      }
    });

    await revalidateProductPages(productId);
    return {};
  } catch (error) {
    const message = error instanceof Error ? error.message : "Erro desconhecido.";
    return { error: `Falha ao confirmar o upload: ${message}` };
  }
}

export async function updateRegionLabel(productId: string, regionId: string, formData: FormData) {
  const label = String(formData.get("label") ?? "").trim();
  if (!label) return;

  await db.update(productPartRegions).set({ label }).where(eq(productPartRegions.id, regionId));
  await revalidateProductPages(productId);
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

  await revalidateProductPages(productId);
}

// ---------------------------------------------------------------------------
// Fotos/gifs do produto — mesmo padrão de upload direto pro Supabase Storage
// já usado pro STL (createMeshUploadUrl/confirmPartMesh acima), só que num
// bucket separado (product-media) e com limites bem menores.
// ---------------------------------------------------------------------------

export async function createProductImageUploadUrl(
  productId: string,
  extension: string,
): Promise<CreateMeshUploadUrlResult> {
  const normalizedExt = extension.toLowerCase().replace(/^\./, "");
  if (!(ALLOWED_MEDIA_EXTENSIONS as readonly string[]).includes(normalizedExt)) {
    return { error: `Formato .${normalizedExt} não suportado. Use jpg, png, webp ou gif.` };
  }

  try {
    const storage = createStorageClient();
    const path = `${productId}-${Date.now()}.${normalizedExt as MediaExtension}`;

    const { data, error } = await storage.storage.from(MEDIA_BUCKET).createSignedUploadUrl(path);
    if (error || !data) {
      return { error: `Falha ao preparar o upload: ${error?.message ?? "erro desconhecido"}` };
    }

    return { path: data.path, token: data.token };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Erro desconhecido.";
    return { error: `Falha ao preparar o upload: ${message}` };
  }
}

export async function confirmProductImage(productId: string, path: string): Promise<ConfirmMeshResult> {
  try {
    const storage = createStorageClient();
    const {
      data: { publicUrl },
    } = storage.storage.from(MEDIA_BUCKET).getPublicUrl(path);

    const [{ nextPosition } = { nextPosition: 0 }] = await db
      .select({ nextPosition: sql<number>`coalesce(max(${productImages.position}), -1) + 1` })
      .from(productImages)
      .where(eq(productImages.productId, productId));

    await db.insert(productImages).values({ productId, url: publicUrl, position: nextPosition });

    await revalidateProductPages(productId);
    return {};
  } catch (error) {
    const message = error instanceof Error ? error.message : "Erro desconhecido.";
    return { error: `Falha ao confirmar o upload: ${message}` };
  }
}

export async function deleteProductImage(productId: string, imageId: string) {
  await db.delete(productImages).where(eq(productImages.id, imageId));
  await revalidateProductPages(productId);
}
