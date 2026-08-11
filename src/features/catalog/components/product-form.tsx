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

import { updateProduct } from "../actions";
import { productFormSchema, type ProductFormValues } from "../schemas";

interface ProductFormProps {
  categories: Array<{ id: string; name: string }>;
  product: {
    id: string;
    name: string;
    slug: string;
    description: string | null;
    categoryId: string | null;
    basePriceCents: number;
    status: "draft" | "published";
    metaTitle: string | null;
    metaDescription: string | null;
  };
}

// Editar informações básicas de um produto já existente — peso/dimensões
// (aba Partes, preenchidos automaticamente a partir do arquivo 3D) e
// nome/preço/materiais na criação (NewProductForm, tela única) ficam fora
// daqui de propósito.
export function ProductForm({ categories, product }: ProductFormProps) {
  const router = useRouter();
  const [serverError, setServerError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const {
    register,
    handleSubmit,
    setValue,
    formState: { errors },
  } = useForm<ProductFormValues>({
    resolver: zodResolver(productFormSchema),
    defaultValues: {
      name: product.name,
      slug: product.slug,
      description: product.description ?? "",
      categoryId: product.categoryId ?? "",
      basePriceReais: product.basePriceCents / 100,
      status: product.status,
      metaTitle: product.metaTitle ?? "",
      metaDescription: product.metaDescription ?? "",
    },
  });

  function onSubmit(values: ProductFormValues) {
    setServerError(null);
    startTransition(async () => {
      const result = await updateProduct(product.id, values);
      if (result?.error) {
        setServerError(result.error);
        return;
      }
      toast.success("Produto atualizado.");
      router.refresh();
    });
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="flex max-w-xl flex-col gap-4">
      <div className="flex flex-col gap-2">
        <Label htmlFor="name">Nome</Label>
        <Input id="name" {...register("name")} />
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
          defaultValue={product.categoryId ?? undefined}
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
        <p className="text-xs text-muted-foreground">
          Pode deixar 0 por enquanto — na aba Partes, depois de enviar o arquivo 3D, dá pra usar o preço sugerido a
          partir do peso estimado. Só precisa ser maior que zero pra publicar o produto.
        </p>
        {errors.basePriceReais ? <p className="text-sm text-destructive">{errors.basePriceReais.message}</p> : null}
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
          defaultValue={product.status}
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
        {isPending ? "Salvando..." : "Salvar alterações"}
      </Button>
    </form>
  );
}
