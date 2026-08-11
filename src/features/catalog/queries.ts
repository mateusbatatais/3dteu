import { and, asc, desc, eq, ilike, or } from "drizzle-orm";

import { db } from "@/server/db/client";
import {
  categories,
  categoryRecommendedMaterialTypes,
  materialColors,
  materials,
  materialTypes,
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
        with: { materialOptions: { with: { color: true } } },
      },
      images: { orderBy: [asc(productImages.position)], limit: 1 },
    },
  });

  return rows.map((row) => {
    const part = row.parts[0];
    const defaultOption = part?.materialOptions.find((m) => m.materialColorId === part.defaultMaterialColorId);
    const color = (defaultOption ?? part?.materialOptions[0])?.color;

    return {
      id: row.id,
      slug: row.slug,
      name: row.name,
      description: row.description,
      basePriceCents: row.basePriceCents,
      coverImageUrl: row.images[0]?.url ?? null,
      fallbackColor: color?.hexColor ?? null,
      fallbackColorSecondary: color?.hexColorSecondary ?? null,
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

/**
 * Tipos de material recomendados por categoria (Fase 1b do ROADMAP.md) —
 * um mapa `categoryId -> materialTypeId[]`, buscado de uma vez pra todas as
 * categorias (evita N+1 tanto no admin de categorias quanto no cadastro de
 * produto, que precisa saber a recomendação de qualquer categoria que o
 * admin selecionar).
 */
export async function getCategoryRecommendedMaterialTypesMap(): Promise<Record<string, string[]>> {
  const rows = await db
    .select({ categoryId: categoryRecommendedMaterialTypes.categoryId, materialTypeId: categoryRecommendedMaterialTypes.materialTypeId })
    .from(categoryRecommendedMaterialTypes);

  const map: Record<string, string[]> = {};
  for (const row of rows) {
    (map[row.categoryId] ??= []).push(row.materialTypeId);
  }
  return map;
}

/**
 * Catálogo completo de materiais — Material (Resina/Plástico) → Tipo (PLA,
 * Cristal...) → Cor — usado no admin (CRUD de materiais) e em qualquer tela
 * que precise deixar escolher cores agrupadas por tipo (upload de arquivo,
 * cadastro de produto).
 */
export async function getMaterialCatalog() {
  return db.query.materials.findMany({
    orderBy: [asc(materials.name)],
    with: {
      types: {
        orderBy: [asc(materialTypes.name)],
        with: {
          colors: { orderBy: [asc(materialColors.name)] },
        },
      },
    },
  });
}

/**
 * Mesmo catálogo, mas achatado numa lista só de cores (com o nome do
 * material/tipo dono junto) — usado nas telas que escolhem quais cores uma
 * peça aceita (upload de arquivo, cadastro de produto), onde uma lista
 * simples com rótulo "Material · Tipo · Cor" é mais direta que navegar a
 * árvore de novo.
 */
export async function getAllMaterialColorsForAdmin() {
  const catalog = await getMaterialCatalog();
  return catalog.flatMap((material) =>
    material.types.flatMap((type) =>
      type.colors.map((color) => ({
        id: color.id,
        name: color.name,
        hexColor: color.hexColor,
        hexColorSecondary: color.hexColorSecondary,
        materialName: material.name,
        typeId: type.id,
        typeName: type.name,
        // Campos extras (não usados pra listar/marcar cores, só pela
        // calculadora de preço quando ela precisa saber o custo do tipo
        // dono da cor escolhida como padrão) — incluídos aqui pra não
        // precisar de uma segunda query só pra isso.
        printProcess: material.printProcess,
        postProcessingFeeCents: material.postProcessingFeeCents,
        pricePerKgCents: type.pricePerKgCents,
        printSpeedValue: type.printSpeedValue,
      })),
    ),
  );
}

/** Produto com partes (+ cores atribuídas e regiões pintadas), tamanhos e imagens, para a tela de edição do admin. */
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
          materialOptions: {
            with: { color: { with: { type: { with: { material: true } } } } },
          },
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
      availableColors: part.materialOptions.map(({ color }) => ({
        id: color.id,
        name: color.name,
        hexColor: color.hexColor,
        hexColorSecondary: color.hexColorSecondary,
        materialName: color.type.material.name,
        printProcess: color.type.material.printProcess,
        postProcessingFeeCents: color.type.material.postProcessingFeeCents,
        type: {
          id: color.type.id,
          name: color.type.name,
          pricePerKgCents: color.type.pricePerKgCents,
          printSpeedValue: Number(color.type.printSpeedValue),
          description: color.type.description,
        },
      })),
      regions: part.regions.map((region) => ({
        id: region.id,
        label: region.label,
        paintState: region.paintState,
        enabled: region.enabled,
        defaultMaterialColorId: region.defaultMaterialColorId,
      })),
      defaultMaterialColorId: part.defaultMaterialColorId,
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
