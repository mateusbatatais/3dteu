import Link from "next/link";

import { createClient } from "@/lib/supabase/server";

import { getProductRatingSummary, getProductReviews } from "../queries";
import { ReviewForm } from "./review-form";
import { StarRatingDisplay } from "./star-rating";

export async function ProductReviewsSection({ productId }: { productId: string }) {
  const [reviews, summary] = await Promise.all([getProductReviews(productId), getProductRatingSummary(productId)]);

  // Best-effort: se o Supabase Auth não estiver configurado (dev local sem
  // env vars) ou a checagem falhar por qualquer motivo, trata como
  // visitante anônimo em vez de derrubar a página do produto inteira — a
  // seção de reviews é só um extra, não pode quebrar a compra.
  let currentCustomerId: string | null = null;
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    currentCustomerId = user?.id ?? null;
  } catch {
    currentCustomerId = null;
  }

  const myReview = currentCustomerId ? reviews.find((r) => r.customerId === currentCustomerId) : undefined;

  return (
    <section className="mt-16 border-t pt-8">
      <div className="flex items-center gap-3">
        <h2 className="text-xl font-semibold tracking-tight">Avaliações</h2>
        {summary.reviewCount > 0 ? (
          <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
            <StarRatingDisplay rating={summary.averageRating ?? 0} />
            <span>
              {summary.averageRating?.toFixed(1)} · {summary.reviewCount}{" "}
              {summary.reviewCount === 1 ? "avaliação" : "avaliações"}
            </span>
          </div>
        ) : null}
      </div>

      <div className="mt-4 max-w-xl">
        {currentCustomerId ? (
          <ReviewForm
            productId={productId}
            defaultValues={myReview ? { rating: myReview.rating, comment: myReview.comment ?? "" } : undefined}
          />
        ) : (
          <p className="rounded-xl bg-muted/30 p-4 text-sm text-muted-foreground ring-1 ring-foreground/10">
            <Link href="/conta/entrar" className="text-foreground underline-offset-2 hover:underline">
              Entre na sua conta
            </Link>{" "}
            pra avaliar este produto.
          </p>
        )}
      </div>

      {reviews.length === 0 ? (
        <p className="mt-6 text-sm text-muted-foreground">Nenhuma avaliação ainda — seja o primeiro.</p>
      ) : (
        <div className="mt-6 flex flex-col gap-4">
          {reviews.map((review) => (
            <div key={review.id} className="border-b pb-4 last:border-b-0">
              <div className="flex items-center justify-between">
                <p className="font-medium">{review.customerName}</p>
                <p className="text-xs text-muted-foreground">{review.createdAt.toLocaleDateString("pt-BR")}</p>
              </div>
              <StarRatingDisplay rating={review.rating} className="mt-1 size-3.5" />
              {review.comment ? <p className="mt-2 text-sm text-muted-foreground">{review.comment}</p> : null}
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
