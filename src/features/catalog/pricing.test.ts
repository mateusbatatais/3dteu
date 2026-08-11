import { describe, expect, it } from "vitest";

import { calculateProductPriceCents, InvalidSelectionError } from "./pricing";
import type { MaterialColor, Product } from "./types";

function makeColor(id: string, name: string, overrides: Partial<MaterialColor> = {}): MaterialColor {
  return {
    id,
    name,
    hexColor: "#2563eb",
    hexColorSecondary: null,
    materialName: "Plástico",
    printProcess: "fdm",
    postProcessingFeeCents: 0,
    type: { id: `type-${id}`, name: "PLA", pricePerKgCents: 8000, printSpeedValue: 20, description: null },
    ...overrides,
  };
}

const azul = makeColor("mat-azul", "Azul");
const dualAzulLaranja = makeColor("mat-dual", "Azul/Laranja", { hexColorSecondary: "#f97316" });
const madeira = makeColor("mat-madeira", "Madeira", {
  materialName: "Resina",
  printProcess: "resin",
  type: { id: "type-resina", name: "Cristal", pricePerKgCents: 25000, printSpeedValue: 15, description: null },
});

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
  parts: [
    {
      id: "parte-corpo",
      name: "corpo",
      meshFileUrl: null,
      availableColors: [azul, dualAzulLaranja, madeira],
      regions: [],
      defaultMaterialColorId: null,
    },
  ],
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
    {
      id: "parte-corpo",
      name: "corpo",
      meshFileUrl: null,
      availableColors: [azul, madeira],
      regions: [],
      defaultMaterialColorId: null,
    },
    {
      id: "parte-tampa",
      name: "tampa",
      meshFileUrl: null,
      availableColors: [azul, dualAzulLaranja],
      regions: [],
      defaultMaterialColorId: null,
    },
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
      availableColors: [azul, madeira],
      regions: [
        { id: "regiao-0", label: "Região padrão", paintState: 0, enabled: true, defaultMaterialColorId: null },
        { id: "regiao-1", label: "Extrusora 1", paintState: 1, enabled: true, defaultMaterialColorId: null },
      ],
      defaultMaterialColorId: null,
    },
  ],
  sizeOptions: [{ id: "size-m", label: "M", scaleFactor: 1, priceModifierCents: 0, weightModifierGrams: 0 }],
};

describe("calculateProductPriceCents", () => {
  it("retorna o preço base quando tamanho M", () => {
    const preco = calculateProductPriceCents(produtoUmaPeca, {
      sizeId: "size-m",
      partSelections: [{ partId: "parte-corpo", materialColorId: "mat-azul" }],
    });

    expect(preco).toBe(2500);
  });

  it("soma o modificador de tamanho", () => {
    const preco = calculateProductPriceCents(produtoUmaPeca, {
      sizeId: "size-g",
      partSelections: [{ partId: "parte-corpo", materialColorId: "mat-azul" }],
    });

    expect(preco).toBe(2500 + 500);
  });

  it("preço não muda por causa da cor escolhida — só valida que é uma opção real", () => {
    const preco = calculateProductPriceCents(produtoUmaPeca, {
      sizeId: "size-p",
      partSelections: [{ partId: "parte-corpo", materialColorId: "mat-madeira" }],
    });

    expect(preco).toBe(2500 - 300);
  });

  it("soma o modificador de tamanho em um produto multi-peça", () => {
    const preco = calculateProductPriceCents(produtoDuasPecas, {
      sizeId: "size-m",
      partSelections: [
        { partId: "parte-corpo", materialColorId: "mat-madeira" },
        { partId: "parte-tampa", materialColorId: "mat-dual" },
      ],
    });

    expect(preco).toBe(4000);
  });

  it("lança erro quando o tamanho não existe para o produto", () => {
    expect(() =>
      calculateProductPriceCents(produtoUmaPeca, {
        sizeId: "size-inexistente",
        partSelections: [{ partId: "parte-corpo", materialColorId: "mat-azul" }],
      }),
    ).toThrow(InvalidSelectionError);
  });

  it("lança erro quando faltam seleções de parte", () => {
    expect(() =>
      calculateProductPriceCents(produtoDuasPecas, {
        sizeId: "size-m",
        partSelections: [{ partId: "parte-corpo", materialColorId: "mat-azul" }],
      }),
    ).toThrow(InvalidSelectionError);
  });

  it("lança erro quando a cor escolhida não é válida para a parte", () => {
    expect(() =>
      calculateProductPriceCents(produtoDuasPecas, {
        sizeId: "size-m",
        partSelections: [
          { partId: "parte-corpo", materialColorId: "mat-dual" }, // dual não é opção do corpo
          { partId: "parte-tampa", materialColorId: "mat-azul" },
        ],
      }),
    ).toThrow(InvalidSelectionError);
  });

  it("valida a cor de cada região selecionada num .3mf pintado", () => {
    const preco = calculateProductPriceCents(produtoPintado, {
      sizeId: "size-m",
      partSelections: [
        {
          partId: "parte-corpo",
          regionSelections: [
            { regionId: "regiao-0", materialColorId: "mat-azul" },
            { regionId: "regiao-1", materialColorId: "mat-madeira" },
          ],
        },
      ],
    });

    expect(preco).toBe(5000);
  });

  it("lança erro quando faltam seleções de região", () => {
    expect(() =>
      calculateProductPriceCents(produtoPintado, {
        sizeId: "size-m",
        partSelections: [
          {
            partId: "parte-corpo",
            regionSelections: [{ regionId: "regiao-0", materialColorId: "mat-azul" }],
          },
        ],
      }),
    ).toThrow(InvalidSelectionError);
  });

  it("lança erro quando a cor de uma região não é válida para a parte", () => {
    expect(() =>
      calculateProductPriceCents(produtoPintado, {
        sizeId: "size-m",
        partSelections: [
          {
            partId: "parte-corpo",
            regionSelections: [
              { regionId: "regiao-0", materialColorId: "mat-azul" },
              { regionId: "regiao-1", materialColorId: "mat-dual" }, // não é opção do corpo
            ],
          },
        ],
      }),
    ).toThrow(InvalidSelectionError);
  });
});
