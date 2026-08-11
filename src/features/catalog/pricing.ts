import type { Product, ProductSelection } from "./types";

export class InvalidSelectionError extends Error {}

/**
 * Calcula o preço final (em centavos) de um produto configurado:
 *
 *   preço = base + modificador do tamanho
 *
 * `basePriceCents` é definido pelo admin (a calculadora de
 * material+energia+pós-processamento+margem em print-estimate.ts ajuda a
 * chegar nesse número, mas nunca aplica sozinha) — a cor escolhida não muda
 * o preço ao vivo aqui, é só validada (precisa ser uma opção de verdade da
 * parte). Isso é uma escolha deliberada: o preço por kg fica no Tipo do
 * material pra alimentar a calculadora do admin, não pra recalcular o preço
 * a cada clique do cliente no configurador — ver ROADMAP.md "Fase 1".
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
      continue;
    }

    const isValid = part.availableColors.some((c) => c.id === chosen.materialColorId);
    if (!isValid) {
      throw new InvalidSelectionError(
        `Cor "${chosen.materialColorId}" não é uma opção válida para a parte "${part.name}".`,
      );
    }
  }

  return product.basePriceCents + size.priceModifierCents;
}
