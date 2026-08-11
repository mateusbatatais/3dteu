"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";

import { createStorageClient, MEDIA_BUCKET } from "@/lib/supabase/storage";
import { ALLOWED_MEDIA_EXTENSIONS, type MediaExtension } from "@/lib/supabase/storage-constants";
import { db } from "@/server/db/client";
import { categories, categoryRecommendedMaterialTypes } from "@/server/db/schema";

export interface CategoryActionResult {
  error?: string;
}

export interface CategoryInput {
  name: string;
  slug: string;
  description: string;
}

function isUniqueViolation(error: unknown): boolean {
  return typeof error === "object" && error !== null && (error as { code?: string }).code === "23505";
}

// Categorias aparecem na home (tiles) e no menu — invalidar as duas sempre
// que uma muda, junto com a página própria da categoria quando já existe.
async function revalidateCategoryPages(slug?: string) {
  revalidatePath("/admin/categorias");
  revalidatePath("/");
  if (slug) revalidatePath(`/categorias/${slug}`);
}

export async function createCategory(input: CategoryInput): Promise<CategoryActionResult> {
  if (!input.name.trim() || !input.slug.trim()) {
    return { error: "Nome e slug são obrigatórios." };
  }

  try {
    await db.insert(categories).values({
      name: input.name.trim(),
      slug: input.slug.trim(),
      description: input.description.trim() || null,
    });
  } catch (error) {
    return {
      error: isUniqueViolation(error) ? "Já existe uma categoria com esse slug." : "Não foi possível salvar a categoria.",
    };
  }

  await revalidateCategoryPages(input.slug.trim());
  return {};
}

export async function updateCategory(id: string, input: CategoryInput): Promise<CategoryActionResult> {
  if (!input.name.trim() || !input.slug.trim()) {
    return { error: "Nome e slug são obrigatórios." };
  }

  try {
    await db
      .update(categories)
      .set({ name: input.name.trim(), slug: input.slug.trim(), description: input.description.trim() || null })
      .where(eq(categories.id, id));
  } catch (error) {
    return {
      error: isUniqueViolation(error) ? "Já existe uma categoria com esse slug." : "Não foi possível salvar a categoria.",
    };
  }

  await revalidateCategoryPages(input.slug.trim());
  return {};
}

export async function deleteCategory(id: string) {
  await db.delete(categories).where(eq(categories.id, id));
  await revalidateCategoryPages();
}

// Fase 1b do ROADMAP.md — quais Tipos de material o admin recomenda pra
// produtos dessa categoria (só afeta o que vem marcado por padrão ao
// cadastrar um produto, nunca restringe as opções). Substitui o conjunto
// inteiro, mesmo padrão de setPartMaterials em catalog/actions.ts.
export async function updateCategoryRecommendedMaterialTypes(
  categoryId: string,
  materialTypeIds: string[],
): Promise<CategoryActionResult> {
  try {
    await db.transaction(async (tx) => {
      await tx
        .delete(categoryRecommendedMaterialTypes)
        .where(eq(categoryRecommendedMaterialTypes.categoryId, categoryId));
      if (materialTypeIds.length > 0) {
        await tx
          .insert(categoryRecommendedMaterialTypes)
          .values(materialTypeIds.map((materialTypeId) => ({ categoryId, materialTypeId })));
      }
    });
  } catch {
    return { error: "Não foi possível salvar os materiais recomendados." };
  }

  revalidatePath("/admin/categorias");
  return {};
}

export interface CategoryImageUploadResult {
  error?: string;
  path?: string;
  token?: string;
}

// Mesmo bucket/padrão de upload direto já usado pra fotos de produto — só
// muda o prefixo do path e o que confirma grava (aqui, um UPDATE direto em
// categories.image_url, já que é uma imagem só por categoria, não galeria).
export async function createCategoryImageUploadUrl(
  categoryId: string,
  extension: string,
): Promise<CategoryImageUploadResult> {
  const normalizedExt = extension.toLowerCase().replace(/^\./, "");
  if (!(ALLOWED_MEDIA_EXTENSIONS as readonly string[]).includes(normalizedExt)) {
    return { error: `Formato .${normalizedExt} não suportado. Use jpg, png, webp ou gif.` };
  }

  try {
    const storage = createStorageClient();
    const path = `category-${categoryId}-${Date.now()}.${normalizedExt as MediaExtension}`;

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

export async function confirmCategoryImage(categoryId: string, path: string): Promise<CategoryActionResult> {
  try {
    const storage = createStorageClient();
    const {
      data: { publicUrl },
    } = storage.storage.from(MEDIA_BUCKET).getPublicUrl(path);

    const [category] = await db
      .update(categories)
      .set({ imageUrl: publicUrl })
      .where(eq(categories.id, categoryId))
      .returning({ slug: categories.slug });

    await revalidateCategoryPages(category?.slug);
    return {};
  } catch (error) {
    const message = error instanceof Error ? error.message : "Erro desconhecido.";
    return { error: `Falha ao confirmar o upload: ${message}` };
  }
}
