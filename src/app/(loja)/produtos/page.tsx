import { Box } from "lucide-react";
import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { Suspense } from "react";

import { CatalogFilters } from "@/features/catalog/components/catalog-filters";
import { getCategories, getPublishedProductsForCatalog } from "@/features/catalog/queries";
import { formatPriceCents } from "@/lib/format";

export const metadata: Metadata = {
  title: "Catálogo",
  description: "Fidgets impressos em 3D sob encomenda, com cor e tamanho personalizáveis.",
  alternates: { canonical: "/produtos" },
};

// Renderiza por request em vez de estático: evita depender de DATABASE_URL no
// momento do build (CI/local não têm banco configurado) e mantém o catálogo
// sempre atualizado. Pode virar `revalidate` (ISR) mais pra frente.
export const dynamic = "force-dynamic";

export default async function ProdutosPage({ searchParams }: PageProps<"/produtos">) {
  const params = await searchParams;
  const q = typeof params.q === "string" ? params.q : undefined;
  const categorySlug = typeof params.categoria === "string" ? params.categoria : undefined;
  const isFiltered = Boolean(q || categorySlug);

  const [productList, categories] = await Promise.all([
    getPublishedProductsForCatalog({ q, categorySlug }),
    getCategories(),
  ]);

  return (
    <main className="mx-auto w-full max-w-6xl flex-1 px-6 py-16">
      <h1 className="text-3xl font-semibold tracking-tight">Catálogo</h1>

      <Suspense fallback={<div className="mt-6 h-10" />}>
        <CatalogFilters categories={categories} />
      </Suspense>

      {productList.length === 0 ? (
        <p className="mt-6 text-muted-foreground">
          {isFiltered ? "Nenhum produto encontrado com esses filtros." : "Nenhum produto publicado ainda."}
        </p>
      ) : (
        <div className="mt-8 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {productList.map((product) => (
            <Link
              key={product.id}
              href={`/produtos/${product.slug}`}
              className="group overflow-hidden rounded-xl bg-card ring-1 ring-foreground/10 transition-shadow hover:shadow-md"
            >
              {product.coverImageUrl ? (
                <div className="relative aspect-square overflow-hidden">
                  <Image
                    src={product.coverImageUrl}
                    alt={product.name}
                    fill
                    sizes="(min-width: 1024px) 33vw, (min-width: 640px) 50vw, 100vw"
                    className="object-cover transition-transform group-hover:scale-105"
                  />
                </div>
              ) : product.fallbackColor ? (
                <div
                  className="aspect-square"
                  style={{
                    background: product.fallbackColorSecondary
                      ? `linear-gradient(135deg, ${product.fallbackColor} 50%, ${product.fallbackColorSecondary} 50%)`
                      : product.fallbackColor,
                  }}
                />
              ) : (
                <div className="flex aspect-square items-center justify-center bg-gradient-to-br from-primary/15 to-primary/5">
                  <Box className="size-10 text-primary/50 transition-transform group-hover:scale-110" />
                </div>
              )}
              <div className="p-4">
                <h2 className="font-medium">{product.name}</h2>
                {product.description ? (
                  <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">{product.description}</p>
                ) : null}
                <p className="mt-3 font-semibold">a partir de {formatPriceCents(product.basePriceCents)}</p>
              </div>
            </Link>
          ))}
        </div>
      )}
    </main>
  );
}
