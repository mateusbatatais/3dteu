import type { Product } from "./types";

/**
 * Produto de demonstração usado em /produtos/[slug] enquanto o catálogo ainda
 * não está no banco. Remover assim que getProductBySlug (./queries.ts) estiver
 * ligado a um Supabase configurado e seedado (ver scripts/seed.ts).
 */
export const DEMO_PRODUCT: Product = {
  id: "demo-fidget-cubo",
  slug: "fidget-cubo",
  name: "Fidget Cubo",
  basePriceCents: 3500,
  parts: [
    {
      id: "demo-corpo",
      name: "corpo",
      meshFileUrl: null,
      availableMaterials: [
        { id: "demo-azul", type: "solid_color", name: "Azul", hexColor: "#2563eb", hexColorSecondary: null, priceModifierCents: 0 },
        {
          id: "demo-dual",
          type: "dual_color",
          name: "Azul/Laranja",
          hexColor: "#2563eb",
          hexColorSecondary: "#f97316",
          priceModifierCents: 300,
        },
        { id: "demo-madeira", type: "special", name: "Madeira", hexColor: "#8b5a2b", hexColorSecondary: null, priceModifierCents: 800 },
      ],
    },
    {
      id: "demo-tampa",
      name: "tampa",
      meshFileUrl: null,
      availableMaterials: [
        { id: "demo-azul", type: "solid_color", name: "Azul", hexColor: "#2563eb", hexColorSecondary: null, priceModifierCents: 0 },
        {
          id: "demo-dual",
          type: "dual_color",
          name: "Azul/Laranja",
          hexColor: "#2563eb",
          hexColorSecondary: "#f97316",
          priceModifierCents: 300,
        },
      ],
    },
  ],
  sizeOptions: [
    { id: "demo-p", label: "P", scaleFactor: 0.8, priceModifierCents: -300, weightModifierGrams: -15 },
    { id: "demo-m", label: "M", scaleFactor: 1, priceModifierCents: 0, weightModifierGrams: 0 },
    { id: "demo-g", label: "G", scaleFactor: 1.2, priceModifierCents: 500, weightModifierGrams: 20 },
  ],
};
