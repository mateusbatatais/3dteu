import { z } from "zod";

export const storeSettingsSchema = z.object({
  senderName: z.string().trim().min(2, "Informe o nome do remetente."),
  senderDocument: z.string().trim().min(11, "Informe um CPF ou CNPJ válido."),
  senderPhone: z.string().trim().min(8, "Informe um telefone com DDD."),
  zipCode: z.string().trim().regex(/^\d{5}-?\d{3}$/, "Informe um CEP válido."),
  street: z.string().trim().min(2, "Informe a rua."),
  number: z.string().trim().min(1, "Informe o número."),
  complement: z.string().trim().optional(),
  neighborhood: z.string().trim().min(2, "Informe o bairro."),
  city: z.string().trim().min(2, "Informe a cidade."),
  state: z.string().trim().length(2, "Use a sigla do estado (ex.: SP)."),
});

export type StoreSettingsFormValues = z.infer<typeof storeSettingsSchema>;
