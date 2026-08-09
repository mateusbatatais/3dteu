import type { ReactNode } from "react";
import Link from "next/link";

import { AdminMobileNav, AdminSidebarNav } from "./admin-nav";

export default function DashboardLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-full flex-1">
      <aside className="hidden w-56 shrink-0 flex-col border-r bg-muted/20 sm:flex">
        <div className="flex h-16 items-center px-6">
          <Link href="/admin" className="font-semibold tracking-tight">
            3D Teu admin
          </Link>
        </div>
        <AdminSidebarNav />
      </aside>

      <div className="flex flex-1 flex-col">
        <AdminMobileNav />
        <div className="flex-1 px-6 py-8 sm:px-10">{children}</div>
      </div>
    </div>
  );
}
