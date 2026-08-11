"use client";

import { useState } from "react";

import { ConfirmDeleteButton } from "@/components/confirm-delete-button";
import { Button } from "@/components/ui/button";

import { deleteCategory, updateCategory } from "../category-actions";
import { CategoryForm } from "./category-form";
import { CategoryImageUpload } from "./category-image-upload";
import { CategoryMaterialRecommendations } from "./category-material-recommendations";

interface CategoryRow {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  imageUrl: string | null;
}

interface MaterialTypeOption {
  id: string;
  name: string;
  materialName: string;
}

export function CategoryRow({
  category,
  allMaterialTypes,
  recommendedTypeIds,
}: {
  category: CategoryRow;
  allMaterialTypes: MaterialTypeOption[];
  recommendedTypeIds: string[];
}) {
  const [isEditing, setIsEditing] = useState(false);

  return (
    <div className="flex max-w-2xl flex-col gap-3 rounded-xl bg-card p-4 ring-1 ring-foreground/10">
      {isEditing ? (
        <CategoryForm
          mode="edit"
          initialValues={{ name: category.name, slug: category.slug, description: category.description ?? "" }}
          onSubmit={(input) => updateCategory(category.id, input)}
          onCancel={() => setIsEditing(false)}
        />
      ) : (
        <>
          <div className="flex items-center justify-between">
            <div>
              <p className="font-medium">{category.name}</p>
              <p className="text-xs text-muted-foreground">/categorias/{category.slug}</p>
              {category.description ? <p className="mt-1 text-sm text-muted-foreground">{category.description}</p> : null}
            </div>
            <div className="flex gap-2">
              <Button type="button" size="sm" variant="outline" onClick={() => setIsEditing(true)}>
                Editar
              </Button>
              <ConfirmDeleteButton
                action={deleteCategory.bind(null, category.id)}
                description={`Excluir a categoria "${category.name}"? Produtos nela ficam sem categoria, não são excluídos.`}
              />
            </div>
          </div>
          <CategoryImageUpload categoryId={category.id} imageUrl={category.imageUrl} />
          <CategoryMaterialRecommendations
            categoryId={category.id}
            allMaterialTypes={allMaterialTypes}
            recommendedTypeIds={recommendedTypeIds}
          />
        </>
      )}
    </div>
  );
}
