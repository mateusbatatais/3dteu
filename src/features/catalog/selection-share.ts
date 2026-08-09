import type { ProductSelection } from "./types";

/** Nome do query param usado pro link compartilhável da configuração. */
export const SHARE_SELECTION_PARAM = "config";

export function encodeSelectionForShareUrl(selection: ProductSelection): string {
  return JSON.stringify(selection);
}

/**
 * Faz só uma checagem de formato — não valida se os ids (tamanho, material,
 * região) ainda existem no produto atual, já que o produto pode ter mudado
 * desde que o link foi gerado. Cada id inválido é ignorado individualmente
 * pelo `ProductConfigurator` (cai pro padrão daquele campo específico), em
 * vez de descartar a configuração inteira por causa de um campo só.
 */
export function decodeSelectionFromShareParam(raw: string | undefined | null): ProductSelection | null {
  if (!raw) return null;

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }

  if (typeof parsed !== "object" || parsed === null) return null;
  const candidate = parsed as Partial<ProductSelection>;
  if (typeof candidate.sizeId !== "string" || !Array.isArray(candidate.partSelections)) return null;

  return candidate as ProductSelection;
}
