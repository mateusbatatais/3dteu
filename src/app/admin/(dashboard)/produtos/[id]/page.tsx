import { notFound } from "next/navigation";

import { ProductForm } from "@/features/catalog/components/product-form";
import { ProductPartsManager } from "@/features/catalog/components/product-parts-manager";
import { ProductSizesManager } from "@/features/catalog/components/product-sizes-manager";
import { getAllFilamentOptions, getCategories, getProductWithConfigForAdmin } from "@/features/catalog/queries";

export default async function EditarProdutoPage({ params }: PageProps<"/admin/produtos/[id]">) {
  const { id } = await params;

  const [product, categories, allMaterials] = await Promise.all([
    getProductWithConfigForAdmin(id),
    getCategories(),
    getAllFilamentOptions(),
  ]);

  if (!product) notFound();

  return (
    <div className="flex flex-col gap-10">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Editar produto</h1>
        <div className="mt-6">
          <ProductForm categories={categories} product={product} />
        </div>
      </div>

      <ProductSizesManager productId={product.id} sizes={product.sizeOptions} />

      <ProductPartsManager productId={product.id} parts={product.parts} allMaterials={allMaterials} />
    </div>
  );
}
