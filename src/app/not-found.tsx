import type { Metadata } from "next";
import Link from "next/link";

import { SiteLogo } from "@/components/site-logo";
import { Button } from "@/components/ui/button";

export const metadata: Metadata = {
  title: "Página não encontrada",
  description: "Essa página não existe — parece que essa impressão falhou.",
};

// Squiggle solto em forma de "espaguete" — a piada mais universal de quem
// já imprimiu em 3D (peça descola da mesa, o bico continua extrudendo no
// ar e vira um emaranhado). Combinada com o keyframe abaixo pra balançar
// devagar, como um fio de filamento se assentando.
function SpaghettiSquiggle({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 200 70" fill="none" aria-hidden className={className}>
      <path
        d="M8 35 C 28 8, 46 62, 66 35 S 104 8, 124 35 S 162 62, 182 35"
        stroke="currentColor"
        strokeWidth="7"
        strokeLinecap="round"
        className="origin-center animate-[spaghetti-wiggle_3.5s_ease-in-out_infinite]"
      />
    </svg>
  );
}

export default function NotFound() {
  return (
    <div className="relative flex min-h-dvh flex-col overflow-hidden bg-gradient-to-br from-primary/10 via-background to-brand-orange/10">
      <style>{`
        @keyframes spaghetti-wiggle {
          0%, 100% { transform: rotate(-2deg) translateY(0); }
          50% { transform: rotate(2deg) translateY(-4px); }
        }
      `}</style>

      <div aria-hidden className="pointer-events-none absolute -top-24 -left-24 size-72 rounded-full bg-primary/25 blur-3xl" />
      <div aria-hidden className="pointer-events-none absolute -right-24 -bottom-24 size-72 rounded-full bg-brand-orange/25 blur-3xl" />

      <div className="relative mx-auto flex w-full max-w-2xl flex-1 flex-col items-center justify-center gap-5 px-6 py-16 text-center">
        <SiteLogo className="h-9 w-auto" />

        <SpaghettiSquiggle className="mt-4 h-14 w-44 text-brand-orange" />

        <p className="text-xs font-medium tracking-widest text-muted-foreground uppercase">Erro de impressão</p>

        <h1 className="text-8xl font-bold tracking-tight text-primary sm:text-9xl">404</h1>

        <h2 className="text-2xl font-semibold tracking-tight">Essa peça saiu torta.</h2>

        <p className="max-w-md text-muted-foreground">
          A página que você procura descolou da mesa de impressão e virou espaguete — ou talvez nunca tenha existido
          de verdade. Bora tentar de novo?
        </p>

        <div className="mt-2 flex flex-wrap items-center justify-center gap-3">
          <Button render={<Link href="/" />} nativeButton={false} size="lg" className="rounded-full px-8">
            Voltar pro início
          </Button>
          <Button
            render={<Link href="/conta/modelo-3d" />}
            nativeButton={false}
            size="lg"
            variant="outline"
            className="rounded-full px-8"
          >
            Imprimir algo de verdade
          </Button>
        </div>

        <p className="mt-8 font-mono text-[11px] text-muted-foreground/70">&gt; erro g-code: peça_não_encontrada (404)</p>
      </div>
    </div>
  );
}
