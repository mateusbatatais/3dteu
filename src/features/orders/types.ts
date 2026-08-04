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

/** Ordem esperada de progressão de um pedido, usada para validar transições no admin. */
export const ORDER_STATUS_FLOW: OrderStatus[] = [
  "awaiting_payment",
  "paid",
  "printing",
  "ready",
  "shipped",
  "delivered",
];
