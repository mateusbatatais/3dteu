import { z } from "zod";

// Campos de endereço ficam opcionais no schema base e só viram obrigatórios
// via `superRefine` quando deliveryMethod === "superfrete" — mantém o form
// como um único objeto plano, mais simples de ligar em react-hook-form do
// que um discriminated union com campos condicionais.
export const checkoutFormSchema = z
  .object({
    customerName: z.string().trim().min(2, "Informe seu nome."),
    customerEmail: z.string().trim().email("Informe um e-mail válido."),
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
    if (!values.street?.trim()) {
      ctx.addIssue({ code: "custom", path: ["street"], message: "Informe a rua." });
    }
    if (!values.number?.trim()) {
      ctx.addIssue({ code: "custom", path: ["number"], message: "Informe o número." });
    }
    if (!values.neighborhood?.trim()) {
      ctx.addIssue({ code: "custom", path: ["neighborhood"], message: "Informe o bairro." });
    }
    if (!values.city?.trim()) {
      ctx.addIssue({ code: "custom", path: ["city"], message: "Informe a cidade." });
    }
    if (values.state?.trim().length !== 2) {
      ctx.addIssue({ code: "custom", path: ["state"], message: "Use a sigla do estado (ex.: SP)." });
    }
    if (!values.shippingServiceId) {
      ctx.addIssue({ code: "custom", path: ["shippingServiceId"], message: "Escolha uma opção de frete." });
    }
  });

export type CheckoutFormValues = z.infer<typeof checkoutFormSchema>;
