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
