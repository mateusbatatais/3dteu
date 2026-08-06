"use client";

import Image from "next/image";
import { useMemo, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { useCartStore } from "@/features/checkout/cart-store";
import { formatPriceCents } from "@/lib/format";

import { calculateProductPriceCents, InvalidSelectionError } from "../pricing";
import type { FilamentOption, Product, ProductSelection } from "../types";
import { ProductViewer3D, type ViewerPart } from "./product-viewer-3d";

function MaterialSwatches({
  materials,
  selectedId,
  onSelect,
}: {
  materials: FilamentOption[];
  selectedId: string | undefined;
  onSelect: (materialId: string) => void;
}) {
  return (
    <div className="mt-2 flex flex-wrap gap-3">
      {materials.map((material) => {
        const isSelected = selectedId === material.id;
        return (
          <button
            key={material.id}
            type="button"
            title={material.name}
            aria-label={material.name}
            aria-pressed={isSelected}
            onClick={() => onSelect(material.id)}
            className={`size-9 rounded-full transition-shadow ${
              isSelected
                ? "ring-2 ring-primary ring-offset-2 ring-offset-background"
                : "ring-1 ring-border hover:ring-foreground/30"
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
  );
}

export function ProductConfigurator({ product }: { product: Product }) {
  const [sizeId, setSizeId] = useState(product.sizeOptions[0]?.id ?? "");
  const [materialByPart, setMaterialByPart] = useState<Record<string, string>>(() =>
    Object.fromEntries(
      product.parts.filter((part) => part.regions.length === 0).map((part) => [part.id, part.availableMaterials[0]?.id ?? ""]),
    ),
  );
  // Uma parte com regiões (.3mf pintado) escolhe uma cor por região, não uma pra parte inteira.
  const [materialByRegion, setMaterialByRegion] = useState<Record<string, string>>(() =>
    Object.fromEntries(
      product.parts.flatMap((part) => part.regions.map((region) => [region.id, part.availableMaterials[0]?.id ?? ""])),
    ),
  );

  const selection: ProductSelection = useMemo(
    () => ({
      sizeId,
      partSelections: product.parts.map((part) =>
        part.regions.length > 0
          ? {
              partId: part.id,
              regionSelections: part.regions.map((region) => ({
                regionId: region.id,
                filamentOptionId: materialByRegion[region.id],
              })),
            }
          : { partId: part.id, filamentOptionId: materialByPart[part.id] },
      ),
    }),
    [sizeId, materialByPart, materialByRegion, product.parts],
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
    if (part.regions.length > 0) {
      return {
        id: part.id,
        meshUrl: part.meshFileUrl,
        color: "#a1a1aa",
        regions: part.regions.map((region) => {
          const material = part.availableMaterials.find((m) => m.id === materialByRegion[region.id]);
          return { paintState: region.paintState, color: material?.hexColor ?? "#a1a1aa" };
        }),
      };
    }

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
        if (part.regions.length > 0) {
          const regionsSummary = part.regions
            .map((region) => {
              const material = part.availableMaterials.find((m) => m.id === materialByRegion[region.id]);
              return `${region.label}: ${material?.name ?? "—"}`;
            })
            .join(", ");
          return `${part.name} (${regionsSummary})`;
        }

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
      <div>
        <ProductViewer3D parts={viewerParts} />

        {product.images.length > 0 ? (
          <div className="mt-3 flex flex-wrap gap-2">
            {product.images.map((url) => (
              <Image
                key={url}
                src={url}
                alt={product.name}
                width={64}
                height={64}
                unoptimized
                className="size-16 rounded-lg object-cover ring-1 ring-foreground/10"
              />
            ))}
          </div>
        ) : null}
      </div>

      <div className="flex flex-col gap-6">
        <div>
          <h2 className="text-xs font-medium tracking-wide text-muted-foreground uppercase">Tamanho</h2>
          <div className="mt-2 flex flex-wrap gap-2">
            {product.sizeOptions.map((size) => (
              <Button
                key={size.id}
                type="button"
                variant={size.id === sizeId ? "default" : "outline"}
                size="sm"
                className="min-w-10"
                onClick={() => setSizeId(size.id)}
              >
                {size.label}
              </Button>
            ))}
          </div>
        </div>

        {product.parts.map((part) =>
          part.regions.length > 0 ? (
            part.regions.map((region) => (
              <div key={region.id}>
                <h2 className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
                  {part.name} · {region.label}
                </h2>
                <MaterialSwatches
                  materials={part.availableMaterials}
                  selectedId={materialByRegion[region.id]}
                  onSelect={(materialId) => setMaterialByRegion((prev) => ({ ...prev, [region.id]: materialId }))}
                />
              </div>
            ))
          ) : (
            <div key={part.id}>
              <h2 className="text-xs font-medium tracking-wide text-muted-foreground uppercase">{part.name}</h2>
              <MaterialSwatches
                materials={part.availableMaterials}
                selectedId={materialByPart[part.id]}
                onSelect={(materialId) => setMaterialByPart((prev) => ({ ...prev, [part.id]: materialId }))}
              />
            </div>
          ),
        )}

        <div className="mt-auto rounded-xl bg-muted/40 p-4">
          <p className="text-2xl font-semibold">{priceCents !== null ? formatPriceCents(priceCents) : "—"}</p>
          <Button className="mt-4 w-full" size="lg" disabled={priceCents === null} onClick={handleAddToCart}>
            Adicionar ao carrinho
          </Button>
        </div>
      </div>
    </div>
  );
}
