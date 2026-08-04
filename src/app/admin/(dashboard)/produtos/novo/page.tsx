import { ProductForm } from "@/features/catalog/components/product-form";
import { getCategories } from "@/features/catalog/queries";

export default async function NovoProdutoPage() {
  const categories = await getCategories();

  return (
    <div>
      <h1 className="text-2xl font-semibold tracking-tight">Novo produto</h1>
      <div className="mt-6">
        <ProductForm categories={categories} />
      </div>
    </div>
  );
}
