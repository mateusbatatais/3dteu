import { z } from "zod";

// Campos de dimensão são opcionais — um <input type="number"> vazio manda ""
// pro form, e z.coerce converte isso pra 0; tratamos 0 como "não informado"
// na hora de gravar (ver `toRow` em actions.ts), em vez de usar z.preprocess
// (que faz o tipo do form virar `unknown` e quebra o zodResolver).
const optionalPositiveInt = z.coerce.number().int().min(0);

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
  // Peso/dimensões da embalagem — opcionais; sem eles, a cotação de frete usa
  // um fallback de caixa pequena (ver src/features/shipping/constants.ts).
  weightGrams: optionalPositiveInt,
  heightCm: optionalPositiveInt,
  widthCm: optionalPositiveInt,
  lengthCm: optionalPositiveInt,
});

export type ProductFormValues = z.infer<typeof productFormSchema>;
