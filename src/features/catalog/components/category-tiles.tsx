import Image from "next/image";
import Link from "next/link";

// Sem foto real ainda? Cada tile cai num degradê diferente (cor da marca),
// só pra a home não ficar visualmente "vazia" — troca por foto de verdade
// assim que a categoria tiver uma (CategoryImageUpload no admin).
const FALLBACK_GRADIENTS = [
  "from-primary/70 to-brand-orange/70",
  "from-brand-orange/70 to-primary/70",
  "from-primary/50 via-brand-orange/40 to-primary/80",
  "from-brand-orange/50 via-primary/40 to-brand-orange/80",
];

export function CategoryTiles({
  categories,
}: {
  categories: Array<{ slug: string; name: string; imageUrl: string | null }>;
}) {
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      {categories.map((category, index) => (
        <Link
          key={category.slug}
          href={`/categorias/${category.slug}`}
          className="group relative flex aspect-[4/3] items-end overflow-hidden rounded-2xl ring-1 ring-foreground/10"
        >
          {category.imageUrl ? (
            <Image
              src={category.imageUrl}
              alt={category.name}
              fill
              sizes="(min-width: 1024px) 25vw, (min-width: 640px) 50vw, 100vw"
              className="object-cover transition-transform duration-300 group-hover:scale-105"
            />
          ) : (
            <div
              className={`absolute inset-0 bg-gradient-to-br transition-transform duration-300 group-hover:scale-105 ${FALLBACK_GRADIENTS[index % FALLBACK_GRADIENTS.length]}`}
            />
          )}
          <div className="absolute inset-0 bg-gradient-to-t from-black/75 via-black/10 to-transparent" />
          <span className="relative z-10 p-4 text-lg font-semibold text-white">{category.name}</span>
        </Link>
      ))}
    </div>
  );
}
