"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { updateRegionSettings, type RegionSettingsInput } from "@/features/catalog/actions";

import { MeshUploadForm } from "./mesh-upload-form";
import { ProductViewer3D, type ViewerPart } from "./product-viewer-3d";

// Só pra diferenciar visualmente as regiões no admin antes de qualquer
// material padrão ser escolhido — não tem relação com materiais reais.
const FALLBACK_PALETTE = ["#ef4444", "#3b82f6", "#22c55e", "#eab308", "#a855f7", "#ec4899", "#14b8a6", "#f97316"];
const NO_DEFAULT_VALUE = "__none__";

interface RegionRow {
  id: string;
  label: string;
  paintState: number;
  enabled: boolean;
  defaultFilamentOptionId: string | null;
}

interface MaterialOption {
  id: string;
  name: string;
  hexColor: string | null;
}

export function PartRegionsPanel({
  productId,
  partId,
  meshUrl,
  hasMesh,
  regions,
  materialOptions,
}: {
  productId: string;
  partId: string;
  meshUrl: string | null;
  hasMesh: boolean;
  regions: RegionRow[];
  materialOptions: MaterialOption[];
}) {
  const [highlighted, setHighlighted] = useState<number | null>(null);

  const previewPart: ViewerPart = {
    id: partId,
    meshUrl,
    color: "#a1a1aa",
    regions: regions.map((region, index) => {
      const material = materialOptions.find((m) => m.id === region.defaultFilamentOptionId);
      const baseColor = material?.hexColor ?? FALLBACK_PALETTE[index % FALLBACK_PALETTE.length];
      const isDimmed = highlighted !== null && highlighted !== region.paintState;
      return { paintState: region.paintState, color: isDimmed ? "#d4d4d8" : baseColor };
    }),
  };

  return (
    <div>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start">
        <div className="w-full max-w-40 shrink-0">
          <ProductViewer3D parts={[previewPart]} interactive={false} />
          {meshUrl ? (
            <a
              href={meshUrl}
              target="_blank"
              rel="noreferrer"
              className="mt-1.5 block break-all text-center text-xs text-muted-foreground underline-offset-2 hover:underline"
            >
              Ver arquivo enviado
            </a>
          ) : null}
        </div>
        <div className="flex-1">
          <h3 className="text-xs font-medium tracking-wide text-muted-foreground uppercase">Arquivo 3D</h3>
          <div className="mt-2">
            <MeshUploadForm productId={productId} partId={partId} hasMesh={hasMesh} />
          </div>
        </div>
      </div>

      <div className="mt-4 border-t pt-3">
        <h3 className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
          Regiões pintadas (.3mf multi-cor)
        </h3>
        <p className="mt-1 text-sm text-muted-foreground">
          Detectadas automaticamente no arquivo enviado — cada uma ganhou uma cor diferente só pra identificação (sem
          relação com o material de verdade ainda). Clique em &ldquo;Destacar&rdquo; pra ver qual pedaço do modelo é
          qual antes de renomear. Desmarque &ldquo;Visível pro cliente&rdquo; se uma região veio errada (ruído da
          detecção) — ela continua colorida com o material padrão escolhido, só não aparece pra configurar na loja.
        </p>
        <div className="mt-2 flex flex-col gap-2">
          {regions.map((region) => (
            <RegionRow
              key={region.id}
              productId={productId}
              region={region}
              materialOptions={materialOptions}
              isHighlighted={highlighted === region.paintState}
              onToggleHighlight={() =>
                setHighlighted((prev) => (prev === region.paintState ? null : region.paintState))
              }
            />
          ))}
        </div>
      </div>
    </div>
  );
}

function RegionRow({
  productId,
  region,
  materialOptions,
  isHighlighted,
  onToggleHighlight,
}: {
  productId: string;
  region: RegionRow;
  materialOptions: MaterialOption[];
  isHighlighted: boolean;
  onToggleHighlight: () => void;
}) {
  const [label, setLabel] = useState(region.label);
  const [enabled, setEnabled] = useState(region.enabled);
  const [defaultId, setDefaultId] = useState(region.defaultFilamentOptionId ?? NO_DEFAULT_VALUE);
  const [isPending, startTransition] = useTransition();

  function handleSave() {
    const input: RegionSettingsInput = {
      label,
      enabled,
      defaultFilamentOptionId: defaultId === NO_DEFAULT_VALUE ? null : defaultId,
    };

    startTransition(async () => {
      const result = await updateRegionSettings(productId, region.id, input);
      if (result.error) {
        toast.error(result.error);
        return;
      }
      toast.success("Região atualizada.");
    });
  }

  return (
    <div
      className={`flex flex-wrap items-center gap-2 rounded-lg p-2 transition-colors ${
        isHighlighted ? "bg-primary/10 ring-1 ring-primary" : ""
      }`}
    >
      <Button type="button" size="sm" variant="outline" onClick={onToggleHighlight} className="h-8">
        {isHighlighted ? "Ocultar destaque" : "Destacar"}
      </Button>
      <Input value={label} onChange={(e) => setLabel(e.target.value)} className="h-8 max-w-40 text-sm" />
      <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <input
          type="checkbox"
          checked={enabled}
          onChange={(e) => setEnabled(e.target.checked)}
          className="size-3.5"
        />
        Visível pro cliente
      </label>
      <Select value={defaultId} onValueChange={(value) => setDefaultId(value ?? NO_DEFAULT_VALUE)}>
        <SelectTrigger className="h-8 w-40 text-xs">
          <SelectValue placeholder="Padrão da parte" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={NO_DEFAULT_VALUE}>Usa o padrão da parte</SelectItem>
          {materialOptions.map((material) => (
            <SelectItem key={material.id} value={material.id}>
              {material.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Button type="button" size="sm" disabled={isPending} onClick={handleSave} className="h-8">
        {isPending ? "Salvando..." : "Salvar"}
      </Button>
    </div>
  );
}
