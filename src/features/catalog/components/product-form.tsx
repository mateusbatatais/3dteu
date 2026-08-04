"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";

import { createProduct, updateProduct } from "../actions";
import { productFormSchema, type ProductFormValues } from "../schemas";

function slugify(value: string): string {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

interface ProductFormProps {
  categories: Array<{ id: string; name: string }>;
  product?: {
    id: string;
    name: string;
    slug: string;
    description: string | null;
    categoryId: string | null;
    basePriceCents: number;
    status: "draft" | "published";
    weightGrams: number | null;
    heightCm: number | null;
    widthCm: number | null;
    lengthCm: number | null;
    metaTitle: string | null;
    metaDescription: string | null;
  };
}

export function ProductForm({ categories, product }: ProductFormProps) {
  const router = useRouter();
  const [serverError, setServerError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const {
    register,
    handleSubmit,
    getValues,
    setValue,
    formState: { errors },
  } = useForm<ProductFormValues>({
    resolver: zodResolver(productFormSchema),
    defaultValues: product
      ? {
          name: product.name,
          slug: product.slug,
          description: product.description ?? "",
          categoryId: product.categoryId ?? "",
          basePriceReais: product.basePriceCents / 100,
          status: product.status,
          weightGrams: product.weightGrams ?? 0,
          heightCm: product.heightCm ?? 0,
          widthCm: product.widthCm ?? 0,
          lengthCm: product.lengthCm ?? 0,
          metaTitle: product.metaTitle ?? "",
          metaDescription: product.metaDescription ?? "",
        }
      : {
          name: "",
          slug: "",
          description: "",
          categoryId: "",
          basePriceReais: 0,
          status: "draft",
          weightGrams: 0,
          heightCm: 0,
          widthCm: 0,
          lengthCm: 0,
          metaTitle: "",
          metaDescription: "",
        },
  });

  function handleNameBlur() {
    if (product) return; // não sobrescreve o slug ao editar um produto existente
    if (getValues("slug")) return;
    setValue("slug", slugify(getValues("name")));
  }

  function onSubmit(values: ProductFormValues) {
    setServerError(null);
    startTransition(async () => {
      const result = product ? await updateProduct(product.id, values) : await createProduct(values);
      if (result?.error) {
        setServerError(result.error);
        return;
      }
      if (product) {
        toast.success("Produto atualizado.");
        router.refresh();
      }
    });
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="flex max-w-xl flex-col gap-4">
      <div className="flex flex-col gap-2">
        <Label htmlFor="name">Nome</Label>
        <Input id="name" {...register("name")} onBlur={handleNameBlur} />
        {errors.name ? <p className="text-sm text-destructive">{errors.name.message}</p> : null}
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="slug">Slug</Label>
        <Input id="slug" {...register("slug")} />
        <p className="text-xs text-muted-foreground">Usado na URL: /produtos/seu-slug</p>
        {errors.slug ? <p className="text-sm text-destructive">{errors.slug.message}</p> : null}
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="description">Descrição</Label>
        <Textarea id="description" rows={4} {...register("description")} />
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="categoryId">Categoria</Label>
        <Select
          defaultValue={product?.categoryId ?? undefined}
          onValueChange={(value) => setValue("categoryId", value ?? "")}
        >
          <SelectTrigger id="categoryId" className="w-full">
            <SelectValue placeholder="Sem categoria" />
          </SelectTrigger>
          <SelectContent>
            {categories.map((category) => (
              <SelectItem key={category.id} value={category.id}>
                {category.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="basePriceReais">Preço base (R$)</Label>
        <Input id="basePriceReais" type="number" step="0.01" min="0" {...register("basePriceReais")} />
        {errors.basePriceReais ? <p className="text-sm text-destructive">{errors.basePriceReais.message}</p> : null}
      </div>

      <div>
        <h3 className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
          Peso e dimensões da embalagem
        </h3>
        <p className="mt-1 text-xs text-muted-foreground">
          Opcional — usado para calcular o frete. Sem esses valores, a cotação usa um fallback de caixa pequena.
        </p>
        <div className="mt-2 grid grid-cols-2 gap-4 sm:grid-cols-4">
          <div className="flex flex-col gap-2">
            <Label htmlFor="weightGrams">Peso (g)</Label>
            <Input id="weightGrams" type="number" min="1" {...register("weightGrams")} />
            {errors.weightGrams ? <p className="text-sm text-destructive">{errors.weightGrams.message}</p> : null}
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="heightCm">Altura (cm)</Label>
            <Input id="heightCm" type="number" min="1" {...register("heightCm")} />
            {errors.heightCm ? <p className="text-sm text-destructive">{errors.heightCm.message}</p> : null}
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="widthCm">Largura (cm)</Label>
            <Input id="widthCm" type="number" min="1" {...register("widthCm")} />
            {errors.widthCm ? <p className="text-sm text-destructive">{errors.widthCm.message}</p> : null}
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="lengthCm">Comprimento (cm)</Label>
            <Input id="lengthCm" type="number" min="1" {...register("lengthCm")} />
            {errors.lengthCm ? <p className="text-sm text-destructive">{errors.lengthCm.message}</p> : null}
          </div>
        </div>
      </div>

      <div>
        <h3 className="text-xs font-medium tracking-wide text-muted-foreground uppercase">SEO</h3>
        <p className="mt-1 text-xs text-muted-foreground">
          Opcional — sem preencher, a página usa o nome e a descrição normais do produto.
        </p>
        <div className="mt-2 flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <Label htmlFor="metaTitle">Título para SEO</Label>
            <Input id="metaTitle" {...register("metaTitle")} />
            {errors.metaTitle ? <p className="text-sm text-destructive">{errors.metaTitle.message}</p> : null}
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="metaDescription">Descrição para SEO</Label>
            <Textarea id="metaDescription" rows={2} {...register("metaDescription")} />
            {errors.metaDescription ? (
              <p className="text-sm text-destructive">{errors.metaDescription.message}</p>
            ) : null}
          </div>
        </div>
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="status">Status</Label>
        <Select
          defaultValue={product?.status ?? "draft"}
          onValueChange={(value) => setValue("status", value as ProductFormValues["status"])}
        >
          <SelectTrigger id="status" className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="draft">Rascunho</SelectItem>
            <SelectItem value="published">Publicado</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {serverError ? <p className="text-sm text-destructive">{serverError}</p> : null}

      <Button type="submit" disabled={isPending} className="mt-2">
        {isPending ? "Salvando..." : product ? "Salvar alterações" : "Criar produto"}
      </Button>
    </form>
  );
}
