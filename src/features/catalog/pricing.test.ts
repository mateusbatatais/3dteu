import { describe, expect, it } from "vitest";

import { calculateProductPriceCents, InvalidSelectionError } from "./pricing";
import type { MaterialColor, Product } from "./types";

function makeColor(id: string, name: string, overrides: Partial<MaterialColor> = {}): MaterialColor {
  return {
    id,
    name,
    hexColor: "#2563eb",
    hexColorSecondary: null,
    opacity: 1,
    materialName: "Plástico",
    printProcess: "fdm",
    postProcessingFeeCents: 0,
    dualColorFeeCents: 0,
    type: { id: `type-${id}`, name: "PLA", pricePerKgCents: 8000, printSpeedValue: 20, description: null },
    ...overrides,
  };
}

// azul/dualAzulLaranja compartilham o mesmo Tipo (pricePerKgCents: 8000,
// printSpeedValue: 20) — representam duas cores do MESMO material físico,
// uma sólida e uma dual-color, com a mesma dualColorFeeCents (500 = R$5,00,
// só "cobrada" na dual, nunca na sólida — ver dualColorFeeFor em pricing.ts).
const azul = makeColor("mat-azul", "Azul", { dualColorFeeCents: 500 });
const dualAzulLaranja = makeColor("mat-dual", "Azul/Laranja", { hexColorSecondary: "#f97316", dualColorFeeCents: 500 });
// madeira: Resina, bem mais cara por kg e com taxa de pós-processamento —
// usada pra testar o delta de custo real de material.
const madeira = makeColor("mat-madeira", "Madeira", {
  materialName: "Resina",
  printProcess: "resin",
  postProcessingFeeCents: 300,
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
  viewerCameraPosition: null,
  images: [],
  parts: [
    {
      id: "parte-corpo",
      name: "corpo",
      meshFileUrl: null,
      availableColors: [azul, dualAzulLaranja, madeira],
      regions: [],
      defaultMaterialColorId: null, // cai pra primeira da lista = azul
      weightGrams: 20,
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
  viewerCameraPosition: null,
  images: [],
  parts: [
    {
      id: "parte-corpo",
      name: "corpo",
      meshFileUrl: null,
      availableColors: [azul, madeira],
      regions: [],
      defaultMaterialColorId: null, // = azul
      weightGrams: 30,
    },
    {
      id: "parte-tampa",
      name: "tampa",
      meshFileUrl: null,
      availableColors: [azul, dualAzulLaranja],
      regions: [],
      defaultMaterialColorId: null, // = azul
      // Simula uma peça cadastrada ANTES da coluna weightGrams existir —
      // nunca teve o arquivo reconfirmado, então não tem peso próprio.
      weightGrams: null,
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
  viewerCameraPosition: null,
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
      defaultMaterialColorId: null, // = azul, usado como padrão das 2 regiões (nenhuma tem padrão próprio)
      weightGrams: 20, // dividido igualmente entre as 2 regiões = 10g cada
    },
  ],
  sizeOptions: [{ id: "size-m", label: "M", scaleFactor: 1, priceModifierCents: 0, weightModifierGrams: 0 }],
};

describe("calculateProductPriceCents", () => {
  it("retorna o preço base quando a cor escolhida é a padrão (delta zero)", () => {
    const preco = calculateProductPriceCents(produtoUmaPeca, {
      sizeId: "size-m",
      partSelections: [{ partId: "parte-corpo", materialColorId: "mat-azul" }],
    });

    expect(preco).toBe(2500);
  });

  it("soma o modificador de tamanho quando a cor é a padrão", () => {
    const preco = calculateProductPriceCents(produtoUmaPeca, {
      sizeId: "size-g",
      partSelections: [{ partId: "parte-corpo", materialColorId: "mat-azul" }],
    });

    expect(preco).toBe(2500 + 500);
  });

  it("aumenta o preço ao trocar pra um material mais caro (sem pricingConfig, só material+pós-processamento)", () => {
    // corpo: 20g. azul (padrão): 20×8000/1000 = 160. madeira: 20×25000/1000
    // = 500 + pós-processamento 300 = 800. delta = 800 − 160 = 640.
    const preco = calculateProductPriceCents(produtoUmaPeca, {
      sizeId: "size-m",
      partSelections: [{ partId: "parte-corpo", materialColorId: "mat-madeira" }],
    });

    expect(preco).toBe(2500 + 640);
  });

  it("inclui o componente de energia quando pricingConfig é passado", () => {
    // Mesmo caso acima, com energyPriceCentsPerKwh=100 (R$1,00/kWh) e
    // printerPowerWatts=200 (0,2kW). azul: tempo=20/20=1h, energia=round(1×
    // 0,2×100)=20 → total 160+20=180. madeira: tempo=20/15=1,3333h, energia
    // =round(1,3333×0,2×100)=27 → total 500+27+300=827. delta=827−180=647.
    const preco = calculateProductPriceCents(
      produtoUmaPeca,
      { sizeId: "size-m", partSelections: [{ partId: "parte-corpo", materialColorId: "mat-madeira" }] },
      { energyPriceCentsPerKwh: 100, printerPowerWatts: 200 },
    );

    expect(preco).toBe(2500 + 647);
  });

  it("soma a taxa dual-color quando a cor escolhida é dual e a padrão não é", () => {
    // azul e dualAzulLaranja têm o MESMO custo de material/energia (mesmo
    // Tipo) — a única diferença é a taxa dual-color (500), que só a
    // dual carrega. delta = 500.
    const preco = calculateProductPriceCents(produtoUmaPeca, {
      sizeId: "size-m",
      partSelections: [{ partId: "parte-corpo", materialColorId: "mat-dual" }],
    });

    expect(preco).toBe(2500 + 500);
  });

  it("peça sem weightGrams não contribui pro delta (peça antiga, upload ainda não reconfirmado)", () => {
    // corpo (30g): azul→madeira = (750+300) − 240 = 810.
    // tampa (sem peso): azul→dual contribuiria 500 de taxa dual-color se
    // tivesse peso, mas weightGrams=null zera a peça inteira.
    const preco = calculateProductPriceCents(produtoDuasPecas, {
      sizeId: "size-m",
      partSelections: [
        { partId: "parte-corpo", materialColorId: "mat-madeira" },
        { partId: "parte-tampa", materialColorId: "mat-dual" },
      ],
    });

    expect(preco).toBe(4000 + 810);
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

  it("valida a cor de cada região selecionada num .3mf pintado (ambas na padrão = delta zero)", () => {
    const preco = calculateProductPriceCents(produtoPintado, {
      sizeId: "size-m",
      partSelections: [
        {
          partId: "parte-corpo",
          regionSelections: [
            { regionId: "regiao-0", materialColorId: "mat-azul" },
            { regionId: "regiao-1", materialColorId: "mat-azul" },
          ],
        },
      ],
    });

    expect(preco).toBe(5000);
  });

  it("soma o delta de uma região pintada com material diferente do padrão", () => {
    // Peso da peça (20g) dividido igualmente entre as 2 regiões = 10g cada.
    // região 0 fica na padrão (azul, delta 0). região 1 troca pra madeira:
    // (10×25000/1000 + 300) − (10×8000/1000) = (250+300) − 80 = 470.
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

    expect(preco).toBe(5000 + 470);
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
