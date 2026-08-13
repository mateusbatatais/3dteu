import { ConfirmDeleteButton } from "@/components/confirm-delete-button";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { addProductPart, deleteProductPart, setPartMaterials } from "@/features/catalog/actions";
import type { MaterialPrintProcess } from "@/features/catalog/types";

import { MeshUploadForm } from "./mesh-upload-form";
import { PartRegionsPanel } from "./part-regions-panel";
import { PartThumbnailCapture } from "./part-thumbnail-capture";
import { PartWeightEditor } from "./part-weight-editor";
import { PriceSuggestionCalculator } from "./price-suggestion-calculator";
import type { ViewerPart } from "./product-viewer-3d";
import { ProductViewerAngleControl } from "./product-viewer-angle-control";

interface RegionRow {
  id: string;
  label: string;
  paintState: number;
  enabled: boolean;
  defaultMaterialColorId: string | null;
}

interface PartRow {
  id: string;
  name: string;
  meshFileUrl: string | null;
  materialOptions: Array<{ materialColorId: string }>;
  regions: RegionRow[];
  defaultMaterialColorId: string | null;
  weightGrams: number | null;
}

interface MaterialColorOption {
  id: string;
  name: string;
  hexColor: string | null;
  hexColorSecondary: string | null;
  opacity?: number;
  materialName: string;
  typeName: string;
  printProcess?: MaterialPrintProcess;
}

interface MaterialTypeOption {
  id: string;
  name: string;
  materialName: string;
  printProcess: MaterialPrintProcess;
  pricePerKgCents: number;
  printSpeedValue: string;
  postProcessingFeeCents: number;
}

const SECTION_LABEL_CLASS = "text-xs font-medium tracking-wide text-muted-foreground uppercase";

interface PricingSettings {
  energyPriceCentsPerKwh: number | null;
  printerPowerWatts: number | null;
  profitMarginPercent: number | null;
  fixedFeeCents: number | null;
}

export function ProductPartsManager({
  productId,
  parts,
  allColors,
  materialTypes,
  productWeightGrams,
  productHeightCm,
  pricingSettings,
  viewerCameraPosition,
}: {
  productId: string;
  parts: PartRow[];
  allColors: MaterialColorOption[];
  materialTypes: MaterialTypeOption[];
  productWeightGrams: number | null;
  productHeightCm: number | null;
  pricingSettings: PricingSettings;
  viewerCameraPosition: { x: number; y: number; z: number } | null;
}) {
  // Montagem inteira (todas as peças com a cor padrão de cada uma) — usada
  // só pelo controle de ângulo abaixo, pra mostrar exatamente o que o
  // cliente vê na página do produto (diferente do PartThumbnailCapture,
  // que mostra uma peça de cada vez pra gerar fotos de catálogo).
  const viewerParts: ViewerPart[] = parts.map((part) => {
    const defaultColor = allColors.find((c) => c.id === part.defaultMaterialColorId);
    if (part.regions.length > 0) {
      return {
        id: part.id,
        meshUrl: part.meshFileUrl,
        color: "#a1a1aa",
        regions: part.regions.map((region) => ({
          paintState: region.paintState,
          color: allColors.find((c) => c.id === region.defaultMaterialColorId)?.hexColor ?? "#a1a1aa",
        })),
      };
    }
    return {
      id: part.id,
      meshUrl: part.meshFileUrl,
      color: defaultColor?.hexColor ?? "#a1a1aa",
      colorSecondary: defaultColor?.hexColorSecondary ?? null,
      printProcess: defaultColor?.printProcess,
      opacity: defaultColor?.opacity,
    };
  });

  return (
    <div>
      <h2 className="text-lg font-medium">Partes, materiais e arquivo 3D</h2>
      <p className="mt-1 text-sm text-muted-foreground">
        Um produto de peça única tem uma parte só. Produtos multi-cor têm uma parte por peça impressa
        separadamente — cada uma com seu próprio arquivo .stl.
      </p>

      {parts.length > 0 ? (
        <div className="mt-4 max-w-2xl rounded-xl bg-card p-4 ring-1 ring-foreground/10">
          <h3 className={SECTION_LABEL_CLASS}>Ângulo inicial do visualizador</h3>
          <p className="mt-1 text-xs text-muted-foreground">
            Como o produto abre na página da loja — gire até achar um enquadramento bom e salve.
          </p>
          <div className="mt-2">
            <ProductViewerAngleControl
              productId={productId}
              parts={viewerParts}
              initialCameraPosition={viewerCameraPosition}
            />
          </div>
        </div>
      ) : null}

      <div className="mt-3 flex flex-col gap-4">
        {parts.map((part) => {
          const selectedIds = new Set(part.materialOptions.map((m) => m.materialColorId));
          const defaultColor = allColors.find((c) => c.id === part.defaultMaterialColorId);
          return (
            <div key={part.id} className="max-w-2xl rounded-xl bg-card p-4 ring-1 ring-foreground/10">
              <div className="flex items-center justify-between">
                <span className="font-medium">{part.name}</span>
                <ConfirmDeleteButton
                  action={deleteProductPart.bind(null, productId, part.id)}
                  label="Excluir parte"
                  description={`Excluir a parte "${part.name}"? O arquivo 3D e os materiais atribuídos a ela também somem.`}
                />
              </div>

              <div className="mt-1.5">
                <PartWeightEditor productId={productId} partId={part.id} weightGrams={part.weightGrams} />
              </div>

              {part.regions.length > 0 ? (
                <div className="mt-4">
                  <PartRegionsPanel
                    productId={productId}
                    partId={part.id}
                    meshUrl={part.meshFileUrl}
                    hasMesh={Boolean(part.meshFileUrl)}
                    regions={part.regions}
                    colorOptions={allColors.filter((c) => selectedIds.has(c.id))}
                  />
                </div>
              ) : (
                <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-start">
                  <PartThumbnailCapture
                    productId={productId}
                    meshUrl={part.meshFileUrl}
                    part={{
                      id: part.id,
                      meshUrl: part.meshFileUrl,
                      color: defaultColor?.hexColor ?? "#a1a1aa",
                      colorSecondary: defaultColor?.hexColorSecondary ?? null,
                      printProcess: defaultColor?.printProcess,
                      opacity: defaultColor?.opacity,
                    }}
                  />
                  <div className="flex-1">
                    <h3 className={SECTION_LABEL_CLASS}>Arquivo 3D</h3>
                    <div className="mt-2">
                      <MeshUploadForm productId={productId} partId={part.id} hasMesh={Boolean(part.meshFileUrl)} />
                    </div>
                  </div>
                </div>
              )}

              <div className="mt-4 border-t pt-3">
                <h3 className={SECTION_LABEL_CLASS}>Cores aceitas</h3>
                {allColors.length === 0 ? (
                  <p className="mt-2 text-sm text-muted-foreground">
                    Cadastre materiais em /admin/materiais antes de atribuí-los a uma parte.
                  </p>
                ) : (
                  <form action={setPartMaterials.bind(null, productId, part.id)} className="mt-2">
                    <p className="text-xs text-muted-foreground">
                      Marque quais cores o cliente pode escolher e qual vem selecionada por padrão ao abrir a página
                      do produto.
                    </p>
                    <div className="mt-2 flex flex-col gap-2">
                      {allColors.map((color, index) => {
                        // Peça nova (nenhuma cor salva ainda) já nasce com todas as
                        // cores disponíveis marcadas — evita publicar sem nenhuma cor pra
                        // escolher só porque o admin esqueceu de marcar. Uma vez que já
                        // existe uma seleção salva, ela é a fonte da verdade de novo.
                        const isChecked = selectedIds.size === 0 ? true : selectedIds.has(color.id);
                        const isDefault =
                          part.defaultMaterialColorId === null ? index === 0 : part.defaultMaterialColorId === color.id;
                        return (
                          <div key={color.id} className="flex items-center gap-3 text-sm">
                            <label className="flex flex-1 items-center gap-1.5">
                              <input
                                type="checkbox"
                                name="materialColorId"
                                value={color.id}
                                defaultChecked={isChecked}
                                className="size-4"
                              />
                              <span
                                className="inline-block size-3.5 shrink-0 rounded-full border"
                                style={{
                                  background: color.hexColorSecondary
                                    ? `linear-gradient(135deg, ${color.hexColor} 50%, ${color.hexColorSecondary} 50%)`
                                    : (color.hexColor ?? "#a1a1aa"),
                                }}
                              />
                              {color.materialName} · {color.typeName} · {color.name}
                            </label>
                            <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
                              <input
                                type="radio"
                                name="defaultMaterialColorId"
                                value={color.id}
                                defaultChecked={isDefault}
                                className="size-3.5"
                              />
                              Padrão
                            </label>
                          </div>
                        );
                      })}
                    </div>
                    <Button type="submit" size="sm" variant="outline" className="mt-3">
                      Salvar materiais desta parte
                    </Button>
                  </form>
                )}
              </div>
            </div>
          );
        })}
      </div>

      <form
        action={addProductPart.bind(null, productId)}
        className="mt-4 flex max-w-2xl items-end gap-3 rounded-xl bg-card p-4 ring-1 ring-foreground/10"
      >
        <div className="flex flex-1 flex-col gap-1.5">
          <Label htmlFor="partName">Nova parte</Label>
          <Input id="partName" name="name" required placeholder="corpo" />
        </div>
        <Button type="submit">Adicionar parte</Button>
      </form>

      <div className="mt-4 max-w-2xl rounded-xl bg-card p-4 ring-1 ring-foreground/10">
        <h3 className={SECTION_LABEL_CLASS}>Calculadora de preço</h3>
        <p className="mt-1 text-xs text-muted-foreground">
          Peso total do produto (soma das peças, usado na cotação de frete):{" "}
          {productWeightGrams !== null ? `~${productWeightGrams}g` : "ainda não medido"}
        </p>
        <PriceSuggestionCalculator
          productId={productId}
          weightGrams={productWeightGrams}
          heightCm={productHeightCm}
          materialTypes={materialTypes}
          pricingSettings={pricingSettings}
        />
      </div>
    </div>
  );
}
