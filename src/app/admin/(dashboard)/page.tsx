import { Clock, DollarSign, Package, ShoppingBag } from "lucide-react";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { getAdminDashboardStats, type AdminDashboardStats } from "@/features/orders/queries";
import { formatPriceCents } from "@/lib/format";

const STAT_CARDS = [
  {
    key: "publishedProductCount" as const,
    label: "Produtos publicados",
    icon: Package,
    format: (value: number) => value.toString(),
  },
  {
    key: "awaitingPaymentCount" as const,
    label: "Aguardando pagamento",
    icon: Clock,
    format: (value: number) => value.toString(),
  },
  {
    key: "ordersLast7DaysCount" as const,
    label: "Pedidos (7 dias)",
    icon: ShoppingBag,
    format: (value: number) => value.toString(),
  },
  {
    key: "totalRevenueCents" as const,
    label: "Faturamento (pago)",
    icon: DollarSign,
    format: (value: number) => formatPriceCents(value),
  },
];

export default async function AdminDashboardPage() {
  // Best-effort, mesmo princípio já usado pra Woovi/Resend/Superfrete: os
  // números do dashboard são um extra, nunca deveriam derrubar a página
  // inteira. Se a query falhar, loga o erro de verdade (aparece no log da
  // Vercel) e mostra "—" em vez de "This page couldn't load".
  let stats: AdminDashboardStats | null = null;
  try {
    stats = await getAdminDashboardStats();
  } catch (error) {
    console.error("[admin] falha ao buscar estatísticas do dashboard", error);
  }

  return (
    <div>
      <h1 className="text-2xl font-semibold tracking-tight">Dashboard</h1>
      <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {STAT_CARDS.map((stat) => (
          <Card key={stat.key}>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardDescription>{stat.label}</CardDescription>
                <stat.icon className="size-4 text-muted-foreground" />
              </div>
            </CardHeader>
            <CardContent>
              <CardTitle className="text-2xl">{stats ? stat.format(stats[stat.key]) : "—"}</CardTitle>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
