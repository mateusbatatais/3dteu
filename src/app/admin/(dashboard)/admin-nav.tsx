"use client";

import { LayoutDashboard, Package, Palette, Settings, ShoppingBag } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";

import { cn } from "@/lib/utils";

// Definido aqui dentro (não recebido via prop) de propósito: `icon` guarda
// uma referência de componente, e passar isso como prop de um Server
// Component (o layout, que não é "use client") pra um Client Component
// quebra em produção — "Functions cannot be passed directly to Client
// Components" (aparece só como o React error #441 genérico, sem essa
// mensagem, porque o Next esconde o texto real em produção). Bug real desta
// sessão: passou no teste porque a página de teste era client inteira, sem
// atravessar a fronteira Server→Client de verdade.
const NAV_ITEMS = [
  { href: "/admin", label: "Dashboard", icon: LayoutDashboard },
  { href: "/admin/produtos", label: "Produtos", icon: Package },
  { href: "/admin/materiais", label: "Materiais", icon: Palette },
  { href: "/admin/pedidos", label: "Pedidos", icon: ShoppingBag },
  { href: "/admin/configuracoes", label: "Configurações", icon: Settings },
] as const;

function isActiveHref(pathname: string, href: string): boolean {
  // "/admin" não pode usar startsWith, senão fica sempre ativo (é prefixo de tudo).
  return href === "/admin" ? pathname === "/admin" : pathname.startsWith(href);
}

export function AdminSidebarNav() {
  const pathname = usePathname();

  return (
    <nav className="flex flex-col gap-1 px-3">
      {NAV_ITEMS.map((item) => {
        const isActive = isActiveHref(pathname, item.href);
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={isActive ? "page" : undefined}
            className={cn(
              "flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
              isActive ? "bg-primary/10 text-primary" : "text-muted-foreground hover:bg-muted hover:text-foreground",
            )}
          >
            <item.icon className="size-4" />
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}

export function AdminMobileNav() {
  const pathname = usePathname();

  return (
    <header className="flex h-14 items-center gap-5 overflow-x-auto border-b px-6 sm:hidden">
      {NAV_ITEMS.map((item) => {
        const isActive = isActiveHref(pathname, item.href);
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={isActive ? "page" : undefined}
            className={cn("shrink-0 text-sm font-medium", isActive ? "text-primary" : "text-muted-foreground")}
          >
            {item.label}
          </Link>
        );
      })}
    </header>
  );
}
