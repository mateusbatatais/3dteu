/**
 * Estimativa de peso de impressão FDM a partir do volume real do arquivo
 * (não da bounding box) — mesmo princípio das calculadoras de peso de STL
 * por aí: aproxima o volume que o fatiador realmente extruda como "casca
 * sólida ao longo da superfície" + "preenchimento esparso no miolo", em vez
 * de tratar a peça como maciça (que superestimaria muito o peso real).
 *
 * Parâmetros abaixo são "configuração padrão" de fatiador (não a peça real
 * que vai ser usada) — por isso é uma sugestão, não uma medição: infill
 * 20% e 3 perímetros a 0,4mm de bico (~1,2mm de parede) são valores comuns
 * de fábrica no Cura/PrusaSlicer/Bambu Studio; densidade é a do PLA, o
 * filamento mais comum. Se a peça de verdade usar outra configuração ou
 * material, o resultado real vai variar.
 */
const DEFAULT_INFILL_RATIO = 0.2;
const DEFAULT_WALL_THICKNESS_MM = 1.2;
const PLA_DENSITY_G_PER_CM3 = 1.24;

export interface PrintWeightEstimate {
  weightGrams: number;
  /** Texto curto explicando as premissas, pra mostrar junto do número. */
  assumptionLabel: string;
}

export function estimatePrintWeight(volumeMm3: number, surfaceAreaMm2: number): PrintWeightEstimate {
  const volumeCm3 = volumeMm3 / 1000;
  const surfaceAreaCm2 = surfaceAreaMm2 / 100;
  const wallThicknessCm = DEFAULT_WALL_THICKNESS_MM / 10;

  // A "casca" nunca pode ocupar mais volume do que a peça inteira tem —
  // acontece em peças muito finas/pequenas, onde a espessura de parede
  // padrão já cobriria o miolo inteiro.
  const shellVolumeCm3 = Math.min(surfaceAreaCm2 * wallThicknessCm, volumeCm3);
  const infillVolumeCm3 = Math.max(volumeCm3 - shellVolumeCm3, 0) * DEFAULT_INFILL_RATIO;
  const effectiveVolumeCm3 = shellVolumeCm3 + infillVolumeCm3;

  return {
    weightGrams: effectiveVolumeCm3 * PLA_DENSITY_G_PER_CM3,
    assumptionLabel: "FDM, PLA, preenchimento 20%",
  };
}

// ---------------------------------------------------------------------------
// Calculadora de preço (Fase 1 do ROADMAP.md): material + energia +
// pós-processamento, com margem de lucro em cima — vira a sugestão de
// `basePriceCents` que o admin aplica com um clique (nunca automático,
// mesmo princípio já usado pro peso/dimensões).
// ---------------------------------------------------------------------------

export interface MaterialCostInputs {
  weightGrams: number;
  /** Só usado pra resina (o tempo de cura depende da altura, não do peso). */
  heightMm: number;
  printProcess: "fdm" | "resin";
  pricePerKgCents: number;
  /** g/hora se FDM, mm de altura/hora se resina. */
  printSpeedValue: number;
  postProcessingFeeCents: number;
}

export interface StorePricingSettings {
  energyPriceCentsPerKwh: number;
  printerPowerWatts: number;
  profitMarginPercent: number;
  fixedFeeCents: number;
}

export interface PriceSuggestion {
  materialCostCents: number;
  energyCostCents: number;
  postProcessingFeeCents: number;
  printTimeHours: number;
  suggestedPriceCents: number;
}

/**
 * FDM deposita material continuamente — tempo de impressão escala com o
 * PESO. Resina cura uma camada inteira de cada vez, então o tempo escala
 * com a ALTURA da peça (uma peça baixa e larga imprime rápido; uma peça alta
 * e fina demora, mesmo pesando pouco) — por isso as duas fórmulas são
 * diferentes, não um "tempo genérico" só.
 */
function estimatePrintTimeHours(inputs: MaterialCostInputs): number {
  if (inputs.printSpeedValue <= 0) return 0;
  return inputs.printProcess === "resin"
    ? inputs.heightMm / inputs.printSpeedValue
    : inputs.weightGrams / inputs.printSpeedValue;
}

export function estimateMaterialCost(inputs: MaterialCostInputs, store: StorePricingSettings): PriceSuggestion {
  const materialCostCents = Math.round((inputs.weightGrams * inputs.pricePerKgCents) / 1000);
  const printTimeHours = estimatePrintTimeHours(inputs);
  const printerPowerKw = store.printerPowerWatts / 1000;
  const energyCostCents = Math.round(printTimeHours * printerPowerKw * store.energyPriceCentsPerKwh);
  const postProcessingFeeCents = inputs.postProcessingFeeCents;

  const totalCostCents = materialCostCents + energyCostCents + postProcessingFeeCents;
  const suggestedPriceCents = Math.round(totalCostCents * (1 + store.profitMarginPercent / 100)) + store.fixedFeeCents;

  return { materialCostCents, energyCostCents, postProcessingFeeCents, printTimeHours, suggestedPriceCents };
}

// ---------------------------------------------------------------------------
// Preço ao vivo por peça, por material/cor escolhida (pricing.ts) — irmã mais
// simples de `estimateMaterialCost` acima. Diferença deliberada: sempre usa
// peso/velocidade pro tempo de impressão, mesmo pra resina (que fisicamente
// escala com altura, não peso) — não existe altura por PEÇA no schema (só
// por produto inteiro), e `estimateMaterialCost`/`estimatePrintWeight` já
// cobrem o caso "produto inteiro" com mais precisão pra calculadora do
// admin. Essa aproximação é aceitável aqui pelo mesmo motivo de
// `estimatePrintWeight` assumir sempre FDM/PLA/20% infill: uma sugestão
// declarada como aproximada é melhor que nenhuma, mas não finge precisão
// que os dados disponíveis não sustentam.
// ---------------------------------------------------------------------------

export interface PartRawCostInputs {
  weightGrams: number;
  pricePerKgCents: number;
  /** Sempre tratado como g/hora aqui, independente do processo — ver comentário acima. */
  printSpeedValue: number;
  postProcessingFeeCents: number;
}

export interface EnergyPricingConfig {
  energyPriceCentsPerKwh: number;
  printerPowerWatts: number;
}

/** Custo cru (sem margem, sem taxa fixa da loja) de imprimir uma peça com um
 * material específico — usado só pra comparar DELTAS entre o material padrão
 * e o escolhido (ver pricing.ts), nunca como preço final sozinho. */
export function estimatePartRawCostCents(inputs: PartRawCostInputs, energy: EnergyPricingConfig | null): number {
  const materialCostCents = Math.round((inputs.weightGrams * inputs.pricePerKgCents) / 1000);

  let energyCostCents = 0;
  if (energy && inputs.printSpeedValue > 0) {
    const printTimeHours = inputs.weightGrams / inputs.printSpeedValue;
    const printerPowerKw = energy.printerPowerWatts / 1000;
    energyCostCents = Math.round(printTimeHours * printerPowerKw * energy.energyPriceCentsPerKwh);
  }

  return materialCostCents + energyCostCents + inputs.postProcessingFeeCents;
}
