import { ProductConfigurator } from "@/features/catalog/components/product-configurator";
import { DEMO_PRODUCT } from "@/features/catalog/demo-data";

export default async function ProdutoPage({ params }: PageProps<"/produtos/[slug]">) {
  const { slug } = await params;

  // TODO(Fase 1): trocar por `await getProductBySlug(slug)` (src/features/catalog/queries.ts)
  // assim que o Supabase estiver configurado e o catálogo seedado (npm run db:seed).
  const product = { ...DEMO_PRODUCT, slug };

  return (
    <main className="mx-auto w-full max-w-5xl flex-1 px-6 py-16">
      <h1 className="text-3xl font-semibold tracking-tight">{product.name}</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Preview de demonstração — vira dado real assim que o catálogo estiver no banco.
      </p>
      <div className="mt-8">
        <ProductConfigurator product={product} />
      </div>
    </main>
  );
}
