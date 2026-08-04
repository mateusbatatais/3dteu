import { Box } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { getPublishedProducts } from "@/features/catalog/queries";
import { formatPriceCents } from "@/lib/format";

export const metadata: Metadata = {
  title: "Catálogo",
  description: "Fidgets impressos em 3D sob encomenda, com cor e tamanho personalizáveis.",
};

// Renderiza por request em vez de estático: evita depender de DATABASE_URL no
// momento do build (CI/local não têm banco configurado) e mantém o catálogo
// sempre atualizado. Pode virar `revalidate` (ISR) mais pra frente.
export const dynamic = "force-dynamic";

export default async function ProdutosPage() {
  const productList = await getPublishedProducts();

  return (
    <main className="mx-auto w-full max-w-6xl flex-1 px-6 py-16">
      <h1 className="text-3xl font-semibold tracking-tight">Catálogo</h1>

      {productList.length === 0 ? (
        <p className="mt-2 text-muted-foreground">Nenhum produto publicado ainda.</p>
      ) : (
        <div className="mt-8 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {productList.map((product) => (
            <Link
              key={product.id}
              href={`/produtos/${product.slug}`}
              className="group overflow-hidden rounded-xl bg-card ring-1 ring-foreground/10 transition-shadow hover:shadow-md"
            >
              <div className="flex aspect-square items-center justify-center bg-gradient-to-br from-primary/15 to-primary/5">
                <Box className="size-10 text-primary/50 transition-transform group-hover:scale-110" />
              </div>
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
