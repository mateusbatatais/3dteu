"use client";

import { useMemo, useState } from "react";

import type { MaterialPrintProcess } from "@/features/catalog/types";

interface MaterialTypeOption {
  id: string;
  name: string;
  materialName: string;
  printProcess: MaterialPrintProcess;
}

interface MaterialColorOption {
  id: string;
  name: string;
  hexColor: string | null;
  hexColorSecondary: string | null;
  opacity?: number;
  typeId: string;
  available: boolean;
}

function swatchBackground(color: MaterialColorOption): string {
  return color.hexColorSecondary
    ? `linear-gradient(135deg, ${color.hexColor} 50%, ${color.hexColorSecondary} 50%)`
    : (color.hexColor ?? "#a1a1aa");
}

/**
 * A peça não cura mais cor por cor — marca quais TIPOS de material ela
 * aceita (checkbox por Material·Tipo), e as cores oferecidas pro cliente
 * viram todas as `available` desses Tipos (geral do catálogo, não uma
 * seleção por produto). A única curadoria que sobra é a cor PADRÃO, num
 * select cujas opções são só as cores disponíveis dos Tipos marcados —
 * recalculadas ao vivo conforme o admin liga/desliga um Tipo, pra nunca
 * deixar escolher como padrão uma cor que a peça não vai nem oferecer.
 */
export function PartMaterialTypePicker({
  materialTypes,
  allColors,
  selectedTypeIds,
  defaultMaterialColorId,
}: {
  materialTypes: MaterialTypeOption[];
  allColors: MaterialColorOption[];
  selectedTypeIds: Set<string>;
  defaultMaterialColorId: string | null;
}) {
  const [checkedTypeIds, setCheckedTypeIds] = useState<Set<string>>(selectedTypeIds);
  const [explicitDefaultId, setExplicitDefaultId] = useState<string | null>(null);

  const groups = useMemo(() => {
    const map = new Map<string, MaterialTypeOption[]>();
    for (const type of materialTypes) {
      const list = map.get(type.materialName);
      if (list) list.push(type);
      else map.set(type.materialName, [type]);
    }
    return [...map.entries()];
  }, [materialTypes]);

  const availableColorsForDefault = useMemo(
    () => allColors.filter((c) => checkedTypeIds.has(c.typeId) && c.available),
    [allColors, checkedTypeIds],
  );

  const resolvedDefaultId =
    (explicitDefaultId && availableColorsForDefault.some((c) => c.id === explicitDefaultId) ? explicitDefaultId : null) ??
    (defaultMaterialColorId && availableColorsForDefault.some((c) => c.id === defaultMaterialColorId) ? defaultMaterialColorId : null) ??
    (availableColorsForDefault[0]?.id ?? "");

  function toggleType(typeId: string) {
    setCheckedTypeIds((prev) => {
      const next = new Set(prev);
      if (next.has(typeId)) next.delete(typeId);
      else next.add(typeId);
      return next;
    });
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-2">
        {groups.map(([materialName, types]) => (
          <div key={materialName}>
            <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">{materialName}</p>
            <div className="mt-1 flex flex-col gap-1">
              {types.map((type) => (
                <label key={type.id} className="flex items-center gap-1.5 text-sm">
                  <input
                    type="checkbox"
                    name="materialTypeId"
                    value={type.id}
                    checked={checkedTypeIds.has(type.id)}
                    onChange={() => toggleType(type.id)}
                    className="size-4"
                  />
                  {type.name}
                </label>
              ))}
            </div>
          </div>
        ))}
      </div>

      <div className="flex flex-col gap-1.5">
        <label className="text-xs font-medium tracking-wide text-muted-foreground uppercase">Cor padrão</label>
        {availableColorsForDefault.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Marque pelo menos um tipo com cor disponível em estoque pra escolher um padrão.
          </p>
        ) : (
          <select
            name="defaultMaterialColorId"
            value={resolvedDefaultId}
            onChange={(e) => setExplicitDefaultId(e.target.value)}
            className="w-56 rounded-md border border-input bg-transparent px-3 py-1.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
          >
            {availableColorsForDefault.map((color) => (
              <option key={color.id} value={color.id}>
                {color.name}
              </option>
            ))}
          </select>
        )}
        {(() => {
          const resolvedColor = availableColorsForDefault.find((c) => c.id === resolvedDefaultId);
          if (!resolvedColor) return null;
          return (
            <span
              className="inline-block size-4 rounded-full border"
              style={{ background: swatchBackground(resolvedColor), opacity: resolvedColor.opacity }}
            />
          );
        })()}
      </div>
    </div>
  );
}
