import { LayoutDashboard, Package, Palette, ShoppingBag } from "lucide-react";
import type { ReactNode } from "react";
import Link from "next/link";

const NAV_ITEMS = [
  { href: "/admin", label: "Dashboard", icon: LayoutDashboard },
  { href: "/admin/produtos", label: "Produtos", icon: Package },
  { href: "/admin/materiais", label: "Materiais", icon: Palette },
  { href: "/admin/pedidos", label: "Pedidos", icon: ShoppingBag },
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
        <nav className="flex flex-col gap-1 px-3">
          {NAV_ITEMS.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            >
              <item.icon className="size-4" />
              {item.label}
            </Link>
          ))}
        </nav>
      </aside>

      <div className="flex flex-1 flex-col">
        <header className="flex h-14 items-center gap-5 overflow-x-auto border-b px-6 sm:hidden">
          {NAV_ITEMS.map((item) => (
            <Link key={item.href} href={item.href} className="shrink-0 text-sm font-medium text-muted-foreground">
              {item.label}
            </Link>
          ))}
        </header>
        <div className="flex-1 px-6 py-8 sm:px-10">{children}</div>
      </div>
    </div>
  );
}
