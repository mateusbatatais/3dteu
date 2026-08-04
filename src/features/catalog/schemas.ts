import { z } from "zod";

export const productFormSchema = z.object({
  name: z.string().trim().min(2, "Informe um nome com pelo menos 2 caracteres."),
  slug: z
    .string()
    .trim()
    .min(2, "Informe um slug com pelo menos 2 caracteres.")
    .regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, "Use apenas letras minúsculas, números e hífen (ex.: fidget-cubo)."),
  description: z.string().trim().optional(),
  categoryId: z.string().uuid().optional().or(z.literal("")),
  basePriceReais: z.coerce.number().positive("O preço base precisa ser maior que zero."),
  status: z.enum(["draft", "published"]),
});

export type ProductFormValues = z.infer<typeof productFormSchema>;
