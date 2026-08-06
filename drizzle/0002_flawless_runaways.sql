CREATE TABLE "product_part_regions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"product_part_id" uuid NOT NULL,
	"paint_state" integer NOT NULL,
	"label" text NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "product_part_regions" ADD CONSTRAINT "product_part_regions_product_part_id_product_parts_id_fk" FOREIGN KEY ("product_part_id") REFERENCES "public"."product_parts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "product_part_region_state_unique" ON "product_part_regions" USING btree ("product_part_id","paint_state");