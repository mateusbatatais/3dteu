import { notFound } from "next/navigation";

import { ProductForm } from "@/features/catalog/components/product-form";
import { getCategories, getProductByIdForAdmin } from "@/features/catalog/queries";

export default async function EditarProdutoPage({ params }: PageProps<"/admin/produtos/[id]">) {
  const { id } = await params;

  const [product, categories] = await Promise.all([getProductByIdForAdmin(id), getCategories()]);

  if (!product) notFound();

  return (
    <div>
      <h1 className="text-2xl font-semibold tracking-tight">Editar produto</h1>
      <div className="mt-6">
        <ProductForm categories={categories} product={product} />
      </div>
    </div>
  );
}
