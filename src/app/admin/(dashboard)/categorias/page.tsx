import { CategoryForm } from "@/features/catalog/components/category-form";
import { CategoryRow } from "@/features/catalog/components/category-row";
import { createCategory } from "@/features/catalog/category-actions";
import { getCategories, getCategoryRecommendedMaterialTypesMap, getMaterialCatalog } from "@/features/catalog/queries";

export default async function AdminCategoriasPage() {
  const [categoryList, materialCatalog, recommendationsMap] = await Promise.all([
    getCategories(),
    getMaterialCatalog(),
    getCategoryRecommendedMaterialTypesMap(),
  ]);

  const allMaterialTypes = materialCatalog.flatMap((material) =>
    material.types.map((type) => ({ id: type.id, name: type.name, materialName: material.name })),
  );

  return (
    <div>
      <h1 className="text-2xl font-semibold tracking-tight">Categorias</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Agrupam produtos na home e em páginas próprias (/categorias/slug). Cada uma pode ter uma imagem de capa — sem
        ela, aparece um degradê com a cor da marca no lugar.
      </p>

      <h2 className="mt-6 text-xs font-medium tracking-wide text-muted-foreground uppercase">Nova categoria</h2>
      <div className="mt-2">
        <CategoryForm mode="create" onSubmit={createCategory} />
      </div>

      {categoryList.length === 0 ? (
        <p className="mt-6 text-muted-foreground">Nenhuma categoria cadastrada ainda.</p>
      ) : (
        <div className="mt-6 flex flex-col gap-3">
          {categoryList.map((category) => (
            <CategoryRow
              key={category.id}
              category={category}
              allMaterialTypes={allMaterialTypes}
              recommendedTypeIds={recommendationsMap[category.id] ?? []}
            />
          ))}
        </div>
      )}
    </div>
  );
}
