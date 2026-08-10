"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState, useTransition } from "react";

import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

const ALL_CATEGORIES = "__all__";

export function CatalogFilters({
  categories,
  activeCategorySlug,
}: {
  categories: Array<{ slug: string; name: string }>;
  /** Presente quando renderizado dentro de /categorias/[slug] — pré-seleciona no dropdown. */
  activeCategorySlug?: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const currentQ = searchParams.get("q") ?? "";

  const [q, setQ] = useState(currentQ);
  const [, startTransition] = useTransition();

  // Busca por texto fica como query param na página atual (home ou
  // categoria) — debounced pra não navegar a cada tecla.
  useEffect(() => {
    if (q === currentQ) return;
    const timeout = setTimeout(() => {
      const params = new URLSearchParams(searchParams.toString());
      if (q) params.set("q", q);
      else params.delete("q");
      startTransition(() => {
        router.replace(params.size > 0 ? `${pathname}?${params.toString()}` : pathname);
      });
    }, 400);
    return () => clearTimeout(timeout);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q]);

  // Categoria é uma página própria (/categorias/slug), não um query param —
  // melhor pra SEO (URL única e indexável por categoria). Troca de página
  // preserva a busca por texto, se tiver uma.
  function handleCategoryChange(value: string | null) {
    const query = q ? `?q=${encodeURIComponent(q)}` : "";
    router.push(!value || value === ALL_CATEGORIES ? `/${query}` : `/categorias/${value}${query}`);
  }

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
        <Select value={activeCategorySlug ?? ALL_CATEGORIES} onValueChange={handleCategoryChange}>
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
