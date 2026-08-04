import { notFound } from "next/navigation";

import { ProductConfigurator } from "@/features/catalog/components/product-configurator";
import { getProductBySlug } from "@/features/catalog/queries";

// Ver nota em /produtos/page.tsx sobre force-dynamic.
export const dynamic = "force-dynamic";

export default async function ProdutoPage({ params }: PageProps<"/produtos/[slug]">) {
  const { slug } = await params;

  const product = await getProductBySlug(slug);
  if (!product) notFound();

  return (
    <main className="mx-auto w-full max-w-5xl flex-1 px-6 py-16">
      <h1 className="text-3xl font-semibold tracking-tight">{product.name}</h1>
      <div className="mt-8">
        <ProductConfigurator product={product} />
      </div>
    </main>
  );
}
