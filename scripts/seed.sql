-- Equivalente em SQL puro de scripts/seed.ts — use este arquivo se preferir
-- colar direto no SQL Editor do Supabase, sem rodar nada localmente.
-- Rode DEPOIS da migration em drizzle/0000_romantic_piledriver.sql.
DO $$
DECLARE
  v_category_id uuid;
  v_azul_id uuid;
  v_dual_id uuid;
  v_madeira_id uuid;
  v_product_id uuid;
  v_corpo_id uuid;
  v_tampa_id uuid;
BEGIN
  INSERT INTO categories (slug, name)
  VALUES ('fidgets', 'Fidgets')
  RETURNING id INTO v_category_id;

  INSERT INTO filament_options (type, name, hex_color, price_modifier_cents)
  VALUES ('solid_color', 'Azul', '#2563eb', 0)
  RETURNING id INTO v_azul_id;

  INSERT INTO filament_options (type, name, hex_color, hex_color_secondary, price_modifier_cents)
  VALUES ('dual_color', 'Azul/Laranja', '#2563eb', '#f97316', 300)
  RETURNING id INTO v_dual_id;

  INSERT INTO filament_options (type, name, hex_color, price_modifier_cents)
  VALUES ('special', 'Madeira', '#8b5a2b', 800)
  RETURNING id INTO v_madeira_id;

  INSERT INTO products (slug, name, description, category_id, status, base_price_cents, weight_grams, print_time_minutes)
  VALUES ('fidget-cubo', 'Fidget Cubo', 'Cubo anti-stress com peças articuladas.', v_category_id, 'published', 3500, 60, 180)
  RETURNING id INTO v_product_id;

  INSERT INTO product_parts (product_id, name, sort_order)
  VALUES (v_product_id, 'corpo', 0)
  RETURNING id INTO v_corpo_id;

  INSERT INTO product_parts (product_id, name, sort_order)
  VALUES (v_product_id, 'tampa', 1)
  RETURNING id INTO v_tampa_id;

  INSERT INTO product_part_material_options (product_part_id, filament_option_id) VALUES
    (v_corpo_id, v_azul_id),
    (v_corpo_id, v_dual_id),
    (v_corpo_id, v_madeira_id),
    (v_tampa_id, v_azul_id),
    (v_tampa_id, v_dual_id);

  INSERT INTO size_options (product_id, label, scale_factor, price_modifier_cents, weight_modifier_grams, sort_order) VALUES
    (v_product_id, 'P', 0.8, -300, -15, 0),
    (v_product_id, 'M', 1, 0, 0, 1),
    (v_product_id, 'G', 1.2, 500, 20, 2);

  RAISE NOTICE 'Produto de exemplo criado: /produtos/fidget-cubo (id %)', v_product_id;
END $$;
