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
  description: null,
  basePriceCents: 2500,
  weightGrams: 30,
  heightCm: 4,
  widthCm: 12,
  lengthCm: 16,
  metaTitle: null,
  metaDescription: null,
  images: [],
  parts: [{ id: "parte-corpo", name: "corpo", meshFileUrl: null, availableMaterials: [azul, dualAzulLaranja, madeira], regions: [] }],
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
  description: null,
  basePriceCents: 4000,
  weightGrams: 45,
  heightCm: 5,
  widthCm: 14,
  lengthCm: 18,
  metaTitle: null,
  metaDescription: null,
  images: [],
  parts: [
    { id: "parte-corpo", name: "corpo", meshFileUrl: null, availableMaterials: [azul, madeira], regions: [] },
    { id: "parte-tampa", name: "tampa", meshFileUrl: null, availableMaterials: [azul, dualAzulLaranja], regions: [] },
  ],
  sizeOptions: [{ id: "size-m", label: "M", scaleFactor: 1, priceModifierCents: 0, weightModifierGrams: 0 }],
};

const produtoPintado: Product = {
  id: "prod-3",
  slug: "bulbasaur-pintado",
  name: "Bulbasaur pintado",
  description: null,
  basePriceCents: 5000,
  weightGrams: 60,
  heightCm: 6,
  widthCm: 10,
  lengthCm: 10,
  metaTitle: null,
  metaDescription: null,
  images: [],
  parts: [
    {
      id: "parte-corpo",
      name: "corpo",
      meshFileUrl: null,
      availableMaterials: [azul, madeira],
      regions: [
        { id: "regiao-0", label: "Região padrão", paintState: 0 },
        { id: "regiao-1", label: "Extrusora 1", paintState: 1 },
      ],
    },
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

  it("soma o modificador de cada região selecionada num .3mf pintado", () => {
    const preco = calculateProductPriceCents(produtoPintado, {
      sizeId: "size-m",
      partSelections: [
        {
          partId: "parte-corpo",
          regionSelections: [
            { regionId: "regiao-0", filamentOptionId: "mat-azul" },
            { regionId: "regiao-1", filamentOptionId: "mat-madeira" },
          ],
        },
      ],
    });

    expect(preco).toBe(5000 + 0 + 800);
  });

  it("lança erro quando faltam seleções de região", () => {
    expect(() =>
      calculateProductPriceCents(produtoPintado, {
        sizeId: "size-m",
        partSelections: [
          {
            partId: "parte-corpo",
            regionSelections: [{ regionId: "regiao-0", filamentOptionId: "mat-azul" }],
          },
        ],
      }),
    ).toThrow(InvalidSelectionError);
  });

  it("lança erro quando o material de uma região não é válido para a parte", () => {
    expect(() =>
      calculateProductPriceCents(produtoPintado, {
        sizeId: "size-m",
        partSelections: [
          {
            partId: "parte-corpo",
            regionSelections: [
              { regionId: "regiao-0", filamentOptionId: "mat-azul" },
              { regionId: "regiao-1", filamentOptionId: "mat-dual" }, // não é opção do corpo
            ],
          },
        ],
      }),
    ).toThrow(InvalidSelectionError);
  });
});
