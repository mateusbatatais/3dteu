import { redirect } from "next/navigation";

// A home virou o catálogo (rodada 18) — /produtos não existe mais como
// página própria, só redireciona (preserva link antigo/SEO em vez de 404).
// Filtro de categoria agora é uma página própria (/categorias/slug), então
// ?categoria= vira um redirect pra lá; ?q= é repassado como está.
export default async function ProdutosRedirectPage({ searchParams }: PageProps<"/produtos">) {
  const params = await searchParams;
  const q = typeof params.q === "string" ? params.q : undefined;
  const categoria = typeof params.categoria === "string" ? params.categoria : undefined;

  const query = q ? `?q=${encodeURIComponent(q)}` : "";
  redirect(categoria ? `/categorias/${categoria}${query}` : `/${query}`);
}
