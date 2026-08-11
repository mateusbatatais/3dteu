CREATE TYPE "public"."custom_model_request_status" AS ENUM('pending', 'generating', 'ready', 'failed', 'confirmed');--> statement-breakpoint
CREATE TABLE "custom_model_requests" (
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
--> statement-breakpoint
ALTER TABLE "store_settings" ADD COLUMN "custom_model_fee_cents" integer;--> statement-breakpoint
ALTER TABLE "custom_model_requests" ADD CONSTRAINT "custom_model_requests_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "custom_model_requests" ADD CONSTRAINT "custom_model_requests_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE set null ON UPDATE no action;