export type CustomModelRequestStatus = "pending" | "generating" | "ready" | "failed" | "confirmed";

export const CUSTOM_MODEL_REQUEST_STATUS_LABELS: Record<CustomModelRequestStatus, string> = {
  pending: "Na fila",
  generating: "Gerando modelo 3D...",
  ready: "Pronto pra revisar",
  failed: "Falhou",
  confirmed: "Virou pedido",
};

// Mesmo padrão de cor por status já usado em ORDER_STATUS_BADGE_CLASSES
// (src/features/orders/types.ts).
export const CUSTOM_MODEL_REQUEST_STATUS_BADGE_CLASSES: Record<CustomModelRequestStatus, string> = {
  pending: "border-amber-500/20 bg-amber-500/10 text-amber-600 dark:text-amber-400",
  generating: "border-blue-500/20 bg-blue-500/10 text-blue-600 dark:text-blue-400",
  ready: "border-violet-500/20 bg-violet-500/10 text-violet-600 dark:text-violet-400",
  failed: "border-destructive/20 bg-destructive/10 text-destructive",
  confirmed: "border-emerald-500/20 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
};

/** Formato passado do Server Component pro client (e devolvido pelo polling
 * de status) — colunas numeric do Postgres chegam como string via Drizzle. */
export interface CustomModelRequestView {
  id: string;
  description: string;
  status: CustomModelRequestStatus;
  meshFileUrl: string | null;
  thumbnailUrl: string | null;
  weightGrams: string | null;
  widthMm: string | null;
  heightMm: string | null;
  depthMm: string | null;
  errorMessage: string | null;
}
