"use server";

import { eq, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { createStorageClient, MEDIA_BUCKET, MODELS_BUCKET } from "@/lib/supabase/storage";
import { ALLOWED_MEDIA_EXTENSIONS, ALLOWED_MESH_EXTENSIONS, type MediaExtension, type MeshExtension } from "@/lib/supabase/storage-constants";
import { db } from "@/server/db/client";
import {
  categories,
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

// order_items.product_id é "restrict" de propósito (nunca cascade) — um
// produto que já foi comprado não pode sumir e quebrar o histórico do
// pedido. Isso vira esse erro no Postgres em vez de deletar.
function isForeignKeyViolation(error: unknown): boolean {
  return typeof error === "object" && error !== null && (error as { code?: string }).code === "23503";
}

/**
 * Qualquer mudança em tamanhos/partes/materiais/preço de um produto precisa
 * revalidar não só a tela do admin, mas também a página pública do produto
 * e o catálogo (agora é a própria home, ver rodada 18) — sem isso, o
 * cliente (e o admin, ao navegar de volta) podia continuar vendo a versão
 * antiga. Também revalida a página da categoria do produto, se tiver uma.
 */
async function revalidateProductPages(productId: string) {
  const [product] = await db
    .select({ slug: products.slug, categorySlug: categories.slug })
    .from(products)
    .leftJoin(categories, eq(products.categoryId, categories.id))
    .where(eq(products.id, productId));

  revalidatePath(`/admin/produtos/${productId}`);
  revalidatePath("/");
  if (product) {
    revalidatePath(`/produtos/${product.slug}`);
    if (product.categorySlug) revalidatePath(`/categorias/${product.categorySlug}`);
  }
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

/**
 * Partes/tamanhos/imagens/materiais-por-parte/avaliações do produto somem
 * junto (cascade no schema) — só pedidos que já incluíram esse produto
 * impedem a exclusão (order_items.product_id é "restrict"), e nesse caso a
 * resposta explica o porquê em vez de estourar um erro genérico.
 */
export async function deleteProduct(id: string): Promise<ProductActionResult> {
  const [product] = await db
    .select({ slug: products.slug, categorySlug: categories.slug })
    .from(products)
    .leftJoin(categories, eq(products.categoryId, categories.id))
    .where(eq(products.id, id));

  try {
    await db.delete(products).where(eq(products.id, id));
  } catch (error) {
    if (isForeignKeyViolation(error)) {
      return {
        error: "Não é possível excluir: este produto já tem pedidos associados. Mude o status pra rascunho se quiser tirá-lo da loja sem apagar o histórico.",
      };
    }
    return { error: "Não foi possível excluir o produto." };
  }

  revalidatePath("/admin/produtos");
  revalidatePath("/");
  if (product) {
    revalidatePath(`/produtos/${product.slug}`);
    if (product.categorySlug) revalidatePath(`/categorias/${product.categorySlug}`);
  }
  return {};
}

// ---------------------------------------------------------------------------
// Tamanhos (por produto)
// ---------------------------------------------------------------------------

export interface SizeOptionInput {
  label: string;
  scaleFactor: number;
  priceModifierReais: number;
  weightModifierGrams: number;
}

function validateSizeInput(input: SizeOptionInput): string | null {
  if (!input.label.trim()) return "Preencha o label.";
  if (!Number.isFinite(input.scaleFactor) || input.scaleFactor <= 0) return "A escala precisa ser maior que zero.";
  return null;
}

export async function createSizeOption(productId: string, input: SizeOptionInput): Promise<ProductActionResult> {
  const validationError = validateSizeInput(input);
  if (validationError) return { error: validationError };

  await db.insert(sizeOptions).values({
    productId,
    label: input.label.trim(),
    scaleFactor: input.scaleFactor.toString(),
    priceModifierCents: Math.round(input.priceModifierReais * 100),
    weightModifierGrams: Math.round(input.weightModifierGrams),
  });

  await revalidateProductPages(productId);
  return {};
}

export async function updateSizeOption(
  productId: string,
  sizeId: string,
  input: SizeOptionInput,
): Promise<ProductActionResult> {
  const validationError = validateSizeInput(input);
  if (validationError) return { error: validationError };

  await db
    .update(sizeOptions)
    .set({
      label: input.label.trim(),
      scaleFactor: input.scaleFactor.toString(),
      priceModifierCents: Math.round(input.priceModifierReais * 100),
      weightModifierGrams: Math.round(input.weightModifierGrams),
    })
    .where(eq(sizeOptions.id, sizeId));

  await revalidateProductPages(productId);
  return {};
}

export interface AutoGenerateSizeOptionsResult {
  created: boolean;
  labels?: string[];
}

function labelForCm(mm: number): string {
  const rounded = Math.round((mm / 10) * 2) / 2; // arredonda pro 0,5cm mais próximo
  return `${rounded.toFixed(1).replace(/\.0$/, "")}cm`;
}

/**
 * Só cria tamanhos se o produto ainda não tiver nenhum — nunca sobrescreve
 * um ajuste manual do admin. `mainDimensionMm` vem da bounding box do
 * arquivo 3D recém-enviado (medida no navegador, ver mesh-measure.ts) e
 * vira o tamanho "M" (100%); P e G são 50%/150% dela. O rótulo é
 * arredondado pro 0,5cm mais próximo só pra ficar um número bonito — o
 * scaleFactor de verdade aplicado na malha continua exato.
 */
export async function autoGenerateSizeOptions(
  productId: string,
  mainDimensionMm: number,
): Promise<AutoGenerateSizeOptionsResult> {
  if (!Number.isFinite(mainDimensionMm) || mainDimensionMm <= 0) return { created: false };

  const existing = await db
    .select({ id: sizeOptions.id })
    .from(sizeOptions)
    .where(eq(sizeOptions.productId, productId))
    .limit(1);
  if (existing.length > 0) return { created: false };

  const sizes = [
    { label: labelForCm(mainDimensionMm * 0.5), scaleFactor: "0.5", sortOrder: 0 },
    { label: labelForCm(mainDimensionMm), scaleFactor: "1", sortOrder: 1 },
    { label: labelForCm(mainDimensionMm * 1.5), scaleFactor: "1.5", sortOrder: 2 },
  ];

  await db.insert(sizeOptions).values(sizes.map((size) => ({ productId, ...size })));

  await revalidateProductPages(productId);
  return { created: true, labels: sizes.map((s) => s.label) };
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

export interface RegionSettingsInput {
  label: string;
  /** false = escondida da loja (ex.: ruído da segmentação MMU) — continua colorida no preview com defaultFilamentOptionId. */
  enabled: boolean;
  /** null = usa o padrão da parte (productParts.defaultFilamentOptionId). */
  defaultFilamentOptionId: string | null;
}

export async function updateRegionSettings(
  productId: string,
  regionId: string,
  input: RegionSettingsInput,
): Promise<ProductActionResult> {
  const label = input.label.trim();
  if (!label) return { error: "Nome é obrigatório." };

  await db
    .update(productPartRegions)
    .set({ label, enabled: input.enabled, defaultFilamentOptionId: input.defaultFilamentOptionId })
    .where(eq(productPartRegions.id, regionId));

  await revalidateProductPages(productId);
  return {};
}

export async function setPartMaterials(productId: string, partId: string, formData: FormData) {
  const filamentOptionIds = formData.getAll("filamentOptionId").map(String);

  // O "padrão" só faz sentido se ainda estiver entre os materiais marcados
  // (o admin pode ter desmarcado o que era padrão) — nesse caso cai pro
  // primeiro marcado, em vez de gravar um padrão que o cliente nem veria.
  const chosenDefault = formData.get("defaultFilamentOptionId");
  const defaultFilamentOptionId =
    typeof chosenDefault === "string" && filamentOptionIds.includes(chosenDefault)
      ? chosenDefault
      : filamentOptionIds[0] ?? null;

  await db.transaction(async (tx) => {
    await tx.delete(productPartMaterialOptions).where(eq(productPartMaterialOptions.productPartId, partId));
    if (filamentOptionIds.length > 0) {
      await tx
        .insert(productPartMaterialOptions)
        .values(filamentOptionIds.map((filamentOptionId) => ({ productPartId: partId, filamentOptionId })));
    }
    await tx.update(productParts).set({ defaultFilamentOptionId }).where(eq(productParts.id, partId));
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
