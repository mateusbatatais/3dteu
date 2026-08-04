export default async function PedidoPage({ params }: PageProps<"/pedido/[token]">) {
  const { token } = await params;

  // TODO(Fase 1): buscar pedido por publicToken (sem exigir login) e exibir status/itens.
  // Este é o link enviado por e-mail para o cliente acompanhar o pedido como convidado.
  return (
    <main className="mx-auto w-full max-w-2xl flex-1 px-6 py-16">
      <h1 className="text-3xl font-semibold tracking-tight">Acompanhar pedido</h1>
      <p className="mt-2 break-all text-muted-foreground">Token: {token}</p>
    </main>
  );
}
