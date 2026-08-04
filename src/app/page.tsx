import Link from "next/link";

export default function HomePage() {
  return (
    <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col items-center justify-center gap-6 px-6 py-24 text-center">
      <h1 className="text-4xl font-semibold tracking-tight">Fidgets sob encomenda</h1>
      <p className="max-w-xl text-lg text-muted-foreground">
        Escolha o modelo, veja o preview em 3D, personalize cor e tamanho — impresso e
        enviado (ou retirado em mãos) pra você.
      </p>
      <Link
        href="/produtos"
        className="rounded-full bg-foreground px-6 py-3 text-sm font-medium text-background transition-colors hover:opacity-90"
      >
        Ver catálogo
      </Link>
    </main>
  );
}
