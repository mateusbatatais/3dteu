import type { Metadata } from "next";
import Image from "next/image";
import { notFound } from "next/navigation";
import { Suspense } from "react";

import { CatalogFilters } from "@/features/catalog/components/catalog-filters";
import { ProductGrid } from "@/features/catalog/components/product-grid";
import { getCategories, getCategoryBySlug } from "@/features/catalog/queries";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: PageProps<"/categorias/[slug]">): Promise<Metadata> {
  const { slug } = await params;
  const category = await getCategoryBySlug(slug);
  if (!category) return {};

  const description = category.description || `Peças em 3D da categoria ${category.name}, impressas sob encomenda.`;

  return {
    title: category.name,
    description,
    alternates: { canonical: `/categorias/${category.slug}` },
    openGraph: { title: category.name, description },
    twitter: { title: category.name, description },
  };
}

export default async function CategoriaPage({ params, searchParams }: PageProps<"/categorias/[slug]">) {
  const { slug } = await params;
  const category = await getCategoryBySlug(slug);
  if (!category) notFound();

  const resolvedSearchParams = await searchParams;
  const q = typeof resolvedSearchParams.q === "string" ? resolvedSearchParams.q : undefined;

  const categoryList = await getCategories();

  return (
    <main className="flex flex-1 flex-col">
      <section className="relative flex h-56 items-end overflow-hidden border-b sm:h-72">
        {category.imageUrl ? (
          <Image src={category.imageUrl} alt={category.name} fill unoptimized className="object-cover" />
        ) : (
          <div className="absolute inset-0 bg-gradient-to-br from-primary/60 to-brand-orange/60" />
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-black/75 via-black/15 to-transparent" />
        <div className="relative z-10 mx-auto w-full max-w-6xl px-6 pb-8">
          <h1 className="text-3xl font-semibold tracking-tight text-white sm:text-4xl">{category.name}</h1>
          {category.description ? <p className="mt-2 max-w-xl text-white/85">{category.description}</p> : null}
        </div>
      </section>

      <div className="mx-auto w-full max-w-6xl flex-1 px-6 py-12">
        <Suspense fallback={<div className="h-10" />}>
          <CatalogFilters categories={categoryList} activeCategorySlug={category.slug} />
        </Suspense>

        <ProductGrid q={q} categorySlug={category.slug} />
      </div>
    </main>
  );
}
