"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState, useTransition } from "react";

import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

const ALL_CATEGORIES = "__all__";

export function CatalogFilters({ categories }: { categories: Array<{ slug: string; name: string }> }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const currentQ = searchParams.get("q") ?? "";
  const currentCategory = searchParams.get("categoria") ?? ALL_CATEGORIES;

  const [q, setQ] = useState(currentQ);
  const [, startTransition] = useTransition();

  function updateParams(next: Record<string, string | null>) {
    const params = new URLSearchParams(searchParams.toString());
    for (const [key, value] of Object.entries(next)) {
      if (value) params.set(key, value);
      else params.delete(key);
    }
    startTransition(() => {
      router.replace(params.size > 0 ? `${pathname}?${params.toString()}` : pathname);
    });
  }

  // Busca por texto é debounced pra não navegar a cada tecla — categoria
  // (Select) já é uma escolha discreta, atualiza a URL na hora.
  useEffect(() => {
    if (q === currentQ) return;
    const timeout = setTimeout(() => updateParams({ q: q || null }), 400);
    return () => clearTimeout(timeout);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q]);

  return (
    <div className="mt-6 flex flex-wrap gap-3">
      <Input
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="Buscar produtos..."
        className="max-w-xs"
        aria-label="Buscar produtos"
      />
      {categories.length > 0 ? (
        <Select
          value={currentCategory}
          onValueChange={(value) => updateParams({ categoria: value === ALL_CATEGORIES ? null : value })}
        >
          <SelectTrigger className="w-48">
            <SelectValue placeholder="Todas as categorias" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL_CATEGORIES}>Todas as categorias</SelectItem>
            {categories.map((category) => (
              <SelectItem key={category.slug} value={category.slug}>
                {category.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      ) : null}
    </div>
  );
}
