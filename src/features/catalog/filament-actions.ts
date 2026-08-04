"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";

import { db } from "@/server/db/client";
import { filamentOptions, filamentTypeEnum } from "@/server/db/schema";

const FILAMENT_TYPES = filamentTypeEnum.enumValues;

export async function createFilament(formData: FormData) {
  const type = String(formData.get("type") ?? "");
  const name = String(formData.get("name") ?? "").trim();
  const hexColor = String(formData.get("hexColor") ?? "").trim() || null;
  const hexColorSecondary = String(formData.get("hexColorSecondary") ?? "").trim() || null;
  const priceModifierReais = Number(formData.get("priceModifierReais") ?? 0);

  if (!name || !FILAMENT_TYPES.includes(type as (typeof FILAMENT_TYPES)[number])) return;

  await db.insert(filamentOptions).values({
    type: type as (typeof FILAMENT_TYPES)[number],
    name,
    hexColor,
    hexColorSecondary,
    priceModifierCents: Math.round(priceModifierReais * 100),
  });

  revalidatePath("/admin/materiais");
}

export async function deleteFilament(id: string) {
  await db.delete(filamentOptions).where(eq(filamentOptions.id, id));
  revalidatePath("/admin/materiais");
}
