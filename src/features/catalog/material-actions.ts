"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";

import { db } from "@/server/db/client";
import { materialColors, materials, materialTypes, productPartRegions, productParts } from "@/server/db/schema";

import {
  getMaterialColorDeletionImpact,
  getMaterialColorIdsByMaterial,
  getMaterialColorIdsByType,
  type MaterialColorDeletionImpactRow,
} from "./queries";
import type { MaterialPrintProcess } from "./types";

export interface MaterialActionResult {
  error?: string;
}

/**
 * O que o admin decidiu pra cada parte/região que ficaria sem padrão —
 * calculado a partir de `MaterialColorDeletionImpactRow` (ver
 * ConfirmDeleteMaterialButton). `newDefaultColorId: null` = decisão
 * explícita de deixar sem padrão, não um esquecimento.
 */
export interface MaterialDeletionReplacement {
  kind: "part" | "region";
  id: string;
  newDefaultColorId: string | null;
}

type Transaction = Parameters<Parameters<typeof db.transaction>[0]>[0];

async function applyDeletionReplacements(tx: Transaction, replacements: MaterialDeletionReplacement[]) {
  for (const replacement of replacements) {
    if (replacement.kind === "part") {
      await tx
        .update(productParts)
        .set({ defaultMaterialColorId: replacement.newDefaultColorId })
        .where(eq(productParts.id, replacement.id));
    } else {
      await tx
        .update(productPartRegions)
        .set({ defaultMaterialColorId: replacement.newDefaultColorId })
        .where(eq(productPartRegions.id, replacement.id));
    }
  }
}

export async function checkMaterialColorDeletionImpact(colorId: string): Promise<MaterialColorDeletionImpactRow[]> {
  return getMaterialColorDeletionImpact([colorId]);
}

export async function checkMaterialTypeDeletionImpact(typeId: string): Promise<MaterialColorDeletionImpactRow[]> {
  const colorIds = await getMaterialColorIdsByType(typeId);
  return getMaterialColorDeletionImpact(colorIds);
}

export async function checkMaterialDeletionImpact(materialId: string): Promise<MaterialColorDeletionImpactRow[]> {
  const colorIds = await getMaterialColorIdsByMaterial(materialId);
  return getMaterialColorDeletionImpact(colorIds);
}

// ---------------------------------------------------------------------------
// Material (Resina | Plástico)
// ---------------------------------------------------------------------------

export interface MaterialInput {
  name: string;
  printProcess: MaterialPrintProcess;
  allowsDualColor: boolean;
  postProcessingFeeReais: number;
}

function materialRow(input: MaterialInput) {
  return {
    name: input.name.trim(),
    printProcess: input.printProcess,
    allowsDualColor: input.allowsDualColor,
    postProcessingFeeCents: Math.round(input.postProcessingFeeReais * 100),
  };
}

export async function createMaterial(input: MaterialInput): Promise<MaterialActionResult> {
  if (!input.name.trim()) return { error: "Nome é obrigatório." };

  try {
    await db.insert(materials).values(materialRow(input));
  } catch {
    return { error: "Não foi possível criar o material." };
  }
  revalidatePath("/admin/materiais");
  return {};
}

export async function updateMaterial(id: string, input: MaterialInput): Promise<MaterialActionResult> {
  if (!input.name.trim()) return { error: "Nome é obrigatório." };

  try {
    await db.update(materials).set(materialRow(input)).where(eq(materials.id, id));
  } catch {
    return { error: "Não foi possível salvar o material." };
  }
  revalidatePath("/admin/materiais");
  return {};
}

export async function deleteMaterial(
  id: string,
  replacements: MaterialDeletionReplacement[] = [],
): Promise<MaterialActionResult> {
  try {
    // Cascade apaga tipos e cores desse material — qualquer parte/região que
    // tinha uma dessas cores como padrão já foi reatribuída (ou explicitamente
    // deixada sem padrão) via `replacements`, escolhido pelo admin em
    // ConfirmDeleteMaterialButton antes de chegar aqui.
    await db.transaction(async (tx) => {
      await applyDeletionReplacements(tx, replacements);
      await tx.delete(materials).where(eq(materials.id, id));
    });
  } catch {
    return { error: "Não foi possível excluir o material." };
  }
  revalidatePath("/admin/materiais");
  return {};
}

// ---------------------------------------------------------------------------
// Tipo (PLA, ABS, Cristal, Dental...)
// ---------------------------------------------------------------------------

export interface MaterialTypeInput {
  name: string;
  pricePerKgReais: number;
  printSpeedValue: number;
  description: string;
}

function materialTypeRow(input: MaterialTypeInput) {
  return {
    name: input.name.trim(),
    pricePerKgCents: Math.round(input.pricePerKgReais * 100),
    printSpeedValue: input.printSpeedValue.toString(),
    description: input.description.trim() || null,
  };
}

export async function createMaterialType(materialId: string, input: MaterialTypeInput): Promise<MaterialActionResult> {
  if (!input.name.trim()) return { error: "Nome é obrigatório." };
  if (!Number.isFinite(input.printSpeedValue) || input.printSpeedValue <= 0) {
    return { error: "Velocidade de impressão precisa ser maior que zero." };
  }

  try {
    await db.insert(materialTypes).values({ materialId, ...materialTypeRow(input) });
  } catch {
    return { error: "Não foi possível criar o tipo." };
  }
  revalidatePath("/admin/materiais");
  return {};
}

export async function updateMaterialType(id: string, input: MaterialTypeInput): Promise<MaterialActionResult> {
  if (!input.name.trim()) return { error: "Nome é obrigatório." };
  if (!Number.isFinite(input.printSpeedValue) || input.printSpeedValue <= 0) {
    return { error: "Velocidade de impressão precisa ser maior que zero." };
  }

  try {
    await db.update(materialTypes).set(materialTypeRow(input)).where(eq(materialTypes.id, id));
  } catch {
    return { error: "Não foi possível salvar o tipo." };
  }
  revalidatePath("/admin/materiais");
  return {};
}

export async function deleteMaterialType(
  id: string,
  replacements: MaterialDeletionReplacement[] = [],
): Promise<MaterialActionResult> {
  try {
    await db.transaction(async (tx) => {
      await applyDeletionReplacements(tx, replacements);
      await tx.delete(materialTypes).where(eq(materialTypes.id, id));
    });
  } catch {
    return { error: "Não foi possível excluir o tipo." };
  }
  revalidatePath("/admin/materiais");
  return {};
}

// ---------------------------------------------------------------------------
// Cor
// ---------------------------------------------------------------------------

export interface MaterialColorInput {
  name: string;
  hexColor: string;
  hexColorSecondary: string | null;
}

async function resolveAllowsDualColor(materialTypeId: string): Promise<boolean> {
  const type = await db.query.materialTypes.findFirst({
    where: eq(materialTypes.id, materialTypeId),
    with: { material: true },
  });
  return type?.material.allowsDualColor ?? false;
}

function colorRow(input: MaterialColorInput, allowsDualColor: boolean) {
  return {
    name: input.name.trim(),
    hexColor: input.hexColor || null,
    // Nunca confia no formulário pra isso — um <input type="color"> nunca
    // fica vazio, então sem essa checagem no servidor uma cor de um
    // material que não permite dual-color (Resina) podia acabar gravando
    // uma 2ª cor mesmo assim. Mesma lição da rodada 14 (bug real: todo
    // material "sólido" criado pela UI antiga virava dual-color sem querer).
    hexColorSecondary: allowsDualColor ? input.hexColorSecondary || null : null,
  };
}

export async function createMaterialColor(materialTypeId: string, input: MaterialColorInput): Promise<MaterialActionResult> {
  if (!input.name.trim()) return { error: "Nome é obrigatório." };

  try {
    const allowsDualColor = await resolveAllowsDualColor(materialTypeId);
    await db.insert(materialColors).values({ materialTypeId, ...colorRow(input, allowsDualColor) });
  } catch {
    return { error: "Não foi possível criar a cor." };
  }
  revalidatePath("/admin/materiais");
  return {};
}

export async function updateMaterialColor(
  id: string,
  materialTypeId: string,
  input: MaterialColorInput,
): Promise<MaterialActionResult> {
  if (!input.name.trim()) return { error: "Nome é obrigatório." };

  try {
    const allowsDualColor = await resolveAllowsDualColor(materialTypeId);
    await db.update(materialColors).set(colorRow(input, allowsDualColor)).where(eq(materialColors.id, id));
  } catch {
    return { error: "Não foi possível salvar a cor." };
  }
  revalidatePath("/admin/materiais");
  return {};
}

export async function deleteMaterialColor(
  id: string,
  replacements: MaterialDeletionReplacement[] = [],
): Promise<MaterialActionResult> {
  try {
    await db.transaction(async (tx) => {
      await applyDeletionReplacements(tx, replacements);
      await tx.delete(materialColors).where(eq(materialColors.id, id));
    });
  } catch {
    return { error: "Não foi possível excluir a cor." };
  }
  revalidatePath("/admin/materiais");
  return {};
}
