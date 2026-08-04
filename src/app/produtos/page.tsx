import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Catálogo",
  description: "Fidgets impressos em 3D sob encomenda, com cor e tamanho personalizáveis.",
};

export default function ProdutosPage() {
  // TODO(Fase 1): listar produtos publicados via db.query.products.findMany({ where: eq(status, "published") })
  return (
    <main className="mx-auto w-full max-w-6xl flex-1 px-6 py-16">
      <h1 className="text-3xl font-semibold tracking-tight">Catálogo</h1>
      <p className="mt-2 text-muted-foreground">Em breve: listagem de produtos com filtro por categoria e preço.</p>
    </main>
  );
}
