"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";

import { db } from "@/server/db/client";
import { filamentOptions } from "@/server/db/schema";

import type { FilamentType } from "./types";

export interface FilamentActionResult {
  error?: string;
}

export interface FilamentInput {
  name: string;
  type: FilamentType;
  hexColor: string;
  hexColorSecondary: string | null;
  priceModifierReais: number;
}

function toRow(input: FilamentInput) {
  return {
    name: input.name.trim(),
    type: input.type,
    hexColor: input.hexColor || null,
    // Um <input type="color"> nunca fica "vazio" — mesmo escolhendo "Cor
    // sólida" o navegador manda algum valor pra 2ª cor se o campo existir.
    // Forçar null aqui (em vez de confiar no que o formulário mandou) é o
    // que garante que um material "sólido" nunca acaba virando dual-color
    // por acidente.
    hexColorSecondary: input.type === "dual_color" ? input.hexColorSecondary || null : null,
    priceModifierCents: Math.round(input.priceModifierReais * 100),
  };
}

export async function createFilament(input: FilamentInput): Promise<FilamentActionResult> {
  if (!input.name.trim()) return { error: "Nome é obrigatório." };

  await db.insert(filamentOptions).values(toRow(input));
  revalidatePath("/admin/materiais");
  return {};
}

export async function updateFilament(id: string, input: FilamentInput): Promise<FilamentActionResult> {
  if (!input.name.trim()) return { error: "Nome é obrigatório." };

  await db.update(filamentOptions).set(toRow(input)).where(eq(filamentOptions.id, id));
  revalidatePath("/admin/materiais");
  return {};
}

export async function deleteFilament(id: string) {
  await db.delete(filamentOptions).where(eq(filamentOptions.id, id));
  revalidatePath("/admin/materiais");
}
