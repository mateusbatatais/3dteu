export type FilamentType = "solid_color" | "dual_color" | "special";

export interface FilamentOption {
  id: string;
  type: FilamentType;
  name: string;
  hexColor: string | null;
  hexColorSecondary: string | null;
  priceModifierCents: number;
}

export interface ProductPart {
  id: string;
  name: string;
  /** URL do .glb usado no preview 3D (convertido a partir do STL original no upload). */
  meshFileUrl: string | null;
  availableMaterials: FilamentOption[];
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
  basePriceCents: number;
  parts: ProductPart[];
  sizeOptions: SizeOption[];
}

/** Escolha do cliente ao configurar um produto: tamanho + material de cada parte. */
export interface ProductSelection {
  sizeId: string;
  partSelections: Array<{ partId: string; filamentOptionId: string }>;
}
