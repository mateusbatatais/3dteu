import "dotenv/config";

import { db } from "../src/server/db/client";
import {
  categories,
  materialColors,
  materials,
  materialTypes,
  productPartMaterialOptions,
  productParts,
  products,
  sizeOptions,
} from "../src/server/db/schema";

async function main() {
  const [category] = await db
    .insert(categories)
    .values({ slug: "fidgets", name: "Fidgets" })
    .returning();

  const [plastico] = await db
    .insert(materials)
    .values({ name: "Plástico", printProcess: "fdm", allowsDualColor: true, postProcessingFeeCents: 0 })
    .returning();

  const [pla] = await db
    .insert(materialTypes)
    .values({ materialId: plastico.id, name: "PLA", pricePerKgCents: 8000, printSpeedValue: "20" })
    .returning();

  const [azul, dualAzulLaranja, madeira] = await db
    .insert(materialColors)
    .values([
      { materialTypeId: pla.id, name: "Azul", hexColor: "#2563eb" },
      { materialTypeId: pla.id, name: "Azul/Laranja", hexColor: "#2563eb", hexColorSecondary: "#f97316" },
      { materialTypeId: pla.id, name: "Madeira", hexColor: "#8b5a2b" },
    ])
    .returning();

  const [product] = await db
    .insert(products)
    .values({
      slug: "fidget-cubo",
      name: "Fidget Cubo",
      description: "Cubo anti-stress com peças articuladas.",
      categoryId: category.id,
      status: "published",
      basePriceCents: 3500,
      weightGrams: 60,
      printTimeMinutes: 180,
    })
    .returning();

  const [corpo, tampa] = await db
    .insert(productParts)
    .values([
      { productId: product.id, name: "corpo", sortOrder: 0 },
      { productId: product.id, name: "tampa", sortOrder: 1 },
    ])
    .returning();

  await db.insert(productPartMaterialOptions).values([
    { productPartId: corpo.id, materialColorId: azul.id },
    { productPartId: corpo.id, materialColorId: dualAzulLaranja.id },
    { productPartId: corpo.id, materialColorId: madeira.id },
    { productPartId: tampa.id, materialColorId: azul.id },
    { productPartId: tampa.id, materialColorId: dualAzulLaranja.id },
  ]);

  await db.insert(sizeOptions).values([
    { productId: product.id, label: "P", scaleFactor: "0.8", priceModifierCents: -300, weightModifierGrams: -15, sortOrder: 0 },
    { productId: product.id, label: "M", scaleFactor: "1", priceModifierCents: 0, weightModifierGrams: 0, sortOrder: 1 },
    { productId: product.id, label: "G", scaleFactor: "1.2", priceModifierCents: 500, weightModifierGrams: 20, sortOrder: 2 },
  ]);

  console.log(`Produto de exemplo criado: /produtos/${product.slug}`);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
