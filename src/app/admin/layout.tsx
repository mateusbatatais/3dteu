// Painel autenticado: nunca faz sentido pré-renderizar estaticamente (dados
// mudam por request e dependem de sessão), então força toda a subárvore /admin
// a ser renderizada dinamicamente — também evita que o build tente prerenderizar
// páginas que consultam o banco antes de DATABASE_URL existir.
export const dynamic = "force-dynamic";

// Autenticação (sessão válida) já é garantida pelo proxy (src/proxy.ts), que
// redireciona para /admin/login quando não há usuário logado. A checagem de
// *role* (tabela admin_users) entra quando as páginas de dados forem implementadas.
//
// Este layout fica bem enxuto de propósito: o menu lateral vive em
// admin/(dashboard)/layout.tsx, que não envolve a página de login.
export default function AdminLayout({ children }: LayoutProps<"/admin">) {
  return <div className="flex min-h-full flex-1 flex-col">{children}</div>;
}
