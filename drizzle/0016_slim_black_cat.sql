CREATE TABLE IF NOT EXISTS "product_part_material_types" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"product_part_id" uuid NOT NULL,
	"material_type_id" uuid NOT NULL
);
--> statement-breakpoint
ALTER TABLE "material_colors" ADD COLUMN IF NOT EXISTS "available" boolean DEFAULT true NOT NULL;--> statement-breakpoint
DO $$ BEGIN
	ALTER TABLE "product_part_material_types" ADD CONSTRAINT "product_part_material_types_product_part_id_product_parts_id_fk" FOREIGN KEY ("product_part_id") REFERENCES "public"."product_parts"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
	WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint
DO $$ BEGIN
	ALTER TABLE "product_part_material_types" ADD CONSTRAINT "product_part_material_types_material_type_id_material_types_id_fk" FOREIGN KEY ("material_type_id") REFERENCES "public"."material_types"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
	WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "product_part_material_type_unique" ON "product_part_material_types" USING btree ("product_part_id","material_type_id");--> statement-breakpoint
-- Deriva os Tipos aceitos por cada peça a partir das cores que já estavam
-- curadas nela (product_part_material_options, mecanismo antigo) — cada
-- peça passa a aceitar o(s) Tipo(s) das cores que já tinha marcado, e as
-- cores oferecidas viram todas as disponíveis desses Tipos (não só as que
-- estavam marcadas antes). Seguro rodar de novo (ON CONFLICT DO NOTHING).
INSERT INTO "product_part_material_types" ("product_part_id", "material_type_id")
SELECT DISTINCT ppmo.product_part_id, mc.material_type_id
FROM "product_part_material_options" ppmo
JOIN "material_colors" mc ON mc.id = ppmo.filament_option_id
ON CONFLICT ("product_part_id", "material_type_id") DO NOTHING;