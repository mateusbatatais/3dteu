import { Box, Palette, Truck } from "lucide-react";
import Link from "next/link";

import { Button } from "@/components/ui/button";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

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

export default function HomePage() {
  return (
    <main className="flex flex-1 flex-col">
      <section className="mx-auto flex w-full max-w-5xl flex-col items-center gap-6 px-6 py-24 text-center">
        <h1 className="text-4xl font-semibold tracking-tight sm:text-5xl">Fidgets sob encomenda</h1>
        <p className="max-w-xl text-lg text-muted-foreground">
          Escolha o modelo, veja o preview em 3D e personalize cor e tamanho — impresso
          especialmente pra você.
        </p>
        <Button render={<Link href="/produtos" />} nativeButton={false} size="lg" className="rounded-full px-8">
          Ver catálogo
        </Button>
      </section>

      <section className="border-t bg-muted/30">
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
    </main>
  );
}
