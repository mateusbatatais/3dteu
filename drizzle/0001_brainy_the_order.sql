CREATE TYPE "public"."shipment_status" AS ENUM('pending', 'purchased', 'error');--> statement-breakpoint
CREATE TABLE "product_images" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"product_id" uuid NOT NULL,
	"url" text NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "shipments" (
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
--> statement-breakpoint
CREATE TABLE "store_settings" (
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
--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "shipping_carrier_name" text;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "shipping_service_id" text;--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN "height_cm" integer;--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN "width_cm" integer;--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN "length_cm" integer;--> statement-breakpoint
ALTER TABLE "product_images" ADD CONSTRAINT "product_images_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shipments" ADD CONSTRAINT "shipments_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE cascade ON UPDATE no action;