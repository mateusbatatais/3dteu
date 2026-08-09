import { Star } from "lucide-react";

/** Só exibe — aceita nota fracionária (média), preenche as estrelas proporcionalmente. */
export function StarRatingDisplay({ rating, className = "size-4" }: { rating: number; className?: string }) {
  const percentage = (Math.max(0, Math.min(5, rating)) / 5) * 100;

  return (
    <span className="relative inline-flex" aria-label={`${rating.toFixed(1)} de 5 estrelas`}>
      <span className="flex text-muted-foreground/25">
        {Array.from({ length: 5 }).map((_, i) => (
          <Star key={i} className={className} fill="currentColor" strokeWidth={0} />
        ))}
      </span>
      <span className="absolute inset-0 flex overflow-hidden text-amber-400" style={{ width: `${percentage}%` }}>
        {Array.from({ length: 5 }).map((_, i) => (
          <Star key={i} className={className} fill="currentColor" strokeWidth={0} />
        ))}
      </span>
    </span>
  );
}

/** Escolha discreta de 1 a 5 — usada no formulário de avaliação. */
export function StarRatingPicker({ value, onChange }: { value: number; onChange: (rating: number) => void }) {
  return (
    <div className="flex gap-1">
      {[1, 2, 3, 4, 5].map((n) => (
        <button
          key={n}
          type="button"
          onClick={() => onChange(n)}
          aria-label={`${n} estrela${n > 1 ? "s" : ""}`}
          aria-pressed={n === value}
        >
          <Star className={`size-6 ${n <= value ? "fill-amber-400 text-amber-400" : "fill-none text-muted-foreground/40"}`} />
        </button>
      ))}
    </div>
  );
}
