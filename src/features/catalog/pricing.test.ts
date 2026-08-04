import { describe, expect, it } from "vitest";

import { calculateProductPriceCents, InvalidSelectionError } from "./pricing";
import type { Product } from "./types";

const azul = { id: "mat-azul", type: "solid_color", name: "Azul", hexColor: "#2563eb", hexColorSecondary: null, priceModifierCents: 0 } as const;
const dualAzulLaranja = { id: "mat-dual", type: "dual_color", name: "Azul/Laranja", hexColor: "#2563eb", hexColorSecondary: "#f97316", priceModifierCents: 300 } as const;
const madeira = { id: "mat-madeira", type: "special", name: "Madeira", hexColor: "#8b5a2b", hexColorSecondary: null, priceModifierCents: 800 } as const;

const produtoUmaPeca: Product = {
  id: "prod-1",
  slug: "fidget-simples",
  name: "Fidget Simples",
  basePriceCents: 2500,
  parts: [{ id: "parte-corpo", name: "corpo", meshFileUrl: null, availableMaterials: [azul, dualAzulLaranja, madeira] }],
  sizeOptions: [
    { id: "size-p", label: "P", scaleFactor: 0.8, priceModifierCents: -300, weightModifierGrams: -10 },
    { id: "size-m", label: "M", scaleFactor: 1, priceModifierCents: 0, weightModifierGrams: 0 },
    { id: "size-g", label: "G", scaleFactor: 1.2, priceModifierCents: 500, weightModifierGrams: 20 },
  ],
};

const produtoDuasPecas: Product = {
  id: "prod-2",
  slug: "fidget-multi-peca",
  name: "Fidget Multi-peça",
  basePriceCents: 4000,
  parts: [
    { id: "parte-corpo", name: "corpo", meshFileUrl: null, availableMaterials: [azul, madeira] },
    { id: "parte-tampa", name: "tampa", meshFileUrl: null, availableMaterials: [azul, dualAzulLaranja] },
  ],
  sizeOptions: [{ id: "size-m", label: "M", scaleFactor: 1, priceModifierCents: 0, weightModifierGrams: 0 }],
};

describe("calculateProductPriceCents", () => {
  it("retorna o preço base quando tamanho M e material sem modificador", () => {
    const preco = calculateProductPriceCents(produtoUmaPeca, {
      sizeId: "size-m",
      partSelections: [{ partId: "parte-corpo", filamentOptionId: "mat-azul" }],
    });

    expect(preco).toBe(2500);
  });

  it("soma o modificador de tamanho", () => {
    const preco = calculateProductPriceCents(produtoUmaPeca, {
      sizeId: "size-g",
      partSelections: [{ partId: "parte-corpo", filamentOptionId: "mat-azul" }],
    });

    expect(preco).toBe(2500 + 500);
  });

  it("soma o modificador de material especial (madeira)", () => {
    const preco = calculateProductPriceCents(produtoUmaPeca, {
      sizeId: "size-p",
      partSelections: [{ partId: "parte-corpo", filamentOptionId: "mat-madeira" }],
    });

    expect(preco).toBe(2500 - 300 + 800);
  });

  it("soma o modificador de cada parte em um produto multi-peça", () => {
    const preco = calculateProductPriceCents(produtoDuasPecas, {
      sizeId: "size-m",
      partSelections: [
        { partId: "parte-corpo", filamentOptionId: "mat-madeira" },
        { partId: "parte-tampa", filamentOptionId: "mat-dual" },
      ],
    });

    expect(preco).toBe(4000 + 800 + 300);
  });

  it("lança erro quando o tamanho não existe para o produto", () => {
    expect(() =>
      calculateProductPriceCents(produtoUmaPeca, {
        sizeId: "size-inexistente",
        partSelections: [{ partId: "parte-corpo", filamentOptionId: "mat-azul" }],
      }),
    ).toThrow(InvalidSelectionError);
  });

  it("lança erro quando faltam seleções de parte", () => {
    expect(() =>
      calculateProductPriceCents(produtoDuasPecas, {
        sizeId: "size-m",
        partSelections: [{ partId: "parte-corpo", filamentOptionId: "mat-azul" }],
      }),
    ).toThrow(InvalidSelectionError);
  });

  it("lança erro quando o material escolhido não é válido para a parte", () => {
    expect(() =>
      calculateProductPriceCents(produtoDuasPecas, {
        sizeId: "size-m",
        partSelections: [
          { partId: "parte-corpo", filamentOptionId: "mat-dual" }, // dual não é opção do corpo
          { partId: "parte-tampa", filamentOptionId: "mat-azul" },
        ],
      }),
    ).toThrow(InvalidSelectionError);
  });
});
