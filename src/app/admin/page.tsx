import Link from "next/link";

import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export default function AdminDashboardPage() {
  return (
    <div>
      <h1 className="text-2xl font-semibold tracking-tight">Dashboard</h1>
      <div className="mt-6 grid gap-4 sm:grid-cols-2">
        <Link href="/admin/produtos">
          <Card className="transition-colors hover:bg-muted/50">
            <CardHeader>
              <CardTitle>Produtos</CardTitle>
              <CardDescription>Cadastrar e editar o catálogo.</CardDescription>
            </CardHeader>
          </Card>
        </Link>
        <Card className="opacity-60">
          <CardHeader>
            <CardTitle>Pedidos</CardTitle>
            <CardDescription>Em breve.</CardDescription>
          </CardHeader>
        </Card>
      </div>
    </div>
  );
}
