import { estimateMaterialCost } from "@/features/catalog/print-estimate";
import { getAllMaterialColorsForConfigurator } from "@/features/catalog/queries";
import { getStoreSettings } from "@/features/shipping/queries";

import type { CustomModelRequest } from "./queries";

export interface CustomModelPriceBreakdown {
  materialCostCents: number;
  energyCostCents: number;
  postProcessingFeeCents: number;
  printTimeHours: number;
  customModelFeeCents: number;
  totalPriceCents: number;
}

export interface CustomModelPriceResult {
  error?: string;
  breakdown?: CustomModelPriceBreakdown;
}

/**
 * Mesma calculadora da Fase 1 (`estimateMaterialCost`) usada pelo admin pra
 * sugerir preço de produto — só que aqui o peso/altura vêm de uma medição
 * real do arquivo gerado pela Meshy (nunca do cliente), e soma-se por cima
 * `storeSettings.customModelFeeCents` (cobre o crédito de IA gasto + o
 * trabalho de acompanhar o pedido). Reaproveitado tanto pra mostrar o preço
 * ao vivo na tela de confirmação quanto pra recalcular no servidor na hora
 * de confirmar o pedido de verdade — nunca confia no preço mostrado antes.
 */
export async function computeCustomModelPrice(
  request: Pick<CustomModelRequest, "weightGrams" | "heightMm">,
  materialColorId: string,
): Promise<CustomModelPriceResult> {
  if (!request.weightGrams || !request.heightMm) {
    return { error: "Este modelo ainda não foi medido — aguarde a geração terminar." };
  }

  const colors = await getAllMaterialColorsForConfigurator();
  const color = colors.find((c) => c.id === materialColorId);
  if (!color) return { error: "Escolha um material válido." };

  const settings = await getStoreSettings();
  const energyPriceCentsPerKwh = settings?.energyPriceCentsPerKwh;
  const printerPowerWatts = settings?.printerPowerWatts;
  const profitMarginPercent = settings?.profitMarginPercent ? Number(settings.profitMarginPercent) : null;
  const customModelFeeCents = settings?.customModelFeeCents;

  if (!energyPriceCentsPerKwh || !printerPowerWatts || !profitMarginPercent) {
    return {
      error: "A loja ainda não configurou a calculadora de preço (energia/potência/margem) em /admin/configuracoes.",
    };
  }
  if (!customModelFeeCents) {
    return { error: "A loja ainda não configurou a taxa de modelagem customizada em /admin/configuracoes." };
  }

  const suggestion = estimateMaterialCost(
    {
      weightGrams: Number(request.weightGrams),
      heightMm: Number(request.heightMm),
      printProcess: color.printProcess,
      pricePerKgCents: color.type.pricePerKgCents,
      printSpeedValue: color.type.printSpeedValue,
      postProcessingFeeCents: color.postProcessingFeeCents,
    },
    {
      energyPriceCentsPerKwh,
      printerPowerWatts,
      profitMarginPercent,
      fixedFeeCents: settings?.fixedFeeCents ?? 0,
    },
  );

  return {
    breakdown: {
      materialCostCents: suggestion.materialCostCents,
      energyCostCents: suggestion.energyCostCents,
      postProcessingFeeCents: suggestion.postProcessingFeeCents,
      printTimeHours: suggestion.printTimeHours,
      customModelFeeCents,
      totalPriceCents: suggestion.suggestedPriceCents + customModelFeeCents,
    },
  };
}
