import { z } from "zod";

export const productFormSchema = z
  .object({
    name: z.string().trim().min(2, "Informe um nome com pelo menos 2 caracteres."),
    slug: z
      .string()
      .trim()
      .min(2, "Informe um slug com pelo menos 2 caracteres.")
      .regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, "Use apenas letras minúsculas, números e hífen (ex.: fidget-cubo)."),
    description: z.string().trim().optional(),
    categoryId: z.string().uuid().optional().or(z.literal("")),
    // Aceita 0 na criação — o admin pode subir o arquivo 3D primeiro e usar o
    // preço sugerido (peso estimado × preço/grama) em vez de precisar
    // inventar um preço antes de ter o arquivo. Só exige > 0 pra publicar
    // (ver .refine abaixo).
    basePriceReais: z.coerce.number().min(0, "O preço base não pode ser negativo."),
    status: z.enum(["draft", "published"]),
    // SEO — opcionais; sem eles, a página do produto cai no nome/descrição normais.
    metaTitle: z.string().trim().max(70, "Máximo 70 caracteres.").optional(),
    metaDescription: z.string().trim().max(160, "Máximo 160 caracteres.").optional(),
  })
  .refine((data) => data.status !== "published" || data.basePriceReais > 0, {
    message: "Defina um preço maior que zero antes de publicar o produto.",
    path: ["basePriceReais"],
  });

export type ProductFormValues = z.infer<typeof productFormSchema>;
