import { notFound } from "next/navigation";

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ProductForm } from "@/features/catalog/components/product-form";
import { ProductImagesManager } from "@/features/catalog/components/product-images-manager";
import { ProductPartsManager } from "@/features/catalog/components/product-parts-manager";
import { ProductSizesManager } from "@/features/catalog/components/product-sizes-manager";
import { getAllFilamentOptions, getCategories, getProductWithConfigForAdmin } from "@/features/catalog/queries";
import { getStoreSettings } from "@/features/shipping/queries";

export default async function EditarProdutoPage({ params }: PageProps<"/admin/produtos/[id]">) {
  const { id } = await params;

  const [product, categories, allMaterials, storeSettings] = await Promise.all([
    getProductWithConfigForAdmin(id),
    getCategories(),
    getAllFilamentOptions(),
    getStoreSettings(),
  ]);

  if (!product) notFound();

  const pricingSettings = {
    pricePerGramCents: storeSettings?.pricePerGramCents ?? null,
    fixedFeeCents: storeSettings?.fixedFeeCents ?? null,
  };

  return (
    <div>
      <h1 className="text-2xl font-semibold tracking-tight">Editar produto</h1>

      <Tabs defaultValue="info" className="mt-6">
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
