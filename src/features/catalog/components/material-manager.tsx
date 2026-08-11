"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import {
  checkMaterialColorDeletionImpact,
  checkMaterialDeletionImpact,
  checkMaterialTypeDeletionImpact,
  createMaterial,
  createMaterialColor,
  createMaterialType,
  deleteMaterial,
  deleteMaterialColor,
  deleteMaterialType,
  updateMaterial,
  updateMaterialColor,
  updateMaterialType,
  type MaterialActionResult,
  type MaterialColorInput,
  type MaterialInput,
  type MaterialTypeInput,
} from "@/features/catalog/material-actions";

import { ConfirmDeleteMaterialButton } from "./confirm-delete-material-button";
import { formatPriceCents } from "@/lib/format";
import type { MaterialPrintProcess } from "@/features/catalog/types";

const PRINT_PROCESS_LABELS: Record<MaterialPrintProcess, string> = {
  fdm: "FDM (filamento)",
  resin: "Resina",
};

function speedUnitLabel(printProcess: MaterialPrintProcess): string {
  return printProcess === "resin" ? "mm de altura / hora" : "g / hora";
}

interface ColorRow {
  id: string;
  name: string;
  hexColor: string | null;
  hexColorSecondary: string | null;
  /** Numeric do Postgres chega como string via Drizzle. */
  opacity: string;
}

interface TypeRow {
  id: string;
  name: string;
  pricePerKgCents: number;
  printSpeedValue: string;
  description: string | null;
  colors: ColorRow[];
}

interface MaterialRow {
  id: string;
  name: string;
  printProcess: MaterialPrintProcess;
  allowsDualColor: boolean;
  postProcessingFeeCents: number;
  dualColorFeeCents: number;
  types: TypeRow[];
}

async function runAction(action: () => Promise<MaterialActionResult>, successMessage: string) {
  const result = await action();
  if (result.error) {
    toast.error(result.error);
    return false;
  }
  toast.success(successMessage);
  return true;
}

export function MaterialManager({ materials }: { materials: MaterialRow[] }) {
  return (
    <div className="flex flex-col gap-6">
      {materials.map((material) => (
        <MaterialCard key={material.id} material={material} />
      ))}
      <NewMaterialForm />
    </div>
  );
}

function MaterialCard({ material }: { material: MaterialRow }) {
  const [isEditing, setIsEditing] = useState(false);

  return (
    <div className="rounded-xl bg-card p-4 ring-1 ring-foreground/10">
      {isEditing ? (
        <MaterialForm
          initialValues={{
            name: material.name,
            printProcess: material.printProcess,
            allowsDualColor: material.allowsDualColor,
            postProcessingFeeReais: material.postProcessingFeeCents / 100,
            dualColorFeeReais: material.dualColorFeeCents / 100,
          }}
          onSubmit={(input) => updateMaterial(material.id, input)}
          onDone={() => setIsEditing(false)}
        />
      ) : (
        <div className="flex items-start justify-between">
          <div>
            <h3 className="text-lg font-semibold">{material.name}</h3>
            <p className="text-sm text-muted-foreground">
              {PRINT_PROCESS_LABELS[material.printProcess]} · {material.allowsDualColor ? "Permite dual-color" : "Só cor única"}
              {material.postProcessingFeeCents > 0 ? (
                <> · Pós-processamento: {formatPriceCents(material.postProcessingFeeCents)}/peça</>
              ) : null}
              {material.allowsDualColor && material.dualColorFeeCents > 0 ? (
                <> · Taxa dual-color: {formatPriceCents(material.dualColorFeeCents)}/peça</>
              ) : null}
            </p>
          </div>
          <div className="flex gap-2">
            <Button type="button" size="sm" variant="outline" onClick={() => setIsEditing(true)}>
              Editar
            </Button>
            <ConfirmDeleteMaterialButton
              label="Excluir material"
              itemDescription={`"${material.name}" (todos os tipos e cores dele somem junto)`}
              checkImpact={() => checkMaterialDeletionImpact(material.id)}
              onConfirm={(replacements) => deleteMaterial(material.id, replacements)}
            />
          </div>
        </div>
      )}

      <div className="mt-4 flex flex-col gap-3 border-t pt-3">
        {material.types.map((type) => (
          <MaterialTypeCard key={type.id} material={material} type={type} />
        ))}
        <NewMaterialTypeForm materialId={material.id} printProcess={material.printProcess} />
      </div>
    </div>
  );
}

function MaterialTypeCard({ material, type }: { material: MaterialRow; type: TypeRow }) {
  const [isEditing, setIsEditing] = useState(false);

  return (
    <div className="rounded-lg bg-muted/30 p-3 ring-1 ring-foreground/5">
      {isEditing ? (
        <MaterialTypeForm
          printProcess={material.printProcess}
          initialValues={{
            name: type.name,
            pricePerKgReais: type.pricePerKgCents / 100,
            printSpeedValue: Number(type.printSpeedValue),
            description: type.description ?? "",
          }}
          onSubmit={(input) => updateMaterialType(type.id, input)}
          onDone={() => setIsEditing(false)}
        />
      ) : (
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="font-medium">{type.name}</p>
            <p className="text-xs text-muted-foreground">
              {formatPriceCents(type.pricePerKgCents)}/kg · ~{type.printSpeedValue} {speedUnitLabel(material.printProcess)}
            </p>
            {type.description ? <p className="mt-1 text-xs text-muted-foreground">{type.description}</p> : null}
          </div>
          <div className="flex shrink-0 gap-2">
            <Button type="button" size="sm" variant="outline" onClick={() => setIsEditing(true)}>
              Editar
            </Button>
            <ConfirmDeleteMaterialButton
              label="Excluir tipo"
              itemDescription={`o tipo "${type.name}" (as cores dele somem junto)`}
              checkImpact={() => checkMaterialTypeDeletionImpact(type.id)}
              onConfirm={(replacements) => deleteMaterialType(type.id, replacements)}
            />
          </div>
        </div>
      )}

      <div className="mt-3 flex flex-col gap-2 border-t pt-2">
        {type.colors.map((color) => (
          <MaterialColorRow key={color.id} materialTypeId={type.id} allowsDualColor={material.allowsDualColor} color={color} />
        ))}
        <NewMaterialColorForm materialTypeId={type.id} allowsDualColor={material.allowsDualColor} />
      </div>
    </div>
  );
}

function MaterialColorRow({
  materialTypeId,
  allowsDualColor,
  color,
}: {
  materialTypeId: string;
  allowsDualColor: boolean;
  color: ColorRow;
}) {
  const [isEditing, setIsEditing] = useState(false);

  if (isEditing) {
    return (
      <MaterialColorForm
        allowsDualColor={allowsDualColor}
        initialValues={{
          name: color.name,
          hexColor: color.hexColor ?? "#2563eb",
          // Preserva null de verdade (não substitui por um fallback de cor)
          // — é o que diz pro form se essa cor já é dual-color ou não.
          hexColorSecondary: color.hexColorSecondary,
          opacity: Number(color.opacity),
        }}
        onSubmit={(input) => updateMaterialColor(color.id, materialTypeId, input)}
        onDone={() => setIsEditing(false)}
      />
    );
  }

  const opacity = Number(color.opacity);

  return (
    <div className="flex items-center gap-3 text-sm">
      <span
        className="inline-block size-5 shrink-0 rounded-full border"
        style={{
          background: color.hexColorSecondary
            ? `linear-gradient(135deg, ${color.hexColor} 50%, ${color.hexColorSecondary} 50%)`
            : (color.hexColor ?? "#a1a1aa"),
          opacity,
        }}
      />
      <span className="flex-1">
        {color.name}
        {opacity < 1 ? (
          <span className="ml-1 text-xs text-muted-foreground">(transparência {Math.round((1 - opacity) * 100)}%)</span>
        ) : null}
      </span>
      <Button type="button" size="sm" variant="outline" onClick={() => setIsEditing(true)}>
        Editar
      </Button>
      <ConfirmDeleteMaterialButton
        label="Excluir cor"
        itemDescription={`a cor "${color.name}"`}
        checkImpact={() => checkMaterialColorDeletionImpact(color.id)}
        onConfirm={(replacements) => deleteMaterialColor(color.id, replacements)}
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Formulários de criação (cada um reseta pro estado vazio depois de salvar)
// ---------------------------------------------------------------------------

function MaterialForm({
  initialValues,
  onSubmit,
  onDone,
}: {
  initialValues: MaterialInput;
  onSubmit: (input: MaterialInput) => Promise<MaterialActionResult>;
  onDone: () => void;
}) {
  const [values, setValues] = useState<MaterialInput>(initialValues);
  const [isPending, startTransition] = useTransition();

  function update<K extends keyof MaterialInput>(key: K, value: MaterialInput[K]) {
    setValues((prev) => ({ ...prev, [key]: value }));
  }

  function handleSubmit() {
    startTransition(async () => {
      const ok = await runAction(() => onSubmit(values), "Material salvo.");
      if (ok) onDone();
    });
  }

  return (
    <div className="flex flex-wrap items-end gap-3">
      <div className="flex flex-col gap-1.5">
        <Label>Nome</Label>
        <Input value={values.name} onChange={(e) => update("name", e.target.value)} placeholder="Resina" className="w-40" />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label>Processo</Label>
        <Select value={values.printProcess} onValueChange={(value) => update("printProcess", value as MaterialPrintProcess)}>
          <SelectTrigger className="w-44">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {Object.entries(PRINT_PROCESS_LABELS).map(([value, label]) => (
              <SelectItem key={value} value={value}>
                {label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <label className="flex items-center gap-1.5 pb-2 text-sm">
        <input
          type="checkbox"
          checked={values.allowsDualColor}
          onChange={(e) => update("allowsDualColor", e.target.checked)}
          className="size-4"
        />
        Permite dual-color
      </label>
      <div className="flex flex-col gap-1.5">
        <Label>Pós-processamento (R$/peça)</Label>
        <Input
          type="number"
          step="0.01"
          min="0"
          value={values.postProcessingFeeReais}
          onChange={(e) => update("postProcessingFeeReais", Number(e.target.value))}
          className="w-32"
        />
      </div>
      {values.allowsDualColor ? (
        <div className="flex flex-col gap-1.5">
          <Label>Taxa dual-color (R$/peça)</Label>
          <Input
            type="number"
            step="0.01"
            min="0"
            value={values.dualColorFeeReais}
            onChange={(e) => update("dualColorFeeReais", Number(e.target.value))}
            className="w-32"
          />
        </div>
      ) : null}
      <div className="flex gap-2">
        <Button type="button" disabled={isPending || !values.name.trim()} onClick={handleSubmit}>
          {isPending ? "Salvando..." : "Salvar"}
        </Button>
        <Button type="button" variant="outline" disabled={isPending} onClick={onDone}>
          Cancelar
        </Button>
      </div>
    </div>
  );
}

const EMPTY_MATERIAL: MaterialInput = {
  name: "",
  printProcess: "fdm",
  allowsDualColor: false,
  postProcessingFeeReais: 0,
  dualColorFeeReais: 0,
};

function NewMaterialForm() {
  // key força remount (e volta aos valores vazios) depois de criar com
  // sucesso — MaterialForm guarda seu próprio estado internamente e só lê
  // `initialValues` uma vez, no mount, então mudar a prop sozinha não
  // limparia o formulário pro próximo cadastro.
  const [resetKey, setResetKey] = useState(0);

  return (
    <div className="rounded-xl border-2 border-dashed border-border p-4">
      <h3 className="mb-3 text-sm font-medium tracking-wide text-muted-foreground uppercase">Novo material</h3>
      <MaterialForm
        key={resetKey}
        initialValues={EMPTY_MATERIAL}
        onSubmit={createMaterial}
        onDone={() => setResetKey((k) => k + 1)}
      />
    </div>
  );
}

function MaterialTypeForm({
  printProcess,
  initialValues,
  onSubmit,
  onDone,
}: {
  printProcess: MaterialPrintProcess;
  initialValues: MaterialTypeInput;
  onSubmit: (input: MaterialTypeInput) => Promise<MaterialActionResult>;
  onDone: () => void;
}) {
  const [values, setValues] = useState<MaterialTypeInput>(initialValues);
  const [isPending, startTransition] = useTransition();

  function update<K extends keyof MaterialTypeInput>(key: K, value: MaterialTypeInput[K]) {
    setValues((prev) => ({ ...prev, [key]: value }));
  }

  function handleSubmit() {
    startTransition(async () => {
      const ok = await runAction(() => onSubmit(values), "Tipo salvo.");
      if (ok) onDone();
    });
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-end gap-3">
        <div className="flex flex-col gap-1.5">
          <Label>Nome</Label>
          <Input value={values.name} onChange={(e) => update("name", e.target.value)} placeholder="PLA" className="w-36" />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label>Preço/kg (R$)</Label>
          <Input
            type="number"
            step="0.01"
            min="0"
            value={values.pricePerKgReais}
            onChange={(e) => update("pricePerKgReais", Number(e.target.value))}
            className="w-28"
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label>Velocidade ({speedUnitLabel(printProcess)})</Label>
          <Input
            type="number"
            step="0.1"
            min="0"
            value={values.printSpeedValue}
            onChange={(e) => update("printSpeedValue", Number(e.target.value))}
            className="w-32"
          />
        </div>
        <div className="flex gap-2">
          <Button type="button" size="sm" disabled={isPending || !values.name.trim()} onClick={handleSubmit}>
            {isPending ? "Salvando..." : "Salvar"}
          </Button>
          <Button type="button" size="sm" variant="outline" disabled={isPending} onClick={onDone}>
            Cancelar
          </Button>
        </div>
      </div>
      <div className="flex flex-col gap-1.5">
        <Label>Descrição (opcional — explica pro cliente pra que serve)</Label>
        <Textarea
          rows={2}
          value={values.description}
          onChange={(e) => update("description", e.target.value)}
          placeholder="Translúcida, ótima pra decoração; mais frágil que a Resistente."
          className="max-w-xl"
        />
      </div>
    </div>
  );
}

function NewMaterialTypeForm({ materialId, printProcess }: { materialId: string; printProcess: MaterialPrintProcess }) {
  const EMPTY: MaterialTypeInput = { name: "", pricePerKgReais: 0, printSpeedValue: printProcess === "resin" ? 15 : 20, description: "" };
  const [values, setValues] = useState<MaterialTypeInput>(EMPTY);
  const [isOpen, setIsOpen] = useState(false);

  if (!isOpen) {
    return (
      <Button type="button" size="sm" variant="outline" className="self-start" onClick={() => setIsOpen(true)}>
        + Novo tipo
      </Button>
    );
  }

  return (
    <MaterialTypeForm
      printProcess={printProcess}
      initialValues={values}
      onSubmit={async (input) => {
        const result = await createMaterialType(materialId, input);
        if (!result.error) setValues(EMPTY);
        return result;
      }}
      onDone={() => setIsOpen(false)}
    />
  );
}

function MaterialColorForm({
  allowsDualColor,
  initialValues,
  onSubmit,
  onDone,
}: {
  allowsDualColor: boolean;
  initialValues: MaterialColorInput;
  onSubmit: (input: MaterialColorInput) => Promise<MaterialActionResult>;
  onDone: () => void;
}) {
  const [values, setValues] = useState<MaterialColorInput>(initialValues);
  // Independente de `allowsDualColor` (flag do Material inteiro — ex.:
  // "Plástico" permite dual-color): a maioria das cores cadastradas ainda é
  // sólida, só algumas são realmente dual-color (filamento dual custa mais).
  // Bug real: antes, `allowsDualColor` sozinho já bastava pra sempre mostrar
  // e enviar uma 2ª cor (um <input type="color"> nunca fica vazio), então
  // não dava pra cadastrar uma cor sólida sob um material que permite dual.
  // Esse checkbox decide por COR, não por material.
  const [isDualColor, setIsDualColor] = useState(Boolean(initialValues.hexColorSecondary));
  const [isPending, startTransition] = useTransition();

  function update<K extends keyof MaterialColorInput>(key: K, value: MaterialColorInput[K]) {
    setValues((prev) => ({ ...prev, [key]: value }));
  }

  function handleSubmit() {
    startTransition(async () => {
      const input: MaterialColorInput = {
        ...values,
        hexColorSecondary: isDualColor ? (values.hexColorSecondary ?? "#f97316") : null,
      };
      const ok = await runAction(() => onSubmit(input), "Cor salva.");
      if (ok) onDone();
    });
  }

  return (
    <div className="flex flex-wrap items-end gap-3">
      <div className="flex flex-col gap-1.5">
        <Label>Nome</Label>
        <Input value={values.name} onChange={(e) => update("name", e.target.value)} placeholder="Azul" className="w-36" />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label>Cor</Label>
        <Input type="color" value={values.hexColor} onChange={(e) => update("hexColor", e.target.value)} className="w-16 p-1" />
      </div>
      {allowsDualColor ? (
        <label className="flex items-center gap-1.5 pb-2 text-sm">
          <input
            type="checkbox"
            checked={isDualColor}
            onChange={(e) => setIsDualColor(e.target.checked)}
            className="size-4"
          />
          Cor dupla (dual-color)
        </label>
      ) : null}
      {allowsDualColor && isDualColor ? (
        <div className="flex flex-col gap-1.5">
          <Label>2ª cor</Label>
          <Input
            type="color"
            value={values.hexColorSecondary ?? "#f97316"}
            onChange={(e) => update("hexColorSecondary", e.target.value)}
            className="w-16 p-1"
          />
        </div>
      ) : null}
      <div className="flex flex-col gap-1.5">
        {/* Slider mostrado como "transparência" (0% = opaco de sempre, mais
        pra direita = mais transparente) pro admin pensar do jeito natural —
        o valor salvo continua sendo `opacity` (1 = opaco), que é o que o
        preview 3D e o CSS de opacidade esperam. */}
        <Label>Transparência ({Math.round((1 - values.opacity) * 100)}%)</Label>
        <input
          type="range"
          min={0}
          max={1}
          step={0.05}
          value={1 - values.opacity}
          onChange={(e) => update("opacity", 1 - Number(e.target.value))}
          className="w-32"
        />
      </div>
      <div className="flex gap-2">
        <Button type="button" size="sm" disabled={isPending || !values.name.trim()} onClick={handleSubmit}>
          {isPending ? "Salvando..." : "Salvar"}
        </Button>
        <Button type="button" size="sm" variant="outline" disabled={isPending} onClick={onDone}>
          Cancelar
        </Button>
      </div>
    </div>
  );
}

function NewMaterialColorForm({ materialTypeId, allowsDualColor }: { materialTypeId: string; allowsDualColor: boolean }) {
  const EMPTY: MaterialColorInput = { name: "", hexColor: "#2563eb", hexColorSecondary: null, opacity: 1 };
  const [values, setValues] = useState<MaterialColorInput>(EMPTY);
  const [isOpen, setIsOpen] = useState(false);

  if (!isOpen) {
    return (
      <Button type="button" size="sm" variant="outline" className="self-start" onClick={() => setIsOpen(true)}>
        + Nova cor
      </Button>
    );
  }

  return (
    <MaterialColorForm
      allowsDualColor={allowsDualColor}
      initialValues={values}
      onSubmit={async (input) => {
        const result = await createMaterialColor(materialTypeId, input);
        if (!result.error) setValues(EMPTY);
        return result;
      }}
      onDone={() => setIsOpen(false)}
    />
  );
}
