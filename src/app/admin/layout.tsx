// Autenticação (sessão válida) já é garantida pelo middleware (src/middleware.ts),
// que redireciona para /admin/login quando não há usuário logado. A checagem de
// *role* (tabela admin_users) entra quando as páginas de dados forem implementadas.
export default function AdminLayout({ children }: LayoutProps<"/admin">) {
  return (
    <div className="flex min-h-full flex-1 flex-col">
      <header className="border-b px-6 py-4">
        <span className="text-sm font-medium text-muted-foreground">Painel administrativo</span>
      </header>
      <div className="flex-1 px-6 py-8">{children}</div>
    </div>
  );
}
