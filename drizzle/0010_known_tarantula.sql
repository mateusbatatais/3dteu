CREATE TABLE "category_recommended_material_types" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"category_id" uuid NOT NULL,
	"material_type_id" uuid NOT NULL
);
--> statement-breakpoint
ALTER TABLE "category_recommended_material_types" ADD CONSTRAINT "category_recommended_material_types_category_id_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."categories"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "category_recommended_material_types" ADD CONSTRAINT "category_recommended_material_types_material_type_id_material_types_id_fk" FOREIGN KEY ("material_type_id") REFERENCES "public"."material_types"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "category_recommended_material_type_unique" ON "category_recommended_material_types" USING btree ("category_id","material_type_id");