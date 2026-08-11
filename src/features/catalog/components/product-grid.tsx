import { Box } from "lucide-react";
import Image from "next/image";
import Link from "next/link";

import { formatPriceCents } from "@/lib/format";

import { getPublishedProductsForCatalog } from "../queries";

// Extraído de /produtos (que virou a home) pra ser reaproveitado também nas
// páginas de categoria — mesmos cards, filtros diferentes.
export async function ProductGrid({ q, categorySlug }: { q?: string; categorySlug?: string }) {
  const productList = await getPublishedProductsForCatalog({ q, categorySlug });
  const isFiltered = Boolean(q || categorySlug);

  if (productList.length === 0) {
    return (
      <p className="mt-6 text-muted-foreground">
        {isFiltered ? "Nenhum produto encontrado com esses filtros." : "Nenhum produto publicado ainda."}
      </p>
    );
  }

  return (
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
                quality={90}
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
  );
}
