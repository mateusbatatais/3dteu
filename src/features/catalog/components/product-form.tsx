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
        }
      : {
          name: "",
          slug: "",
          description: "",
          categoryId: "",
          basePriceReais: 0,
          status: "draft",
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
