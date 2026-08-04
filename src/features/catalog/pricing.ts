import type { Product, ProductSelection } from "./types";

export class InvalidSelectionError extends Error {}

/**
 * Calcula o preço final (em centavos) de um produto configurado:
 *
 *   preço = base + modificador do tamanho + soma dos modificadores de
 *           material de cada parte selecionada
 *
 * Esta função deve rodar sempre no servidor a partir do catálogo atual no
 * momento do checkout — nunca a partir de um preço enviado pelo cliente,
 * que só serve como estimativa exibida na UI.
 */
export function calculateProductPriceCents(product: Product, selection: ProductSelection): number {
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

  const partsModifierCents = product.parts.reduce((total, part) => {
    const chosen = selection.partSelections.find((s) => s.partId === part.id);
    if (!chosen) {
      throw new InvalidSelectionError(`Nenhum material selecionado para a parte "${part.name}".`);
    }

    const material = part.availableMaterials.find((m) => m.id === chosen.filamentOptionId);
    if (!material) {
      throw new InvalidSelectionError(
        `Material "${chosen.filamentOptionId}" não é uma opção válida para a parte "${part.name}".`,
      );
    }

    return total + material.priceModifierCents;
  }, 0);

  return product.basePriceCents + size.priceModifierCents + partsModifierCents;
}
