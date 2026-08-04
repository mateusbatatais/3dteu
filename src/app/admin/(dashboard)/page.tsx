import { Clock, DollarSign, Package, ShoppingBag } from "lucide-react";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { getAdminDashboardStats } from "@/features/orders/queries";
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
  const stats = await getAdminDashboardStats();

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
              <CardTitle className="text-2xl">{stat.format(stats[stat.key])}</CardTitle>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
