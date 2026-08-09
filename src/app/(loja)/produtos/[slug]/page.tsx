import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { ProductConfigurator } from "@/features/catalog/components/product-configurator";
import { getProductBySlug } from "@/features/catalog/queries";
import { decodeSelectionFromShareParam, SHARE_SELECTION_PARAM } from "@/features/catalog/selection-share";
import { ProductReviewsSection } from "@/features/reviews/components/product-reviews-section";
import { getProductRatingSummary } from "@/features/reviews/queries";

// Ver nota em /produtos/page.tsx sobre force-dynamic.
export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: PageProps<"/produtos/[slug]">): Promise<Metadata> {
  const { slug } = await params;
  const product = await getProductBySlug(slug);
  if (!product) return {};

  const title = product.metaTitle || product.name;
  const description =
    product.metaDescription || product.description || `${product.name} — fidget impresso em 3D sob encomenda.`;

  return {
    title,
    description,
    alternates: { canonical: `/produtos/${product.slug}` },
    openGraph: { title, description },
    twitter: { title, description },
  };
}

export default async function ProdutoPage({ params, searchParams }: PageProps<"/produtos/[slug]">) {
  const { slug } = await params;

  const product = await getProductBySlug(slug);
  if (!product) notFound();

  const resolvedSearchParams = await searchParams;
  const shareParam = resolvedSearchParams[SHARE_SELECTION_PARAM];
  const initialSelection = decodeSelectionFromShareParam(typeof shareParam === "string" ? shareParam : undefined);
  const ratingSummary = await getProductRatingSummary(product.id);

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "Product",
    name: product.name,
    description: product.description ?? undefined,
    image: product.images.length > 0 ? product.images : undefined,
    offers: {
      "@type": "Offer",
      priceCurrency: "BRL",
      price: (product.basePriceCents / 100).toFixed(2),
      availability: "https://schema.org/InStock",
    },
    aggregateRating:
      ratingSummary.reviewCount > 0
        ? {
            "@type": "AggregateRating",
            ratingValue: ratingSummary.averageRating?.toFixed(1),
            reviewCount: ratingSummary.reviewCount,
          }
        : undefined,
  };

  return (
    <main className="mx-auto w-full max-w-5xl flex-1 px-6 py-16">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      <h1 className="text-3xl font-semibold tracking-tight">{product.name}</h1>
      {product.description ? <p className="mt-2 text-muted-foreground">{product.description}</p> : null}
      <div className="mt-8">
        <ProductConfigurator product={product} initialSelection={initialSelection} />
      </div>
      <ProductReviewsSection productId={product.id} />
    </main>
  );
}
