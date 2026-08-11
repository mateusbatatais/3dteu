CREATE TYPE "public"."material_print_process" AS ENUM('fdm', 'resin');--> statement-breakpoint
CREATE TABLE "material_colors" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"material_type_id" uuid NOT NULL,
	"name" text NOT NULL,
	"hex_color" text,
	"hex_color_secondary" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "material_types" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"material_id" uuid NOT NULL,
	"name" text NOT NULL,
	"price_per_kg_cents" integer NOT NULL,
	"print_speed_value" numeric(8, 2) NOT NULL,
	"description" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "materials" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"print_process" "material_print_process" NOT NULL,
	"allows_dual_color" boolean DEFAULT false NOT NULL,
	"post_processing_fee_cents" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "product_part_material_options" DROP CONSTRAINT "product_part_material_options_filament_option_id_filament_options_id_fk";
--> statement-breakpoint
ALTER TABLE "product_part_regions" DROP CONSTRAINT "product_part_regions_default_filament_option_id_filament_options_id_fk";
--> statement-breakpoint
ALTER TABLE "product_parts" DROP CONSTRAINT "product_parts_default_filament_option_id_filament_options_id_fk";
--> statement-breakpoint
-- As 3 colunas abaixo trocam de apontar pra "filament_options" (catálogo
-- antigo, achatado) pra "material_colors" (catálogo novo, Material→Tipo→
-- Cor). Qualquer valor já gravado apontava pra uma cor do catálogo ANTIGO,
-- que não existe mais no catálogo novo (ainda vazio) — precisa limpar antes
-- de recriar a constraint, senão o ADD CONSTRAINT abaixo falha com violação
-- de FK. Isso "desatribui" cores já escolhidas em peças existentes; é
-- esperado reatribuir na tela de admin nova depois de rodar isso (ver
-- ROADMAP.md "Fase 1").
DELETE FROM "product_part_material_options";
--> statement-breakpoint
UPDATE "product_part_regions" SET "default_filament_option_id" = NULL;
--> statement-breakpoint
UPDATE "product_parts" SET "default_filament_option_id" = NULL;
--> statement-breakpoint
ALTER TABLE "store_settings" ADD COLUMN "energy_price_cents_per_kwh" integer;--> statement-breakpoint
ALTER TABLE "store_settings" ADD COLUMN "printer_power_watts" integer;--> statement-breakpoint
ALTER TABLE "store_settings" ADD COLUMN "profit_margin_percent" numeric(5, 2);--> statement-breakpoint
ALTER TABLE "material_colors" ADD CONSTRAINT "material_colors_material_type_id_material_types_id_fk" FOREIGN KEY ("material_type_id") REFERENCES "public"."material_types"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "material_types" ADD CONSTRAINT "material_types_material_id_materials_id_fk" FOREIGN KEY ("material_id") REFERENCES "public"."materials"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_part_material_options" ADD CONSTRAINT "product_part_material_options_filament_option_id_material_colors_id_fk" FOREIGN KEY ("filament_option_id") REFERENCES "public"."material_colors"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_part_regions" ADD CONSTRAINT "product_part_regions_default_filament_option_id_material_colors_id_fk" FOREIGN KEY ("default_filament_option_id") REFERENCES "public"."material_colors"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_parts" ADD CONSTRAINT "product_parts_default_filament_option_id_material_colors_id_fk" FOREIGN KEY ("default_filament_option_id") REFERENCES "public"."material_colors"("id") ON DELETE set null ON UPDATE no action;