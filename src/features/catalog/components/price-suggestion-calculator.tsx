"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";

import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { applySuggestedPrice } from "@/features/catalog/actions";
import { estimateMaterialCost } from "@/features/catalog/print-estimate";
import { formatPriceCents } from "@/lib/format";
import type { MaterialPrintProcess } from "@/features/catalog/types";

interface MaterialTypeOption {
  id: string;
  name: string;
  materialName: string;
  printProcess: MaterialPrintProcess;
  pricePerKgCents: number;
  printSpeedValue: string;
  postProcessingFeeCents: number;
}

interface PricingSettings {
  energyPriceCentsPerKwh: number | null;
  printerPowerWatts: number | null;
  profitMarginPercent: number | null;
  fixedFeeCents: number | null;
}

/**
 * Sugere um preço pro produto a partir de: peso/altura estimados do arquivo
 * (rodada 22/26) + custo do Tipo de material escolhido (R$/kg + velocidade de
 * impressão) + energia + pós-processamento + margem de lucro (Fase 1 do
 * ROADMAP.md). O admin escolhe qual Tipo usar como referência pro cálculo —
 * o preço do produto continua sendo um valor único (basePriceCents), não
 * recalcula ao vivo por cor escolhida pelo cliente.
 */
export function PriceSuggestionCalculator({
  productId,
  weightGrams,
  heightCm,
  materialTypes,
  pricingSettings,
}: {
  productId: string;
  weightGrams: number | null;
  heightCm: number | null;
  materialTypes: MaterialTypeOption[];
  pricingSettings: PricingSettings;
}) {
  const [selectedTypeId, setSelectedTypeId] = useState(materialTypes[0]?.id ?? "");
  const [isApplying, startTransition] = useTransition();

  if (materialTypes.length === 0) {
    return (
      <p className="mt-2 text-sm text-muted-foreground">
        Cadastre um material em /admin/materiais pra habilitar a calculadora de preço.
      </p>
    );
  }

  if (!weightGrams || !heightCm) {
    return (
      <p className="mt-2 text-sm text-muted-foreground">
        Envie o arquivo 3D de alguma peça primeiro — peso e altura são estimados automaticamente e alimentam esta
        calculadora.
      </p>
    );
  }

  const { energyPriceCentsPerKwh, printerPowerWatts, profitMarginPercent } = pricingSettings;
  if (!energyPriceCentsPerKwh || !printerPowerWatts || !profitMarginPercent) {
    return (
      <p className="mt-2 text-sm text-muted-foreground">
        Preencha preço da energia, potência da impressora e margem de lucro em /admin/configuracoes pra habilitar a
        calculadora de preço.
      </p>
    );
  }

  const selectedType = materialTypes.find((t) => t.id === selectedTypeId);
  const suggestion = selectedType
    ? estimateMaterialCost(
        {
          weightGrams,
          heightMm: heightCm * 10,
          printProcess: selectedType.printProcess,
          pricePerKgCents: selectedType.pricePerKgCents,
          printSpeedValue: Number(selectedType.printSpeedValue),
          postProcessingFeeCents: selectedType.postProcessingFeeCents,
        },
        { energyPriceCentsPerKwh, printerPowerWatts, profitMarginPercent, fixedFeeCents: pricingSettings.fixedFeeCents ?? 0 },
      )
    : null;

  function handleApply() {
    if (!suggestion) return;
    startTransition(async () => {
      const result = await applySuggestedPrice(productId, suggestion.suggestedPriceCents);
      if (result.error) {
        toast.error(result.error);
        return;
      }
      toast.success(`Preço base atualizado pra ${formatPriceCents(suggestion.suggestedPriceCents)}.`);
    });
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-col gap-1.5">
        <label className="text-xs text-muted-foreground">Calcular assumindo o material</label>
        <Select value={selectedTypeId} onValueChange={(value) => value && setSelectedTypeId(value)}>
          <SelectTrigger className="w-full sm:w-64">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {materialTypes.map((type) => (
              <SelectItem key={type.id} value={type.id}>
                {type.materialName} · {type.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {suggestion ? (
        <p className="text-xs text-muted-foreground">
          Material: {formatPriceCents(suggestion.materialCostCents)} + Energia:{" "}
          {formatPriceCents(suggestion.energyCostCents)} ({suggestion.printTimeHours.toFixed(1)}h estimadas) +
          Pós-processamento: {formatPriceCents(suggestion.postProcessingFeeCents)} + margem ={" "}
          <span className="font-medium text-foreground">Sugestão: {formatPriceCents(suggestion.suggestedPriceCents)}</span>
          .{" "}
          <button
            type="button"
            disabled={isApplying}
            onClick={handleApply}
            className="font-medium text-primary underline-offset-2 hover:underline disabled:opacity-50"
          >
            Usar esse preço
          </button>
        </p>
      ) : null}
    </div>
  );
}
