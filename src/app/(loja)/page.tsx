import { Box, Palette, Sparkles, Truck } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";

import { AnimatedModelViewer } from "@/components/animated-model-viewer";
import { RotatingTeu } from "@/components/rotating-teu";
import { Button } from "@/components/ui/button";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { CatalogFilters } from "@/features/catalog/components/catalog-filters";
import { CategoryTiles } from "@/features/catalog/components/category-tiles";
import { ProductGrid } from "@/features/catalog/components/product-grid";
import { getCategories } from "@/features/catalog/queries";

export const metadata: Metadata = {
  alternates: { canonical: "/" },
};

// Sem página de catálogo separada — a home é o catálogo (ver rodada 18).
// Ainda depende do banco (categorias + produtos), então continua dynamic.
export const dynamic = "force-dynamic";

const FEATURES = [
  {
    icon: Box,
    title: "Preview em 3D",
    description: "Veja o modelo girando antes de comprar, do jeito que vai sair da impressora.",
  },
  {
    icon: Palette,
    title: "Cor e material à sua escolha",
    description: "Sólida, dual-color ou especiais como madeira — o preço se ajusta na hora.",
  },
  {
    icon: Truck,
    title: "Retirada ou envio",
    description: "Combine a retirada em mãos ou receba em casa.",
  },
];

export default async function HomePage({ searchParams }: PageProps<"/">) {
  const params = await searchParams;
  const q = typeof params.q === "string" ? params.q : undefined;

  const categoryList = await getCategories();

  return (
    <main className="flex flex-1 flex-col">
      <section className="relative overflow-hidden border-b bg-gradient-to-br from-primary/10 via-background to-brand-orange/10">
        {/* Sem foto de fundo real ainda — esses círculos com blur ficam no
        lugar até o usuário trocar por uma imagem de verdade. */}
        <div aria-hidden className="pointer-events-none absolute -top-24 -left-24 size-72 rounded-full bg-primary/25 blur-3xl" />
        <div aria-hidden className="pointer-events-none absolute -right-24 -bottom-24 size-72 rounded-full bg-brand-orange/25 blur-3xl" />

        <div className="relative mx-auto flex w-full max-w-5xl flex-col items-center gap-10 px-6 py-16 text-center lg:flex-row lg:justify-between lg:py-24 lg:text-left">
          <div className="flex max-w-xl flex-col items-center gap-6 lg:items-start">
            <h1 className="text-4xl font-semibold tracking-tight sm:text-5xl">
              Peças em 3D pra <RotatingTeu />.
            </h1>
            <p className="text-lg text-muted-foreground">
              Fidgets, decoração, presentes ou qualquer ideia — escolha o modelo, veja o preview em 3D e
              personalize cor e tamanho, impresso especialmente pra você.
            </p>
            <Button render={<Link href="#catalogo" />} nativeButton={false} size="lg" className="rounded-full px-8">
              Ver catálogo
            </Button>
          </div>
          {/* Só um toque visual — gira sozinho, sem legenda nem explicação. */}
          <div className="w-full max-w-52 shrink-0 sm:max-w-64">
            <AnimatedModelViewer src="/animatedfile2/model.glb" />
          </div>
        </div>
      </section>

      <section className="border-b bg-muted/30">
        <div className="mx-auto grid w-full max-w-5xl gap-6 px-6 py-16 sm:grid-cols-3">
          {FEATURES.map((feature) => (
            <Card key={feature.title} className="border-none bg-transparent shadow-none">
              <CardHeader>
                <feature.icon className="size-6 text-primary" />
                <CardTitle className="mt-3 text-base">{feature.title}</CardTitle>
                <CardDescription>{feature.description}</CardDescription>
              </CardHeader>
            </Card>
          ))}
        </div>
      </section>

      <section className="border-b bg-gradient-to-br from-brand-orange/5 via-background to-primary/5">
        <div className="mx-auto flex w-full max-w-5xl flex-col items-center gap-10 px-6 py-16 text-center lg:flex-row lg:justify-between lg:text-left">
          <div className="flex max-w-md flex-col items-center gap-4 lg:items-start">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-brand-orange/10 px-3 py-1 text-xs font-medium text-brand-orange">
              <Sparkles className="size-3.5" /> Novidade
            </span>
            <h2 className="text-2xl font-semibold tracking-tight sm:text-3xl">Imprima algo customizado</h2>
            <p className="text-muted-foreground">
              Tem uma ideia específica em mente? Mande fotos do que você quer e a gente gera um modelo 3D com IA —
              você vê o preview antes de decidir se quer imprimir de verdade.
            </p>
            <Button
              render={<Link href="/conta/modelo-3d" />}
              nativeButton={false}
              size="lg"
              variant="outline"
              className="rounded-full px-8"
            >
              Pedir modelo customizado
            </Button>
          </div>
          <div className="w-full max-w-64 shrink-0 sm:max-w-72">
            {/* margin mais baixo que o padrão: esse modelo (hoje um jipe de
            teste) é bem mais comprido num eixo que nos outros, e o padrão
            deixava ele pequeno demais no quadro — ver o porquê em
            AnimatedModelViewer. Reconsiderar esse valor quando trocar pelo
            arquivo real da impressora, que pode ter proporções diferentes. */}
            <AnimatedModelViewer src="/animatedfile1/model.glb" margin={1.15} />
          </div>
        </div>
      </section>

      {categoryList.length > 0 ? (
        <section className="mx-auto w-full max-w-6xl px-6 py-16">
          <h2 className="text-2xl font-semibold tracking-tight">Categorias</h2>
          <div className="mt-6">
            <CategoryTiles categories={categoryList} />
          </div>
        </section>
      ) : null}

      <section id="catalogo" className="mx-auto w-full max-w-6xl scroll-mt-16 px-6 py-16">
        <h2 className="text-2xl font-semibold tracking-tight">Catálogo</h2>

        <Suspense fallback={<div className="mt-6 h-10" />}>
          <CatalogFilters categories={categoryList} />
        </Suspense>

        <ProductGrid q={q} />
      </section>
    </main>
  );
}
