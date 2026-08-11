import { estimatePartRawCostCents, type EnergyPricingConfig } from "./print-estimate";
import type { MaterialColor, Product, ProductPart, ProductPartRegion, ProductSelection } from "./types";

export class InvalidSelectionError extends Error {}

// Cor pré-selecionada pelo admin pra essa parte — cai pra primeira da lista
// se não tiver padrão definido, ou se o padrão salvo não estiver mais entre
// as cores aceitas. Mesma lógica de `product-configurator.tsx`, duplicada
// aqui de propósito: esta função precisa rodar em qualquer lado (servidor,
// testes) sem depender de um Client Component.
function resolveDefaultMaterialColorId(part: Pick<ProductPart, "defaultMaterialColorId" | "availableColors">): string | undefined {
  if (part.defaultMaterialColorId && part.availableColors.some((c) => c.id === part.defaultMaterialColorId)) {
    return part.defaultMaterialColorId;
  }
  return part.availableColors[0]?.id;
}

// Mesma ideia, mas o padrão da própria região tem prioridade sobre o da parte.
function resolveRegionDefaultMaterialColorId(
  part: Pick<ProductPart, "defaultMaterialColorId" | "availableColors">,
  region: Pick<ProductPartRegion, "defaultMaterialColorId">,
): string | undefined {
  if (region.defaultMaterialColorId && part.availableColors.some((c) => c.id === region.defaultMaterialColorId)) {
    return region.defaultMaterialColorId;
  }
  return resolveDefaultMaterialColorId(part);
}

/** Taxa fixa somada quando a cor é dual-color — 0 se a cor é de cor única. */
function dualColorFeeFor(color: MaterialColor): number {
  return color.hexColorSecondary ? color.dualColorFeeCents : 0;
}

/** Custo cru (material + energia + pós-processamento) de imprimir uma dada
 * cor com um peso específico, mais a taxa dual-color se aplicável. */
function colorCostCents(weightGrams: number, color: MaterialColor, pricingConfig: EnergyPricingConfig | null): number {
  const rawCost = estimatePartRawCostCents(
    {
      weightGrams,
      pricePerKgCents: color.type.pricePerKgCents,
      printSpeedValue: color.type.printSpeedValue,
      postProcessingFeeCents: color.postProcessingFeeCents,
    },
    pricingConfig,
  );
  return rawCost + dualColorFeeFor(color);
}

/** Diferença de custo (escolhido − padrão) pra uma parte sem regiões — 0 se
 * a peça ainda não tem peso próprio (peça antiga, arquivo não reconfirmado
 * desde que `weightGrams` passou a existir) ou se alguma cor não for achada
 * (não deveria acontecer, já validado antes de chamar isto). */
function partPriceDeltaCents(
  part: ProductPart,
  chosenColorId: string | undefined,
  pricingConfig: EnergyPricingConfig | null,
): number {
  if (part.weightGrams === null || !chosenColorId) return 0;

  const defaultColorId = resolveDefaultMaterialColorId(part);
  const defaultColor = part.availableColors.find((c) => c.id === defaultColorId);
  const chosenColor = part.availableColors.find((c) => c.id === chosenColorId);
  if (!defaultColor || !chosenColor) return 0;

  return colorCostCents(part.weightGrams, chosenColor, pricingConfig) - colorCostCents(part.weightGrams, defaultColor, pricingConfig);
}

/** Mesma ideia, mas pra uma peça com regiões pintadas (.3mf MMU): não existe
 * peso por região, então o peso da peça é dividido igualmente entre elas —
 * aproximação documentada, mesmo espírito de `estimatePrintWeight` nunca
 * fingir uma precisão que os dados disponíveis não sustentam. */
function regionsPriceDeltaCents(
  part: ProductPart,
  regionSelections: Array<{ regionId: string; materialColorId: string }>,
  pricingConfig: EnergyPricingConfig | null,
): number {
  if (part.weightGrams === null || part.regions.length === 0) return 0;

  const weightPerRegion = part.weightGrams / part.regions.length;
  let total = 0;
  for (const region of part.regions) {
    const chosenColorId = regionSelections.find((r) => r.regionId === region.id)?.materialColorId;
    if (!chosenColorId) continue;

    const defaultColorId = resolveRegionDefaultMaterialColorId(part, region);
    const defaultColor = part.availableColors.find((c) => c.id === defaultColorId);
    const chosenColor = part.availableColors.find((c) => c.id === chosenColorId);
    if (!defaultColor || !chosenColor) continue;

    total += colorCostCents(weightPerRegion, chosenColor, pricingConfig) - colorCostCents(weightPerRegion, defaultColor, pricingConfig);
  }
  return total;
}

/**
 * Calcula o preço final (em centavos) de um produto configurado:
 *
 *   preço = base + modificador do tamanho
 *         + Σ por peça: (custo do material ESCOLHIDO − custo do material PADRÃO)
 *
 * `basePriceCents` é o preço-âncora que o admin define assumindo o material
 * PADRÃO de cada peça (a calculadora em print-estimate.ts ajuda a chegar
 * nesse número, mas nunca aplica sozinha) — o preço ao vivo só diverge dele
 * quando o cliente escolhe um material diferente do padrão, pelo delta de
 * custo real (peso da peça × preço/kg + energia + pós-processamento + taxa
 * dual-color). Isso garante que a configuração padrão sempre resulta
 * exatamente no preço que o admin já definiu, e nunca reaplica margem sobre
 * o delta (se o admin quiser embutir margem na diferença de material, já
 * pode inflar `pricePerKgCents` um pouco, mesma alavanca da calculadora).
 *
 * `pricingConfig` (energia/potência da loja) é opcional — sem ele, o delta
 * ainda soma material+pós-processamento+dual-color, só sem o componente de
 * energia (degrade gracioso quando a loja não configurou isso ainda). Uma
 * peça sem `weightGrams` (ainda não tem peso próprio — precisa reconfirmar
 * o upload) contribui 0, nunca quebra o cálculo.
 *
 * Esta função deve rodar sempre no servidor a partir do catálogo atual no
 * momento do checkout — nunca a partir de um preço enviado pelo cliente,
 * que só serve como estimativa exibida na UI.
 */
export function calculateProductPriceCents(
  product: Product,
  selection: ProductSelection,
  pricingConfig: EnergyPricingConfig | null = null,
): number {
  const size = product.sizeOptions.find((s) => s.id === selection.sizeId);
  if (!size) {
    throw new InvalidSelectionError(
      `Tamanho "${selection.sizeId}" não existe para o produto "${product.slug}".`,
    );
  }

  if (selection.partSelections.length !== product.parts.length) {
    throw new InvalidSelectionError(
      `Produto "${product.slug}" tem ${product.parts.length} parte(s), mas ${selection.partSelections.length} foram selecionadas.`,
    );
  }

  let priceDeltaCents = 0;

  for (const part of product.parts) {
    const chosen = selection.partSelections.find((s) => s.partId === part.id);
    if (!chosen) {
      throw new InvalidSelectionError(`Nenhuma cor selecionada para a parte "${part.name}".`);
    }

    if (part.regions.length > 0) {
      // Peça com .3mf pintado: confere se existe uma cor válida pra cada região.
      const regionSelections = chosen.regionSelections ?? [];
      if (regionSelections.length !== part.regions.length) {
        throw new InvalidSelectionError(
          `Parte "${part.name}" tem ${part.regions.length} região(ões), mas ${regionSelections.length} foram selecionadas.`,
        );
      }

      for (const region of part.regions) {
        const regionChoice = regionSelections.find((r) => r.regionId === region.id);
        if (!regionChoice) {
          throw new InvalidSelectionError(`Nenhuma cor selecionada para a região "${region.label}".`);
        }
        const isValid = part.availableColors.some((c) => c.id === regionChoice.materialColorId);
        if (!isValid) {
          throw new InvalidSelectionError(
            `Cor "${regionChoice.materialColorId}" não é uma opção válida para a parte "${part.name}".`,
          );
        }
      }

      priceDeltaCents += regionsPriceDeltaCents(part, regionSelections, pricingConfig);
      continue;
    }

    const isValid = part.availableColors.some((c) => c.id === chosen.materialColorId);
    if (!isValid) {
      throw new InvalidSelectionError(
        `Cor "${chosen.materialColorId}" não é uma opção válida para a parte "${part.name}".`,
      );
    }

    priceDeltaCents += partPriceDeltaCents(part, chosen.materialColorId, pricingConfig);
  }

  return product.basePriceCents + size.priceModifierCents + Math.round(priceDeltaCents);
}
