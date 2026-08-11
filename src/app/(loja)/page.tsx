import { Box, Palette, Truck } from "lucide-react";
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

        <div className="relative mx-auto flex w-full max-w-5xl flex-col items-center gap-6 px-6 py-24 text-center">
          <h1 className="text-4xl font-semibold tracking-tight sm:text-5xl">
            Peças em 3D pra <RotatingTeu />.
          </h1>
          <p className="max-w-xl text-lg text-muted-foreground">
            Fidgets, decoração, presentes ou qualquer ideia — escolha o modelo, veja o preview em 3D e
            personalize cor e tamanho, impresso especialmente pra você.
          </p>
          <Button render={<Link href="#catalogo" />} nativeButton={false} size="lg" className="rounded-full px-8">
            Ver catálogo
          </Button>
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

      <section className="mx-auto w-full max-w-5xl px-6 py-16">
        <h2 className="text-2xl font-semibold tracking-tight">Como imprimimos</h2>
        <p className="mt-1 text-muted-foreground">
          Duas tecnologias, cada uma melhor pra um tipo de peça (ver diferença de material no configurador).
        </p>
        <div className="mt-6 grid gap-6 sm:grid-cols-2">
          <div>
            <AnimatedModelViewer src="/animatedfile1/model.glb" label="Impressora FDM" />
            <p className="mt-2 text-center text-sm font-medium">Impressora FDM</p>
          </div>
          <div>
            <AnimatedModelViewer src="/animatedfile2/model.glb" label="Impressora de resina (SLA)" />
            <p className="mt-2 text-center text-sm font-medium">Impressora de resina (SLA)</p>
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
