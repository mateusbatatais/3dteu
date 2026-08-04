import { LayoutDashboard, Package, Palette, Settings, ShoppingBag } from "lucide-react";
import type { ReactNode } from "react";
import Link from "next/link";

import { AdminMobileNav, AdminSidebarNav } from "./admin-nav";

const NAV_ITEMS = [
  { href: "/admin", label: "Dashboard", icon: LayoutDashboard },
  { href: "/admin/produtos", label: "Produtos", icon: Package },
  { href: "/admin/materiais", label: "Materiais", icon: Palette },
  { href: "/admin/pedidos", label: "Pedidos", icon: ShoppingBag },
  { href: "/admin/configuracoes", label: "Configurações", icon: Settings },
] as const;

export default function DashboardLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-full flex-1">
      <aside className="hidden w-56 shrink-0 flex-col border-r bg-muted/20 sm:flex">
        <div className="flex h-16 items-center px-6">
          <Link href="/admin" className="font-semibold tracking-tight">
            Fidgets admin
          </Link>
        </div>
        <AdminSidebarNav items={NAV_ITEMS} />
      </aside>

      <div className="flex flex-1 flex-col">
        <AdminMobileNav items={NAV_ITEMS} />
        <div className="flex-1 px-6 py-8 sm:px-10">{children}</div>
      </div>
    </div>
  );
}
