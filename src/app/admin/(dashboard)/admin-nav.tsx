"use client";

import type { LucideIcon } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";

import { cn } from "@/lib/utils";

export interface AdminNavItem {
  href: string;
  label: string;
  icon: LucideIcon;
}

function isActiveHref(pathname: string, href: string): boolean {
  // "/admin" não pode usar startsWith, senão fica sempre ativo (é prefixo de tudo).
  return href === "/admin" ? pathname === "/admin" : pathname.startsWith(href);
}

export function AdminSidebarNav({ items }: { items: readonly AdminNavItem[] }) {
  const pathname = usePathname();

  return (
    <nav className="flex flex-col gap-1 px-3">
      {items.map((item) => {
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

export function AdminMobileNav({ items }: { items: readonly AdminNavItem[] }) {
  const pathname = usePathname();

  return (
    <header className="flex h-14 items-center gap-5 overflow-x-auto border-b px-6 sm:hidden">
      {items.map((item) => {
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
