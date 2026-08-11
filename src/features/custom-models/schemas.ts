import { z } from "zod";

// Mesmo padrão de checkout/schemas.ts (campos de endereço opcionais no
// schema base, só viram obrigatórios via superRefine quando
// deliveryMethod === "superfrete") — versão menor porque nome/e-mail já são
// conhecidos da sessão do cliente logado.
export const customModelDeliveryFormSchema = z
  .object({
    customerPhone: z.string().trim().optional(),
    deliveryMethod: z.enum(["pickup", "superfrete"]),
    zipCode: z.string().trim().optional(),
    street: z.string().trim().optional(),
    number: z.string().trim().optional(),
    complement: z.string().trim().optional(),
    neighborhood: z.string().trim().optional(),
    city: z.string().trim().optional(),
    state: z.string().trim().optional(),
    shippingServiceId: z.string().optional(),
  })
  .superRefine((values, ctx) => {
    if (values.deliveryMethod !== "superfrete") return;

    if (!/^\d{5}-?\d{3}$/.test(values.zipCode ?? "")) {
      ctx.addIssue({ code: "custom", path: ["zipCode"], message: "Informe um CEP válido." });
    }
    if (!values.street?.trim()) ctx.addIssue({ code: "custom", path: ["street"], message: "Informe a rua." });
    if (!values.number?.trim()) ctx.addIssue({ code: "custom", path: ["number"], message: "Informe o número." });
    if (!values.neighborhood?.trim()) {
      ctx.addIssue({ code: "custom", path: ["neighborhood"], message: "Informe o bairro." });
    }
    if (!values.city?.trim()) ctx.addIssue({ code: "custom", path: ["city"], message: "Informe a cidade." });
    if (values.state?.trim().length !== 2) {
      ctx.addIssue({ code: "custom", path: ["state"], message: "Use a sigla do estado (ex.: SP)." });
    }
    if (!values.shippingServiceId) {
      ctx.addIssue({ code: "custom", path: ["shippingServiceId"], message: "Escolha uma opção de frete." });
    }
  });

export type CustomModelDeliveryFormValues = z.infer<typeof customModelDeliveryFormSchema>;
