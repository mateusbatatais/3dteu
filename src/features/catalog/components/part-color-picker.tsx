"use client";

import { useMemo, useState } from "react";

import type { MaterialPrintProcess } from "@/features/catalog/types";

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

function swatchBackground(color: MaterialColorOption): string {
  return color.hexColorSecondary
    ? `linear-gradient(135deg, ${color.hexColor} 50%, ${color.hexColorSecondary} 50%)`
    : (color.hexColor ?? "#a1a1aa");
}

/**
 * Lista de cores agrupada por Material · Tipo, com busca e grupos que
 * recolhem/expandem — o catálogo cresceu (60+ cores reais depois da
 * rodada de fornecedores) e a lista plana antiga ficava enorme e difícil
 * de navegar. Visibilidade (grupo recolhido, cor fora da busca) é
 * controlada só por className — o checkbox/radio de cada cor NUNCA é
 * desmontado, só escondido via CSS, então marcar uma cor, buscar por
 * outra coisa e depois limpar a busca nunca perde a seleção já feita.
 */
export function PartColorPicker({
  colors,
  selectedIds,
  defaultMaterialColorId,
}: {
  colors: MaterialColorOption[];
  selectedIds: Set<string>;
  defaultMaterialColorId: string | null;
}) {
  const [search, setSearch] = useState("");

  const groups = useMemo(() => {
    const map = new Map<string, MaterialColorOption[]>();
    for (const color of colors) {
      const key = `${color.materialName} · ${color.typeName}`;
      const list = map.get(key);
      if (list) list.push(color);
      else map.set(key, [color]);
    }
    return [...map.entries()];
  }, [colors]);

  // Peça nova (nenhuma cor salva ainda) nasce com todas marcadas — grupo
  // sem nenhuma cor "selecionada" nesse caso não existe, todos abrem.
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(() => {
    const collapsed = new Set<string>();
    for (const [key, groupColors] of groups) {
      const hasSelection = selectedIds.size === 0 || groupColors.some((c) => selectedIds.has(c.id));
      if (!hasSelection) collapsed.add(key);
    }
    return collapsed;
  });

  const searchTerm = search.trim().toLowerCase();
  const isSearching = searchTerm.length > 0;

  function matchesSearch(color: MaterialColorOption): boolean {
    if (!isSearching) return true;
    return `${color.materialName} ${color.typeName} ${color.name}`.toLowerCase().includes(searchTerm);
  }

  function toggleGroup(key: string) {
    setCollapsedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  return (
    <div>
      <input
        type="text"
        value={search}
        onChange={(event) => setSearch(event.target.value)}
        placeholder="Buscar cor (ex.: azul, PLA, resina)..."
        className="w-full rounded-md border border-input bg-transparent px-3 py-1.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
      />

      <div className="mt-2 flex max-h-[420px] flex-col gap-1.5 overflow-y-auto pr-1">
        {groups.map(([key, groupColors]) => {
          const visibleCount = groupColors.filter(matchesSearch).length;
          const isOpen = isSearching ? visibleCount > 0 : !collapsedGroups.has(key);
          const selectedInGroup = groupColors.filter((c) => selectedIds.size === 0 || selectedIds.has(c.id)).length;

          return (
            <div key={key} className={`rounded-lg border border-border/60 ${isSearching && visibleCount === 0 ? "hidden" : ""}`}>
              <button
                type="button"
                onClick={() => toggleGroup(key)}
                className="flex w-full items-center justify-between gap-2 rounded-lg px-3 py-1.5 text-left text-xs font-medium tracking-wide text-muted-foreground uppercase hover:bg-muted/40"
              >
                <span>{key}</span>
                <span className="shrink-0 font-normal normal-case text-muted-foreground/80">
                  {selectedInGroup}/{groupColors.length} · {isOpen ? "▲" : "▼"}
                </span>
              </button>

              <div className={isOpen ? "flex flex-col gap-2 px-3 pb-2" : "hidden"}>
                {groupColors.map((color) => {
                  const isChecked = selectedIds.size === 0 ? true : selectedIds.has(color.id);
                  // Sem padrão salvo ainda, cai pra primeira cor da lista
                  // INTEIRA (não a primeira do grupo) — mesmo comportamento
                  // de antes do agrupamento.
                  const isDefault = defaultMaterialColorId === null ? color.id === colors[0]?.id : defaultMaterialColorId === color.id;

                  return (
                    <div
                      key={color.id}
                      className={`flex items-center gap-3 text-sm ${isSearching && !matchesSearch(color) ? "hidden" : ""}`}
                    >
                      <label className="flex flex-1 items-center gap-1.5">
                        <input type="checkbox" name="materialColorId" value={color.id} defaultChecked={isChecked} className="size-4" />
                        <span
                          className="inline-block size-3.5 shrink-0 rounded-full border"
                          style={{ background: swatchBackground(color), opacity: color.opacity }}
                        />
                        {color.name}
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
            </div>
          );
        })}
      </div>
    </div>
  );
}
