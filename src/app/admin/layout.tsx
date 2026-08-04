import Link from "next/link";

// Painel autenticado: nunca faz sentido pré-renderizar estaticamente (dados
// mudam por request e dependem de sessão), então força toda a subárvore /admin
// a ser renderizada dinamicamente — também evita que o build tente prerenderizar
// páginas que consultam o banco antes de DATABASE_URL existir.
export const dynamic = "force-dynamic";

// Autenticação (sessão válida) já é garantida pelo proxy (src/proxy.ts), que
// redireciona para /admin/login quando não há usuário logado. A checagem de
// *role* (tabela admin_users) entra quando as páginas de dados forem implementadas.
export default function AdminLayout({ children }: LayoutProps<"/admin">) {
  return (
    <div className="flex min-h-full flex-1 flex-col">
      <header className="border-b px-6 py-4">
        <Link href="/admin" className="text-sm font-medium text-muted-foreground hover:text-foreground">
          Painel administrativo
        </Link>
      </header>
      <div className="flex-1 px-6 py-8">{children}</div>
    </div>
  );
}
