export type MaterialPrintProcess = "fdm" | "resin";

/** O Tipo dentro de um Material (ex.: "PLA"/"ABS" em Plástico, "Cristal"/"Dental" em Resina). */
export interface MaterialTypeInfo {
  id: string;
  name: string;
  pricePerKgCents: number;
  /** g/hora se o material é FDM, mm de altura/hora se é resina — ver print-estimate.ts. */
  printSpeedValue: number;
  description: string | null;
}

/** Uma cor específica dentro de um Tipo de material. */
export interface MaterialColor {
  id: string;
  name: string;
  hexColor: string | null;
  /** Só preenchido quando o Material dono do tipo permite dual-color (hoje só Plástico). */
  hexColorSecondary: string | null;
  materialName: string; // "Resina" | "Plástico" — pro texto explicativo (Fase 3) e diferenciação visual (Fase 2)
  printProcess: MaterialPrintProcess;
  postProcessingFeeCents: number;
  /** Taxa fixa somada ao preço ao vivo quando esta cor é dual-color (hexColorSecondary preenchido). */
  dualColorFeeCents: number;
  /** 1 = opaco (padrão). Menor que 1 deixa a peça translúcida no preview 3D — pra resina tipo "Cristal". */
  opacity: number;
  type: MaterialTypeInfo;
}

/** Uma região pintada (MMU) dentro de um único arquivo .3mf — ver src/features/catalog/mmu-3mf.ts. */
export interface ProductPartRegion {
  id: string;
  label: string;
  /** Estado decodificado do arquivo: 0 = região padrão, 1-16 = Extrusora 1-16. */
  paintState: number;
  /** false = detectada errado (ruído da segmentação) — some da loja, mas continua colorida no preview com defaultMaterialColorId. */
  enabled: boolean;
  /** Cor pré-selecionada pra essa região — null usa o padrão da parte (ProductPart.defaultMaterialColorId). */
  defaultMaterialColorId: string | null;
}

export interface ProductPart {
  id: string;
  name: string;
  /** URL do .glb usado no preview 3D (convertido a partir do STL original no upload). */
  meshFileUrl: string | null;
  availableColors: MaterialColor[];
  /** Vazio = peça de cor única (comportamento normal). Não-vazio = .3mf pintado, uma cor por região. */
  regions: ProductPartRegion[];
  /** Cor pré-selecionada pro cliente (e pras regiões desta parte) — null usa a primeira da lista. */
  defaultMaterialColorId: string | null;
  /** Peso só desta peça, medido do próprio arquivo 3D dela — null até o
   * admin confirmar um upload depois que esta coluna passou a existir.
   * Alimenta o preço ao vivo por material/cor (pricing.ts); sem isso, a
   * peça não contribui com nenhum ajuste de preço (cai pro preço-âncora). */
  weightGrams: number | null;
}

export interface SizeOption {
  id: string;
  label: string;
  scaleFactor: number;
  priceModifierCents: number;
  weightModifierGrams: number;
}

export interface Product {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  basePriceCents: number;
  /** Peso/dimensões da embalagem, usados na cotação de frete. Null nos
   * produtos cadastrados antes desses campos existirem — a cotação usa um
   * fallback de caixa pequena nesse caso (ver `features/shipping`). */
  weightGrams: number | null;
  heightCm: number | null;
  widthCm: number | null;
  lengthCm: number | null;
  /** Sobrepõem name/description no <title>/<meta description> quando preenchidos. */
  metaTitle: string | null;
  metaDescription: string | null;
  /** Fotos/gifs reais do produto, na ordem de exibição — a primeira é a capa/imagem OG. */
  images: string[];
  parts: ProductPart[];
  sizeOptions: SizeOption[];
  /** Ângulo inicial customizado pelo admin no visualizador 3D — null usa o
   * ângulo padrão de sempre. Só a direção do ponto importa (ver
   * ProductViewerAngleControl). */
  viewerCameraPosition: { x: number; y: number; z: number } | null;
}

/**
 * Escolha do cliente ao configurar um produto: tamanho + cor de cada parte.
 * Uma parte sem regiões usa `materialColorId` (comportamento normal); uma
 * parte com regiões usa `regionSelections`, uma cor por região.
 */
export interface ProductSelection {
  sizeId: string;
  partSelections: Array<{
    partId: string;
    materialColorId?: string;
    regionSelections?: Array<{ regionId: string; materialColorId: string }>;
  }>;
}
