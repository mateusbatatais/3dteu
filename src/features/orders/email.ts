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
    from: process.env.RESEND_FROM_EMAIL ?? "Fidgets <onboarding@resend.dev>",
    to: input.customerEmail,
    subject: "Recebemos seu pedido!",
    html: `
      <p>Oi, ${input.customerName}!</p>
      <p>Recebemos seu pedido no valor de ${formatPriceCents(input.totalCents)}.</p>
      <p>Acompanhe o status e o pagamento por aqui: <a href="${trackingUrl}">${trackingUrl}</a></p>
    `,
  });
}
