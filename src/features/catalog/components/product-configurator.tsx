"use client";

import { Info, Share2 } from "lucide-react";
import Image from "next/image";
import { useMemo, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useCartStore } from "@/features/checkout/cart-store";
import { formatPriceCents } from "@/lib/format";

import { calculateProductPriceCents, InvalidSelectionError } from "../pricing";
import { encodeSelectionForShareUrl, SHARE_SELECTION_PARAM } from "../selection-share";
import type { MaterialColor, Product, ProductPartRegion, ProductSelection } from "../types";
import { ProductViewer3D, type ViewerPart } from "./product-viewer-3d";

function ColorSwatches({
  colors,
  selectedId,
  onSelect,
}: {
  colors: MaterialColor[];
  selectedId: string | undefined;
  onSelect: (colorId: string) => void;
}) {
  return (
    <div className="mt-2 flex flex-wrap gap-2">
      {colors.map((color) => {
        const isSelected = selectedId === color.id;
        return (
          <button
            key={color.id}
            type="button"
            title={color.name}
            aria-label={color.name}
            aria-pressed={isSelected}
            onClick={() => onSelect(color.id)}
            className={`size-9 rounded-full transition-shadow ${
              isSelected
                ? "ring-2 ring-primary ring-offset-2 ring-offset-background"
                : "ring-1 ring-border hover:ring-foreground/30"
            }`}
            style={{
              background: color.hexColorSecondary
                ? `linear-gradient(135deg, ${color.hexColor} 50%, ${color.hexColorSecondary} 50%)`
                : (color.hexColor ?? "#a1a1aa"),
            }}
          />
        );
      })}
    </div>
  );
}

// Cor pré-selecionada pelo admin pra essa parte — cai pra primeira da lista
// se não tiver padrão definido, ou se o padrão salvo não estiver mais entre
// as cores aceitas (admin pode ter desmarcado depois).
function resolveDefaultMaterialColorId(part: Product["parts"][number]): string {
  if (part.defaultMaterialColorId && part.availableColors.some((c) => c.id === part.defaultMaterialColorId)) {
    return part.defaultMaterialColorId;
  }
  return part.availableColors[0]?.id ?? "";
}

// Mesma ideia, mas o padrão da própria região tem prioridade sobre o da
// parte (uma região pintada pode querer uma cor diferente do resto da peça).
function resolveRegionDefaultMaterialColorId(part: Product["parts"][number], region: ProductPartRegion): string {
  if (region.defaultMaterialColorId && part.availableColors.some((c) => c.id === region.defaultMaterialColorId)) {
    return region.defaultMaterialColorId;
  }
  return resolveDefaultMaterialColorId(part);
}

// Um id vindo de um link compartilhado só é usado se ainda for válido pra
// esse produto — o produto pode ter mudado (cor removida, etc.) desde que o
// link foi gerado. Cada campo cai pro próprio padrão individualmente em vez
// de descartar a configuração inteira por causa de um id só.
function findSharedPartSelection(initialSelection: ProductSelection | null | undefined, partId: string) {
  return initialSelection?.partSelections.find((p) => p.partId === partId);
}

export function ProductConfigurator({
  product,
  initialSelection,
}: {
  product: Product;
  /** Vem de um link compartilhado (`?config=...`) — null/undefined usa os padrões normais. */
  initialSelection?: ProductSelection | null;
}) {
  const [sizeId, setSizeId] = useState(() => {
    const shared = initialSelection?.sizeId;
    if (shared && product.sizeOptions.some((s) => s.id === shared)) return shared;
    return product.sizeOptions[0]?.id ?? "";
  });
  const [colorByPart, setColorByPart] = useState<Record<string, string>>(() =>
    Object.fromEntries(
      product.parts
        .filter((part) => part.regions.length === 0)
        .map((part) => {
          const shared = findSharedPartSelection(initialSelection, part.id)?.materialColorId;
          const colorId =
            shared && part.availableColors.some((c) => c.id === shared) ? shared : resolveDefaultMaterialColorId(part);
          return [part.id, colorId];
        }),
    ),
  );
  // Uma parte com regiões (.3mf pintado) escolhe uma cor por região, não uma
  // pra parte inteira — cada região parte do próprio padrão (ou o da parte,
  // se a região não tiver um específico). Inclui regiões desabilitadas
  // também: elas não aparecem pro cliente escolher, mas continuam com uma
  // cor fixa (o padrão) pro preview 3D.
  const [colorByRegion, setColorByRegion] = useState<Record<string, string>>(() =>
    Object.fromEntries(
      product.parts.flatMap((part) => {
        const sharedRegions = findSharedPartSelection(initialSelection, part.id)?.regionSelections;
        return part.regions.map((region) => {
          const shared = sharedRegions?.find((r) => r.regionId === region.id)?.materialColorId;
          const colorId =
            shared && part.availableColors.some((c) => c.id === shared)
              ? shared
              : resolveRegionDefaultMaterialColorId(part, region);
          return [region.id, colorId];
        });
      }),
    ),
  );
  // Região "ativa" por parte — a paleta única embaixo da lista edita essa.
  const [activeRegionByPart, setActiveRegionByPart] = useState<Record<string, string>>(() =>
    Object.fromEntries(
      product.parts
        .filter((part) => part.regions.length > 0)
        .map((part) => [part.id, part.regions.find((r) => r.enabled)?.id ?? ""]),
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
                materialColorId: colorByRegion[region.id],
              })),
            }
          : { partId: part.id, materialColorId: colorByPart[part.id] },
      ),
    }),
    [sizeId, colorByPart, colorByRegion, product.parts],
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
          const color = part.availableColors.find((c) => c.id === colorByRegion[region.id]);
          return { paintState: region.paintState, color: color?.hexColor ?? "#a1a1aa" };
        }),
      };
    }

    const color = part.availableColors.find((c) => c.id === colorByPart[part.id]);
    return {
      id: part.id,
      meshUrl: part.meshFileUrl,
      color: color?.hexColor ?? "#a1a1aa",
      colorSecondary: color?.hexColorSecondary ?? null,
      printProcess: color?.printProcess,
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
            .filter((region) => region.enabled)
            .map((region) => {
              const color = part.availableColors.find((c) => c.id === colorByRegion[region.id]);
              return `${region.label}: ${color?.name ?? "—"}`;
            })
            .join(", ");
          return `${part.name} (${regionsSummary})`;
        }

        const color = part.availableColors.find((c) => c.id === colorByPart[part.id]);
        return `${part.name}: ${color?.name ?? "—"}`;
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

  function handleShare() {
    const url = new URL(window.location.href);
    url.searchParams.set(SHARE_SELECTION_PARAM, encodeSelectionForShareUrl(selection));

    navigator.clipboard
      .writeText(url.toString())
      .then(() => toast.success("Link copiado! Quem abrir vê essa mesma configuração de cores."))
      .catch(() => toast.error("Não foi possível copiar o link."));
  }

  return (
    <div className="grid gap-8 md:grid-cols-2">
      <div>
        <ProductViewer3D parts={viewerParts} />

        {product.images.length > 0 ? (
          <div className="mt-4">
            <h2 className="text-xs font-medium tracking-wide text-muted-foreground uppercase">Fotos e vídeos</h2>
            <div className="mt-2 flex flex-wrap gap-3">
              {product.images.map((url) => (
                <Dialog key={url}>
                  <DialogTrigger
                    render={
                      <button
                        type="button"
                        className="overflow-hidden rounded-lg ring-1 ring-foreground/10 transition-transform hover:scale-105"
                      />
                    }
                  >
                    <Image src={url} alt={product.name} width={112} height={112} unoptimized className="size-28 object-cover" />
                  </DialogTrigger>
                  <DialogContent className="sm:max-w-2xl" showCloseButton>
                    <DialogTitle className="sr-only">Foto de {product.name}</DialogTitle>
                    <Image
                      src={url}
                      alt={product.name}
                      width={900}
                      height={900}
                      unoptimized
                      className="h-auto max-h-[80vh] w-full rounded-lg object-contain"
                    />
                  </DialogContent>
                </Dialog>
              ))}
            </div>
          </div>
        ) : null}
      </div>

      <div className="flex flex-col gap-6">
        <div>
          <div className="flex items-center gap-1.5">
            <h2 className="text-xs font-medium tracking-wide text-muted-foreground uppercase">Tamanho</h2>
            <Tooltip>
              <TooltipTrigger
                className="text-muted-foreground hover:text-foreground"
                aria-label="O que o tamanho representa"
              >
                <Info className="size-3.5" />
              </TooltipTrigger>
              <TooltipContent>
                O tamanho se refere à maior dimensão da peça — as outras medidas acompanham
                proporcionalmente, mantendo as proporções originais do modelo.
              </TooltipContent>
            </Tooltip>
          </div>
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

        {product.parts.map((part) => {
          // Uma parte com regiões (.3mf pintado) mostra uma lista com o nome
          // + a cor atual de cada região (só as visíveis pro cliente — uma
          // região escondida pelo admin fica com a cor padrão, mas não
          // aparece aqui) e UMA paleta única embaixo, que edita a região
          // selecionada na lista — evita repetir a mesma paleta de cores uma
          // vez por região, que crescia muito rápido em arquivos com várias
          // regiões pintadas (ex.: 6 no Bulbasaur).
          if (part.regions.length === 0) {
            return (
              <div key={part.id}>
                <h2 className="text-xs font-medium tracking-wide text-muted-foreground uppercase">{part.name}</h2>
                <ColorSwatches
                  colors={part.availableColors}
                  selectedId={colorByPart[part.id]}
                  onSelect={(colorId) => setColorByPart((prev) => ({ ...prev, [part.id]: colorId }))}
                />
              </div>
            );
          }

          const visibleRegions = part.regions.filter((region) => region.enabled);
          const activeRegionId = activeRegionByPart[part.id];
          const activeRegion = visibleRegions.find((region) => region.id === activeRegionId);

          return (
            <div key={part.id} className="rounded-xl bg-muted/30 p-4 ring-1 ring-foreground/10">
              <h2 className="text-xs font-medium tracking-wide text-muted-foreground uppercase">{part.name}</h2>
              <div className="mt-2 flex flex-col gap-1">
                {visibleRegions.map((region) => {
                  const color = part.availableColors.find((c) => c.id === colorByRegion[region.id]);
                  const isActive = region.id === activeRegionId;
                  return (
                    <button
                      key={region.id}
                      type="button"
                      aria-pressed={isActive}
                      onClick={() => setActiveRegionByPart((prev) => ({ ...prev, [part.id]: region.id }))}
                      className={`flex items-center justify-between rounded-lg px-3 py-2 text-sm transition-colors ${
                        isActive ? "bg-primary/10 ring-1 ring-primary" : "hover:bg-background/60"
                      }`}
                    >
                      <span>{region.label}</span>
                      <span
                        className="size-5 shrink-0 rounded-full ring-1 ring-border"
                        style={{
                          background: color?.hexColorSecondary
                            ? `linear-gradient(135deg, ${color.hexColor} 50%, ${color.hexColorSecondary} 50%)`
                            : (color?.hexColor ?? "#a1a1aa"),
                        }}
                      />
                    </button>
                  );
                })}
              </div>

              {activeRegion ? (
                <div className="mt-3 border-t pt-3">
                  <h3 className="text-xs text-muted-foreground">Cor para &ldquo;{activeRegion.label}&rdquo;</h3>
                  <ColorSwatches
                    colors={part.availableColors}
                    selectedId={colorByRegion[activeRegion.id]}
                    onSelect={(colorId) =>
                      setColorByRegion((prev) => ({ ...prev, [activeRegion.id]: colorId }))
                    }
                  />
                </div>
              ) : null}
            </div>
          );
        })}

        <div className="mt-auto rounded-xl bg-muted/40 p-4">
          <p className="text-2xl font-semibold">{priceCents !== null ? formatPriceCents(priceCents) : "—"}</p>
          <Button className="mt-4 w-full" size="lg" disabled={priceCents === null} onClick={handleAddToCart}>
            Adicionar ao carrinho
          </Button>
          <Button type="button" variant="outline" className="mt-2 w-full" onClick={handleShare}>
            <Share2 className="size-4" />
            Compartilhar essa cor
          </Button>
        </div>
      </div>
    </div>
  );
}
