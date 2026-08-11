ALTER TABLE "materials" ADD COLUMN "dual_color_fee_cents" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "product_parts" ADD COLUMN "weight_grams" integer;