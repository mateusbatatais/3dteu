"use client";

import { ShoppingCart, User } from "lucide-react";
import Link from "next/link";

import { useCartStore } from "@/features/checkout/cart-store";
import { SiteLogo } from "./site-logo";

export function SiteHeader() {
  const itemCount = useCartStore((state) => state.items.reduce((sum, item) => sum + item.quantity, 0));

  return (
    <header className="sticky top-0 z-40 border-b bg-background/80 backdrop-blur">
      <div className="mx-auto flex h-16 w-full max-w-6xl items-center justify-between px-6">
        <SiteLogo />

        <nav className="flex items-center gap-6">
          <Link
            href="/#catalogo"
            className="text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
          >
            Catálogo
          </Link>
          <Link
            href="/conta"
            aria-label="Minha conta"
            className="text-muted-foreground transition-colors hover:text-foreground"
          >
            <User className="size-5" />
          </Link>
          <Link
            href="/carrinho"
            aria-label="Carrinho"
            className="relative text-muted-foreground transition-colors hover:text-foreground"
          >
            <ShoppingCart className="size-5" />
            {itemCount > 0 ? (
              <span className="absolute -right-2 -top-2 flex size-4 items-center justify-center rounded-full bg-primary text-[10px] font-semibold text-primary-foreground">
                {itemCount}
              </span>
            ) : null}
          </Link>
        </nav>
      </div>
    </header>
  );
}
