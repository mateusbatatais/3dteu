import { asc, desc, eq } from "drizzle-orm";

import { db } from "@/server/db/client";
import { categories, filamentOptions, productParts, products, sizeOptions } from "@/server/db/schema";

import type { Product } from "./types";

export async function getPublishedProducts() {
  return db.query.products.findMany({
    where: eq(products.status, "published"),
    orderBy: [asc(products.createdAt)],
  });
}

/**
 * Produtos publicados com o suficiente pra desenhar uma miniatura 3D real no
 * catálogo (parte + cor do primeiro material disponível), em vez do ícone
 * genérico.
 */
export async function getPublishedProductsForCatalog() {
  const rows = await db.query.products.findMany({
    where: eq(products.status, "published"),
    orderBy: [asc(products.createdAt)],
    with: {
      parts: {
        orderBy: [asc(productParts.sortOrder)],
        with: { materialOptions: { with: { filament: true } } },
      },
    },
  });

  return rows.map((row) => ({
    id: row.id,
    slug: row.slug,
    name: row.name,
    description: row.description,
    basePriceCents: row.basePriceCents,
    previewParts: row.parts.map((part) => {
      const firstMaterial = part.materialOptions[0]?.filament;
      return {
        id: part.id,
        meshUrl: part.meshFileUrl,
        color: firstMaterial?.hexColor ?? "#a1a1aa",
        colorSecondary: firstMaterial?.hexColorSecondary ?? null,
      };
    }),
  }));
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

/** Catálogo global de materiais/filamentos, usado no admin e na atribuição por parte. */
export async function getAllFilamentOptions() {
  return db.query.filamentOptions.findMany({ orderBy: [asc(filamentOptions.name)] });
}

/** Produto com partes (+ materiais atribuídos) e tamanhos, para a tela de edição do admin. */
export async function getProductWithConfigForAdmin(id: string) {
  return db.query.products.findFirst({
    where: eq(products.id, id),
    with: {
      parts: {
        orderBy: [asc(productParts.sortOrder)],
        with: { materialOptions: true },
      },
      sizeOptions: { orderBy: [asc(sizeOptions.sortOrder)] },
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
        },
      },
      sizeOptions: { orderBy: [asc(sizeOptions.sortOrder)] },
    },
  });

  if (!row || row.status !== "published") return null;

  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    basePriceCents: row.basePriceCents,
    weightGrams: row.weightGrams,
    heightCm: row.heightCm,
    widthCm: row.widthCm,
    lengthCm: row.lengthCm,
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
