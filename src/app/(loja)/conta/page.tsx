import Link from "next/link";
import { redirect } from "next/navigation";

import { Badge } from "@/components/ui/badge";
import { LogoutButton } from "@/features/orders/components/logout-button";
import { getOrdersByCustomerId } from "@/features/orders/queries";
import { ORDER_STATUS_BADGE_CLASSES, ORDER_STATUS_LABELS } from "@/features/orders/types";
import { createClient } from "@/lib/supabase/server";
import { formatPriceCents } from "@/lib/format";

// Área autenticada — sempre busca dados atuais, nunca pré-renderiza.
export const dynamic = "force-dynamic";

export default async function ContaPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // O proxy já protege /conta, mas sem Supabase configurado (dev local) ele
  // deixa passar — sem sessão de verdade aqui, manda pro login em vez de
  // quebrar tentando buscar pedidos de um customerId inexistente.
  if (!user) redirect("/conta/entrar");

  const orderList = await getOrdersByCustomerId(user.id);

  return (
    <main className="mx-auto w-full max-w-3xl flex-1 px-6 py-16">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">Minha conta</h1>
          <p className="mt-1 text-sm text-muted-foreground">{user.email}</p>
        </div>
        <LogoutButton />
      </div>

      <Link
        href="/conta/modelo-3d"
        className="mt-6 inline-block rounded-xl bg-card p-4 ring-1 ring-foreground/10 transition-shadow hover:shadow-md"
      >
        <p className="font-medium">Pedir modelo 3D customizado</p>
        <p className="text-sm text-muted-foreground">Mande fotos do que você quer imprimir — a IA gera um preview.</p>
      </Link>

      <h2 className="mt-10 text-lg font-medium">Meus pedidos</h2>
      {orderList.length === 0 ? (
        <p className="mt-2 text-muted-foreground">
          Nenhum pedido feito com esta conta ainda. Pedidos feitos como convidado antes de entrar não aparecem aqui.
        </p>
      ) : (
        <div className="mt-4 flex flex-col gap-3">
          {orderList.map((order) => (
            <Link
              key={order.id}
              href={`/pedido/${order.publicToken}`}
              className="flex items-center justify-between rounded-xl bg-card p-4 ring-1 ring-foreground/10 transition-shadow hover:shadow-md"
            >
              <div>
                <p className="font-medium">
                  {order.items.length} {order.items.length === 1 ? "item" : "itens"} ·{" "}
                  {formatPriceCents(order.totalCents)}
                </p>
                <p className="text-sm text-muted-foreground">{order.createdAt.toLocaleDateString("pt-BR")}</p>
              </div>
              <Badge variant="outline" className={ORDER_STATUS_BADGE_CLASSES[order.status]}>
                {ORDER_STATUS_LABELS[order.status]}
              </Badge>
            </Link>
          ))}
        </div>
      )}
    </main>
  );
}
