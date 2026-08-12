-- SQL idempotente cobrindo TODAS as migrações pendentes (0001 a 0014).
-- Seguro rodar de uma vez no SQL Editor do Supabase, mesmo que parte já
-- tenha sido aplicada antes (manualmente ou em rodadas anteriores) — cada
-- bloco usa IF NOT EXISTS / DO $$ ... EXCEPTION WHEN duplicate_object pra
-- nunca falhar em algo que já existe, e o bloco de limpeza da hierarquia de
-- materiais (perto do fim) só roda se detectar que o catálogo antigo ainda
-- não foi migrado — não apaga dados novos por engano.
--
-- migration 0000 (schema inicial) já foi confirmada aplicada antes; não
-- entra aqui.

-- ---------------------------------------------------------------------
-- 0001: fotos de produto, etiqueta de envio, config da loja
-- ---------------------------------------------------------------------
DO $$ BEGIN
  CREATE TYPE "public"."shipment_status" AS ENUM('pending', 'purchased', 'error');
EXCEPTION WHEN duplicate_object THEN null; END $$;

CREATE TABLE IF NOT EXISTS "product_images" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"product_id" uuid NOT NULL,
	"url" text NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "shipments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"order_id" uuid NOT NULL,
	"provider" text DEFAULT 'superfrete' NOT NULL,
	"external_id" text,
	"tracking_code" text,
	"label_url" text,
	"status" "shipment_status" DEFAULT 'pending' NOT NULL,
	"raw_payload" jsonb,
	"purchased_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "shipments_order_id_unique" UNIQUE("order_id")
);

CREATE TABLE IF NOT EXISTS "store_settings" (
	"id" text PRIMARY KEY DEFAULT 'default' NOT NULL,
	"sender_name" text,
	"sender_document" text,
	"sender_phone" text,
	"zip_code" text,
	"street" text,
	"number" text,
	"complement" text,
	"neighborhood" text,
	"city" text,
	"state" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "shipping_carrier_name" text;
ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "shipping_service_id" text;
ALTER TABLE "products" ADD COLUMN IF NOT EXISTS "height_cm" integer;
ALTER TABLE "products" ADD COLUMN IF NOT EXISTS "width_cm" integer;
ALTER TABLE "products" ADD COLUMN IF NOT EXISTS "length_cm" integer;

DO $$ BEGIN
  ALTER TABLE "product_images" ADD CONSTRAINT "product_images_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  ALTER TABLE "shipments" ADD CONSTRAINT "shipments_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- ---------------------------------------------------------------------
-- 0002: regiões pintadas (.3mf MMU)
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS "product_part_regions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"product_part_id" uuid NOT NULL,
	"paint_state" integer NOT NULL,
	"label" text NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);

DO $$ BEGIN
  ALTER TABLE "product_part_regions" ADD CONSTRAINT "product_part_regions_product_part_id_product_parts_id_fk" FOREIGN KEY ("product_part_id") REFERENCES "public"."product_parts"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;

CREATE UNIQUE INDEX IF NOT EXISTS "product_part_region_state_unique" ON "product_part_regions" USING btree ("product_part_id","paint_state");

-- ---------------------------------------------------------------------
-- 0003 / 0004: material padrão por parte/região — só a coluna aqui; a FK
-- (que originalmente apontava pro catálogo antigo "filament_options") é
-- tratada direto no bloco da Fase 1 (0009) mais abaixo, já apontando pro
-- catálogo novo — evita recriar uma constraint que já foi substituída.
-- ---------------------------------------------------------------------
ALTER TABLE "product_parts" ADD COLUMN IF NOT EXISTS "default_filament_option_id" uuid;
ALTER TABLE "product_part_regions" ADD COLUMN IF NOT EXISTS "enabled" boolean DEFAULT true NOT NULL;
ALTER TABLE "product_part_regions" ADD COLUMN IF NOT EXISTS "default_filament_option_id" uuid;

-- ---------------------------------------------------------------------
-- 0005: conta de cliente (pedido feito logado)
-- ---------------------------------------------------------------------
ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "customer_id" uuid;

-- ---------------------------------------------------------------------
-- 0006: avaliações de produto
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS "product_reviews" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"product_id" uuid NOT NULL,
	"customer_id" uuid NOT NULL,
	"customer_name" text NOT NULL,
	"rating" integer NOT NULL,
	"comment" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

DO $$ BEGIN
  ALTER TABLE "product_reviews" ADD CONSTRAINT "product_reviews_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;

CREATE UNIQUE INDEX IF NOT EXISTS "product_review_customer_unique" ON "product_reviews" USING btree ("product_id","customer_id");

-- ---------------------------------------------------------------------
-- 0007: imagem de categoria
-- ---------------------------------------------------------------------
ALTER TABLE "categories" ADD COLUMN IF NOT EXISTS "image_url" text;

-- ---------------------------------------------------------------------
-- 0008: sugestão de preço v1 (peso × preço/grama) + taxa fixa
-- ---------------------------------------------------------------------
ALTER TABLE "store_settings" ADD COLUMN IF NOT EXISTS "price_per_gram_cents" integer;
ALTER TABLE "store_settings" ADD COLUMN IF NOT EXISTS "fixed_fee_cents" integer;

-- ---------------------------------------------------------------------
-- 0009 (Fase 1 do ROADMAP.md): hierarquia Material → Tipo → Cor +
-- calculadora de preço. Substitui o catálogo antigo "filament_options"
-- (lista achatada de cores).
-- ---------------------------------------------------------------------
DO $$ BEGIN
  CREATE TYPE "public"."material_print_process" AS ENUM('fdm', 'resin');
EXCEPTION WHEN duplicate_object THEN null; END $$;

CREATE TABLE IF NOT EXISTS "materials" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"print_process" "material_print_process" NOT NULL,
	"allows_dual_color" boolean DEFAULT false NOT NULL,
	"post_processing_fee_cents" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "material_types" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"material_id" uuid NOT NULL,
	"name" text NOT NULL,
	"price_per_kg_cents" integer NOT NULL,
	"print_speed_value" numeric(8, 2) NOT NULL,
	"description" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "material_colors" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"material_type_id" uuid NOT NULL,
	"name" text NOT NULL,
	"hex_color" text,
	"hex_color_secondary" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);

DO $$ BEGIN
  ALTER TABLE "material_types" ADD CONSTRAINT "material_types_material_id_materials_id_fk" FOREIGN KEY ("material_id") REFERENCES "public"."materials"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  ALTER TABLE "material_colors" ADD CONSTRAINT "material_colors_material_type_id_material_types_id_fk" FOREIGN KEY ("material_type_id") REFERENCES "public"."material_types"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- Limpeza ÚNICA, condicional: só roda se o catálogo antigo ainda não foi
-- migrado (detectado pela constraint original de 0000, que sempre existe
-- em bancos que nunca rodaram esta migração, e nunca existe depois que ela
-- roda com sucesso) — evita apagar atribuições de cor NOVAS por engano se
-- isso já rodou antes.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'product_part_material_options_filament_option_id_filament_options_id_fk'
  ) THEN
    ALTER TABLE "product_part_material_options" DROP CONSTRAINT IF EXISTS "product_part_material_options_filament_option_id_filament_options_id_fk";
    ALTER TABLE "product_part_regions" DROP CONSTRAINT IF EXISTS "product_part_regions_default_filament_option_id_filament_options_id_fk";
    ALTER TABLE "product_parts" DROP CONSTRAINT IF EXISTS "product_parts_default_filament_option_id_filament_options_id_fk";

    -- "Desatribui" cores do catálogo antigo (que não existe mais no
    -- catálogo novo) — esperado reatribuir depois em /admin/produtos.
    DELETE FROM "product_part_material_options";
    UPDATE "product_part_regions" SET "default_filament_option_id" = NULL;
    UPDATE "product_parts" SET "default_filament_option_id" = NULL;
  END IF;
END $$;

DO $$ BEGIN
  ALTER TABLE "product_part_material_options" ADD CONSTRAINT "product_part_material_options_filament_option_id_material_colors_id_fk" FOREIGN KEY ("filament_option_id") REFERENCES "public"."material_colors"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  ALTER TABLE "product_part_regions" ADD CONSTRAINT "product_part_regions_default_filament_option_id_material_colors_id_fk" FOREIGN KEY ("default_filament_option_id") REFERENCES "public"."material_colors"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  ALTER TABLE "product_parts" ADD CONSTRAINT "product_parts_default_filament_option_id_material_colors_id_fk" FOREIGN KEY ("default_filament_option_id") REFERENCES "public"."material_colors"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;

ALTER TABLE "store_settings" ADD COLUMN IF NOT EXISTS "energy_price_cents_per_kwh" integer;
ALTER TABLE "store_settings" ADD COLUMN IF NOT EXISTS "printer_power_watts" integer;
ALTER TABLE "store_settings" ADD COLUMN IF NOT EXISTS "profit_margin_percent" numeric(5, 2);

-- ---------------------------------------------------------------------
-- 0010 (Fase 1b): material recomendado por categoria
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS "category_recommended_material_types" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"category_id" uuid NOT NULL,
	"material_type_id" uuid NOT NULL
);

DO $$ BEGIN
  ALTER TABLE "category_recommended_material_types" ADD CONSTRAINT "category_recommended_material_types_category_id_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."categories"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  ALTER TABLE "category_recommended_material_types" ADD CONSTRAINT "category_recommended_material_types_material_type_id_material_types_id_fk" FOREIGN KEY ("material_type_id") REFERENCES "public"."material_types"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;

CREATE UNIQUE INDEX IF NOT EXISTS "category_recommended_material_type_unique" ON "category_recommended_material_types" USING btree ("category_id","material_type_id");

-- ---------------------------------------------------------------------
-- 0011 (Fase 4): pedido de modelo customizado via IA (Meshy)
-- ---------------------------------------------------------------------
DO $$ BEGIN
  CREATE TYPE "public"."custom_model_request_status" AS ENUM('pending', 'generating', 'ready', 'failed', 'confirmed');
EXCEPTION WHEN duplicate_object THEN null; END $$;

CREATE TABLE IF NOT EXISTS "custom_model_requests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"customer_id" uuid NOT NULL,
	"description" text NOT NULL,
	"photo_urls" jsonb NOT NULL,
	"status" "custom_model_request_status" DEFAULT 'pending' NOT NULL,
	"meshy_task_id" text,
	"mesh_file_url" text,
	"thumbnail_url" text,
	"weight_grams" numeric(10, 2),
	"width_mm" numeric(10, 2),
	"height_mm" numeric(10, 2),
	"depth_mm" numeric(10, 2),
	"consumed_credits" integer,
	"error_message" text,
	"product_id" uuid,
	"order_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

ALTER TABLE "store_settings" ADD COLUMN IF NOT EXISTS "custom_model_fee_cents" integer;

DO $$ BEGIN
  ALTER TABLE "custom_model_requests" ADD CONSTRAINT "custom_model_requests_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  ALTER TABLE "custom_model_requests" ADD CONSTRAINT "custom_model_requests_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- ---------------------------------------------------------------------
-- 0012: transparência por cor (resina translúcida tipo "Cristal")
-- ---------------------------------------------------------------------
ALTER TABLE "material_colors" ADD COLUMN IF NOT EXISTS "opacity" numeric(3, 2) DEFAULT '1' NOT NULL;

-- ---------------------------------------------------------------------
-- 0013 (Fase 1c): preço ao vivo por material/cor — peso por peça + taxa dual-color
-- ---------------------------------------------------------------------
ALTER TABLE "materials" ADD COLUMN IF NOT EXISTS "dual_color_fee_cents" integer DEFAULT 0 NOT NULL;
ALTER TABLE "product_parts" ADD COLUMN IF NOT EXISTS "weight_grams" integer;

-- ---------------------------------------------------------------------
-- 0014 (Fase 4b): enviar STL próprio pra orçamento (sem geração por IA)
-- ---------------------------------------------------------------------
DO $$ BEGIN
  CREATE TYPE "public"."custom_model_request_origin" AS ENUM('ai', 'upload');
EXCEPTION WHEN duplicate_object THEN null; END $$;

ALTER TABLE "custom_model_requests" ADD COLUMN IF NOT EXISTS "origin" "public"."custom_model_request_origin" DEFAULT 'ai' NOT NULL;
