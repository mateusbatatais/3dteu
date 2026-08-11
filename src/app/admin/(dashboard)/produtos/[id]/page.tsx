import { notFound } from "next/navigation";

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ProductForm } from "@/features/catalog/components/product-form";
import { ProductImagesManager } from "@/features/catalog/components/product-images-manager";
import { ProductPartsManager } from "@/features/catalog/components/product-parts-manager";
import { ProductSizesManager } from "@/features/catalog/components/product-sizes-manager";
import { getAllFilamentOptions, getCategories, getProductWithConfigForAdmin } from "@/features/catalog/queries";
import { getStoreSettings } from "@/features/shipping/queries";

const TAB_VALUES = ["info", "tamanhos", "partes", "imagens"] as const;

export default async function EditarProdutoPage({
  params,
  searchParams,
}: PageProps<"/admin/produtos/[id]">) {
  const { id } = await params;
  const resolvedSearchParams = await searchParams;
  const requestedTab = resolvedSearchParams?.tab;
  const initialTab = TAB_VALUES.includes(requestedTab as (typeof TAB_VALUES)[number])
    ? (requestedTab as (typeof TAB_VALUES)[number])
    : "info";

  // Configurações da loja só alimentam a sugestão de preço (rodada 22) — um
  // extra, não pode derrubar a página do produto inteira se essa query
  // falhar (ex.: migração de store_settings ainda não aplicada em produção).
  // Mesmo princípio já usado no dashboard do admin (getAdminDashboardStats).
  const storeSettingsPromise = getStoreSettings().catch((error: unknown) => {
    console.error("[admin] falha ao buscar configurações da loja (sugestão de preço)", error);
    return null;
  });

  const [product, categories, allMaterials, storeSettings] = await Promise.all([
    getProductWithConfigForAdmin(id),
    getCategories(),
    getAllFilamentOptions(),
    storeSettingsPromise,
  ]);

  if (!product) notFound();

  const pricingSettings = {
    pricePerGramCents: storeSettings?.pricePerGramCents ?? null,
    fixedFeeCents: storeSettings?.fixedFeeCents ?? null,
  };

  return (
    <div>
      <h1 className="text-2xl font-semibold tracking-tight">Editar produto</h1>

      {/* defaultValue vem de ?tab= — createProduct manda o admin direto pra
      "partes" (o fluxo esperado é subir o arquivo 3D primeiro), sem isso a
      aba Info sempre reabriria por padrão mesmo vindo desse redirect. */}
      <Tabs defaultValue={initialTab} className="mt-6">
        <TabsList>
          <TabsTrigger value="info">Info</TabsTrigger>
          <TabsTrigger value="tamanhos">Tamanhos</TabsTrigger>
          <TabsTrigger value="partes">Partes</TabsTrigger>
          <TabsTrigger value="imagens">Imagens</TabsTrigger>
        </TabsList>

        <TabsContent value="info" className="mt-6">
          <ProductForm categories={categories} product={product} />
        </TabsContent>

        <TabsContent value="tamanhos" className="mt-6">
          <ProductSizesManager productId={product.id} sizes={product.sizeOptions} />
        </TabsContent>

        <TabsContent value="partes" className="mt-6">
          <ProductPartsManager
            productId={product.id}
            parts={product.parts}
            allMaterials={allMaterials}
            pricingSettings={pricingSettings}
          />
        </TabsContent>

        <TabsContent value="imagens" className="mt-6">
          <ProductImagesManager productId={product.id} images={product.images} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
