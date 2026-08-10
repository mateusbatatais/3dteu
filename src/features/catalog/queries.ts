import { and, asc, desc, eq, ilike, or } from "drizzle-orm";

import { db } from "@/server/db/client";
import {
  categories,
  filamentOptions,
  productImages,
  productPartRegions,
  productParts,
  products,
  sizeOptions,
} from "@/server/db/schema";

import type { Product } from "./types";

export async function getPublishedProducts() {
  return db.query.products.findMany({
    where: eq(products.status, "published"),
    orderBy: [asc(products.createdAt)],
  });
}

/**
 * Produtos publicados com o suficiente pra desenhar uma miniatura no
 * catálogo — a foto de capa quando existe, ou a cor do material padrão como
 * fallback. Deliberadamente NÃO carrega/parseia o arquivo 3D aqui: abrir um
 * <Canvas> react-three-fiber (WebGL + Environment HDRI) por card, um pra
 * cada produto da grade, foi o que deixava `/produtos` lento — o preview 3D
 * de verdade só faz sentido na página do produto (`getProductBySlug`), onde
 * só existe uma malha por vez.
 */
export async function getPublishedProductsForCatalog(filters?: { q?: string; categorySlug?: string }) {
  const conditions = [eq(products.status, "published")];

  const q = filters?.q?.trim();
  if (q) {
    const term = `%${q}%`;
    conditions.push(or(ilike(products.name, term), ilike(products.description, term))!);
  }

  if (filters?.categorySlug) {
    const category = await db.query.categories.findFirst({ where: eq(categories.slug, filters.categorySlug) });
    // Categoria no filtro não existe (mais) — retorna vazio em vez de ignorar o filtro.
    if (!category) return [];
    conditions.push(eq(products.categoryId, category.id));
  }

  const rows = await db.query.products.findMany({
    where: and(...conditions),
    orderBy: [asc(products.createdAt)],
    with: {
      parts: {
        orderBy: [asc(productParts.sortOrder)],
        limit: 1,
        with: { materialOptions: { with: { filament: true } } },
      },
      images: { orderBy: [asc(productImages.position)], limit: 1 },
    },
  });

  return rows.map((row) => {
    const part = row.parts[0];
    const defaultMaterial = part?.materialOptions.find((m) => m.filamentOptionId === part.defaultFilamentOptionId);
    const material = defaultMaterial ?? part?.materialOptions[0];

    return {
      id: row.id,
      slug: row.slug,
      name: row.name,
      description: row.description,
      basePriceCents: row.basePriceCents,
      coverImageUrl: row.images[0]?.url ?? null,
      fallbackColor: material?.filament.hexColor ?? null,
      fallbackColorSecondary: material?.filament.hexColorSecondary ?? null,
    };
  });
}

/** Lista todos os produtos (rascunho e publicado) para a tabela do admin. */
export async function getAllProductsForAdmin() {
  return db.query.products.findMany({
    with: { category: true },
    orderBy: [desc(products.createdAt)],
  });
}

export async function getProductByIdForAdmin(id: string) {
  return db.query.products.findFirst({ where: eq(products.id, id) });
}

export async function getCategories() {
  return db.query.categories.findMany({ orderBy: [asc(categories.name)] });
}

export async function getCategoryBySlug(slug: string) {
  return db.query.categories.findFirst({ where: eq(categories.slug, slug) });
}

/** Catálogo global de materiais/filamentos, usado no admin e na atribuição por parte. */
export async function getAllFilamentOptions() {
  return db.query.filamentOptions.findMany({ orderBy: [asc(filamentOptions.name)] });
}

/** Produto com partes (+ materiais atribuídos e regiões pintadas), tamanhos e imagens, para a tela de edição do admin. */
export async function getProductWithConfigForAdmin(id: string) {
  return db.query.products.findFirst({
    where: eq(products.id, id),
    with: {
      parts: {
        orderBy: [asc(productParts.sortOrder)],
        with: {
          materialOptions: true,
          regions: { orderBy: [asc(productPartRegions.sortOrder)] },
        },
      },
      sizeOptions: { orderBy: [asc(sizeOptions.sortOrder)] },
      images: { orderBy: [asc(productImages.position)] },
    },
  });
}

export async function getProductBySlug(slug: string): Promise<Product | null> {
  const row = await db.query.products.findFirst({
    where: eq(products.slug, slug),
    with: {
      parts: {
        orderBy: [asc(productParts.sortOrder)],
        with: {
          materialOptions: { with: { filament: true } },
          regions: { orderBy: [asc(productPartRegions.sortOrder)] },
        },
      },
      sizeOptions: { orderBy: [asc(sizeOptions.sortOrder)] },
      images: { orderBy: [asc(productImages.position)] },
    },
  });

  if (!row || row.status !== "published") return null;

  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    description: row.description,
    basePriceCents: row.basePriceCents,
    weightGrams: row.weightGrams,
    heightCm: row.heightCm,
    widthCm: row.widthCm,
    lengthCm: row.lengthCm,
    metaTitle: row.metaTitle,
    metaDescription: row.metaDescription,
    images: row.images.map((image) => image.url),
    parts: row.parts.map((part) => ({
      id: part.id,
      name: part.name,
      meshFileUrl: part.meshFileUrl,
      availableMaterials: part.materialOptions.map(({ filament }) => ({
        id: filament.id,
        type: filament.type,
        name: filament.name,
        hexColor: filament.hexColor,
        hexColorSecondary: filament.hexColorSecondary,
        priceModifierCents: filament.priceModifierCents,
      })),
      regions: part.regions.map((region) => ({
        id: region.id,
        label: region.label,
        paintState: region.paintState,
        enabled: region.enabled,
        defaultMaterialId: region.defaultFilamentOptionId,
      })),
      defaultMaterialId: part.defaultFilamentOptionId,
    })),
    sizeOptions: row.sizeOptions.map((size) => ({
      id: size.id,
      label: size.label,
      scaleFactor: Number(size.scaleFactor),
      priceModifierCents: size.priceModifierCents,
      weightModifierGrams: size.weightModifierGrams,
    })),
  };
}
