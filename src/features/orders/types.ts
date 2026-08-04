export type OrderStatus =
  | "awaiting_payment"
  | "paid"
  | "printing"
  | "ready"
  | "shipped"
  | "delivered"
  | "canceled";

export const ORDER_STATUS_LABELS: Record<OrderStatus, string> = {
  awaiting_payment: "Aguardando pagamento",
  paid: "Pago",
  printing: "Imprimindo",
  ready: "Pronto",
  shipped: "Enviado",
  delivered: "Entregue",
  canceled: "Cancelado",
};

// Antes só distinguia awaiting_payment de "todo o resto" — os outros 5
// status ficavam todos com a mesma cor no Badge. Uma classe por status,
// aplicada por cima da variante "outline" (border + texto neutro).
export const ORDER_STATUS_BADGE_CLASSES: Record<OrderStatus, string> = {
  awaiting_payment: "border-amber-500/20 bg-amber-500/10 text-amber-600 dark:text-amber-400",
  paid: "border-emerald-500/20 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
  printing: "border-blue-500/20 bg-blue-500/10 text-blue-600 dark:text-blue-400",
  ready: "border-violet-500/20 bg-violet-500/10 text-violet-600 dark:text-violet-400",
  shipped: "border-cyan-500/20 bg-cyan-500/10 text-cyan-600 dark:text-cyan-400",
  delivered: "border-teal-500/20 bg-teal-500/10 text-teal-600 dark:text-teal-400",
  canceled: "border-destructive/20 bg-destructive/10 text-destructive",
};

/** Ordem esperada de progressão de um pedido, usada para validar transições no admin. */
export const ORDER_STATUS_FLOW: OrderStatus[] = [
  "awaiting_payment",
  "paid",
  "printing",
  "ready",
  "shipped",
  "delivered",
];
