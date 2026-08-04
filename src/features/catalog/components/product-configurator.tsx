"use client";

import { useMemo, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { useCartStore } from "@/features/checkout/cart-store";
import { formatPriceCents } from "@/lib/format";

import { calculateProductPriceCents, InvalidSelectionError } from "../pricing";
import type { Product, ProductSelection } from "../types";
import { ProductViewer3D, type ViewerPart } from "./product-viewer-3d";

export function ProductConfigurator({ product }: { product: Product }) {
  const [sizeId, setSizeId] = useState(product.sizeOptions[0]?.id ?? "");
  const [materialByPart, setMaterialByPart] = useState<Record<string, string>>(() =>
    Object.fromEntries(product.parts.map((part) => [part.id, part.availableMaterials[0]?.id ?? ""])),
  );

  const selection: ProductSelection = useMemo(
    () => ({
      sizeId,
      partSelections: product.parts.map((part) => ({
        partId: part.id,
        filamentOptionId: materialByPart[part.id],
      })),
    }),
    [sizeId, materialByPart, product.parts],
  );

  const priceCents = useMemo(() => {
    try {
      return calculateProductPriceCents(product, selection);
    } catch (error) {
      if (error instanceof InvalidSelectionError) return null;
      throw error;
    }
  }, [product, selection]);

  const viewerParts: ViewerPart[] = product.parts.map((part) => {
    const material = part.availableMaterials.find((m) => m.id === materialByPart[part.id]);
    return {
      id: part.id,
      meshUrl: part.meshFileUrl,
      color: material?.hexColor ?? "#a1a1aa",
      colorSecondary: material?.hexColorSecondary ?? null,
    };
  });

  const addItem = useCartStore((state) => state.addItem);

  function handleAddToCart() {
    if (priceCents === null) return;

    const sizeLabel = product.sizeOptions.find((s) => s.id === sizeId)?.label ?? "";
    const partsSummary = product.parts
      .map((part) => {
        const material = part.availableMaterials.find((m) => m.id === materialByPart[part.id]);
        return `${part.name}: ${material?.name ?? "—"}`;
      })
      .join(" · ");

    addItem({
      productId: product.id,
      productSlug: product.slug,
      productName: product.name,
      quantity: 1,
      selection,
      summary: `Tamanho ${sizeLabel} · ${partsSummary}`,
      estimatedUnitPriceCents: priceCents,
    });

    toast.success(`${product.name} adicionado ao carrinho.`);
  }

  return (
    <div className="grid gap-8 md:grid-cols-2">
      <ProductViewer3D parts={viewerParts} />

      <div className="flex flex-col gap-6">
        <div>
          <h2 className="text-sm font-medium">Tamanho</h2>
          <div className="mt-2 flex flex-wrap gap-2">
            {product.sizeOptions.map((size) => (
              <Button
                key={size.id}
                type="button"
                variant={size.id === sizeId ? "default" : "outline"}
                size="sm"
                onClick={() => setSizeId(size.id)}
              >
                {size.label}
              </Button>
            ))}
          </div>
        </div>

        {product.parts.map((part) => (
          <div key={part.id}>
            <h2 className="text-sm font-medium capitalize">{part.name}</h2>
            <div className="mt-2 flex flex-wrap gap-2">
              {part.availableMaterials.map((material) => {
                const isSelected = materialByPart[part.id] === material.id;
                return (
                  <button
                    key={material.id}
                    type="button"
                    title={material.name}
                    aria-label={material.name}
                    aria-pressed={isSelected}
                    onClick={() => setMaterialByPart((prev) => ({ ...prev, [part.id]: material.id }))}
                    className={`h-8 w-8 rounded-full border-2 transition-transform ${
                      isSelected ? "scale-110 border-foreground" : "border-transparent"
                    }`}
                    style={{
                      background: material.hexColorSecondary
                        ? `linear-gradient(135deg, ${material.hexColor} 50%, ${material.hexColorSecondary} 50%)`
                        : (material.hexColor ?? "#a1a1aa"),
                    }}
                  />
                );
              })}
            </div>
          </div>
        ))}

        <div className="mt-auto border-t pt-4">
          <p className="text-2xl font-semibold">{priceCents !== null ? formatPriceCents(priceCents) : "—"}</p>
          <Button className="mt-4 w-full" disabled={priceCents === null} onClick={handleAddToCart}>
            Adicionar ao carrinho
          </Button>
        </div>
      </div>
    </div>
  );
}
