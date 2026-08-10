import type { MetadataRoute } from "next";

import { getCategories, getPublishedProducts } from "@/features/catalog/queries";

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";

// Mesmo motivo do force-dynamic em / (a home virou o catálogo, rodada 18):
// evita depender de DATABASE_URL no momento do build (CI/local não têm
// banco configurado) — sem isso o build inteiro falha tentando
// pré-renderizar o sitemap.
export const dynamic = "force-dynamic";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const [products, categories] = await Promise.all([getPublishedProducts(), getCategories()]);

  return [
    // A home é o catálogo — troca de frequência "daily" (tinha em
    // /produtos antes) porque a lista de produtos muda com mais frequência
    // que uma home puramente institucional.
    { url: SITE_URL, changeFrequency: "daily", priority: 1 },
    ...categories.map((category) => ({
      url: `${SITE_URL}/categorias/${category.slug}`,
      changeFrequency: "daily" as const,
      priority: 0.7,
    })),
    ...products.map((product) => ({
      url: `${SITE_URL}/produtos/${product.slug}`,
      lastModified: product.updatedAt,
      changeFrequency: "weekly" as const,
      priority: 0.8,
    })),
  ];
}
