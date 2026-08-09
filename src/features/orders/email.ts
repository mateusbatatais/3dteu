import { Resend } from "resend";

import { formatPriceCents } from "@/lib/format";

export async function sendOrderConfirmationEmail(input: {
  customerEmail: string;
  customerName: string;
  orderToken: string;
  totalCents: number;
}) {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    console.warn("[resend] RESEND_API_KEY não configurada — e-mail de confirmação não enviado.");
    return;
  }

  const resend = new Resend(apiKey);
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";
  const trackingUrl = `${siteUrl}/pedido/${input.orderToken}`;

  await resend.emails.send({
    from: process.env.RESEND_FROM_EMAIL ?? "3D Teu <onboarding@resend.dev>",
    to: input.customerEmail,
    subject: "Recebemos seu pedido!",
    html: `
      <p>Oi, ${input.customerName}!</p>
      <p>Recebemos seu pedido no valor de ${formatPriceCents(input.totalCents)}.</p>
      <p>Acompanhe o status e o pagamento por aqui: <a href="${trackingUrl}">${trackingUrl}</a></p>
    `,
  });
}

/**
 * Best-effort, igual à confirmação pro cliente: sem `RESEND_API_KEY` ou sem
 * `ADMIN_NOTIFICATION_EMAIL` configuradas, só loga um aviso e segue (o
 * pedido já foi criado de qualquer forma).
 */
export async function sendAdminNewOrderNotification(input: {
  orderId: string;
  customerName: string;
  customerEmail: string;
  customerPhone: string | null;
  totalCents: number;
  items: Array<{ productNameSnapshot: string; quantity: number; subtotalCents: number }>;
}) {
  const apiKey = process.env.RESEND_API_KEY;
  const adminEmail = process.env.ADMIN_NOTIFICATION_EMAIL;
  if (!apiKey || !adminEmail) {
    console.warn(
      "[resend] RESEND_API_KEY / ADMIN_NOTIFICATION_EMAIL não configuradas — notificação de pedido novo não enviada.",
    );
    return;
  }

  const resend = new Resend(apiKey);
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";
  const adminUrl = `${siteUrl}/admin/pedidos/${input.orderId}`;

  const itemsHtml = input.items
    .map((item) => `<li>${item.quantity}x ${item.productNameSnapshot} — ${formatPriceCents(item.subtotalCents)}</li>`)
    .join("");

  await resend.emails.send({
    from: process.env.RESEND_FROM_EMAIL ?? "3D Teu <onboarding@resend.dev>",
    to: adminEmail,
    subject: `Novo pedido — ${formatPriceCents(input.totalCents)}`,
    html: `
      <p>Novo pedido de ${input.customerName} (${input.customerEmail}${input.customerPhone ? `, ${input.customerPhone}` : ""}).</p>
      <ul>${itemsHtml}</ul>
      <p><strong>Total: ${formatPriceCents(input.totalCents)}</strong></p>
      <p><a href="${adminUrl}">Ver pedido no admin</a></p>
    `,
  });
}
