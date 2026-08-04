import type { MetadataRoute } from "next";

import { getPublishedProducts } from "@/features/catalog/queries";

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";

// Mesmo motivo do force-dynamic em /produtos: evita depender de DATABASE_URL
// no momento do build (CI/local não têm banco configurado) — sem isso o
// build inteiro falha tentando pré-renderizar o sitemap.
export const dynamic = "force-dynamic";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const products = await getPublishedProducts();

  return [
    { url: SITE_URL, changeFrequency: "monthly", priority: 1 },
    { url: `${SITE_URL}/produtos`, changeFrequency: "daily", priority: 0.9 },
    ...products.map((product) => ({
      url: `${SITE_URL}/produtos/${product.slug}`,
      lastModified: product.updatedAt,
      changeFrequency: "weekly" as const,
      priority: 0.8,
    })),
  ];
}
