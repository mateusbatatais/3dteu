-- Rode DEPOIS de scripts/pending-migrations-0001-a-0015.sql (precisa de
-- todas as colunas/tabelas de materiais criadas até agora, incluindo
-- opacity, dual_color_fee_cents e hex_color_secondary).
--
-- Catálogo comprehensive pra uma loja de impressão 3D em FDM + resina:
-- 3 Materiais (Plástico, Flexível/TPU, Resina), 7 Tipos, 36 Cores —
-- pensado pra cobrir o que a maioria das lojas precisa de cara, sem ser
-- infinito. Ajuste/complete depois direto em /admin/materiais (a tela já
-- tem CRUD completo pros 3 níveis).
--
-- PREÇOS, VELOCIDADES E TAXAS SÃO CHUTES RAZOÁVEIS pro mercado
-- brasileiro, não o custo real do seu fornecedor/impressora — a
-- calculadora de preço (e o preço ao vivo por material da loja) só fica
-- precisa depois de você revisar cada Tipo em /admin/materiais.
--
-- Você confirmou que não tem muita coisa cadastrada ainda e autorizou
-- apagar o catálogo de materiais atual pra evitar misturar com dado de
-- teste — é exatamente o que este script faz (mesmo padrão de
-- scripts/reset-catalog-and-seed-materials.sql, agora bem mais completo).
-- NÃO mexe em produtos/categorias/pedidos — só na tabela de materiais.
--
-- ATENÇÃO — não dá erro de foreign key (as constraints são "cascade"/
-- "set null", não "restrict"), mas se algum PRODUTO já tiver uma cor
-- dessas atribuída, o DELETE FROM "materials" abaixo desatribui ela
-- silenciosamente: a linha em product_part_material_options some, e o
-- material padrão da peça/região volta pra null. O produto continua
-- existindo, só fica sem cor aceita/padrão até você reatribuir na tela
-- dele em /admin/produtos. Se isso te preocupa, confira antes se já tem
-- produto de verdade usando alguma cor do catálogo atual.

DELETE FROM "materials";

DO $$
DECLARE
  v_plastico_id uuid;
  v_flexivel_id uuid;
  v_resina_id uuid;

  v_pla_id uuid;
  v_petg_id uuid;
  v_abs_id uuid;
  v_tpu_id uuid;
  v_cristal_id uuid;
  v_resistente_id uuid;
  v_resina_flex_id uuid;
BEGIN
  -- ---------------------------------------------------------------------
  -- Materiais
  -- ---------------------------------------------------------------------

  -- Plástico rígido (FDM padrão) — permite dual-color (troca de cor no
  -- meio da impressão), sem taxa de pós-processamento.
  INSERT INTO "materials" ("name", "print_process", "allows_dual_color", "post_processing_fee_cents", "dual_color_fee_cents")
  VALUES ('Plástico', 'fdm', true, 0, 500)
  RETURNING id INTO v_plastico_id;

  -- TPU flexível é um material bem diferente (imprime mais devagar, dual-
  -- color não é prático num filamento emborrachado) — por isso fica
  -- separado do Plástico rígido, não é só mais um Tipo dele.
  INSERT INTO "materials" ("name", "print_process", "allows_dual_color", "post_processing_fee_cents", "dual_color_fee_cents")
  VALUES ('Flexível (TPU)', 'fdm', false, 0, 0)
  RETURNING id INTO v_flexivel_id;

  -- Resina não faz dual-color (impressora de resina usa uma cuba só por
  -- impressão) e sempre tem taxa de pós-processamento (lavagem em álcool
  -- isopropílico + cura em UV).
  INSERT INTO "materials" ("name", "print_process", "allows_dual_color", "post_processing_fee_cents", "dual_color_fee_cents")
  VALUES ('Resina', 'resin', false, 1500, 0)
  RETURNING id INTO v_resina_id;

  -- ---------------------------------------------------------------------
  -- Tipos
  -- ---------------------------------------------------------------------

  INSERT INTO "material_types" ("material_id", "name", "price_per_kg_cents", "print_speed_value", "description")
  VALUES (v_plastico_id, 'PLA', 8000, 20.00, 'O material mais popular e fácil de imprimir — bom acabamento, ideal pra decoração e protótipos. Não recomendado pra uso em áreas muito quentes (empena acima de ~60°C).')
  RETURNING id INTO v_pla_id;

  INSERT INTO "material_types" ("material_id", "name", "price_per_kg_cents", "print_speed_value", "description")
  VALUES (v_plastico_id, 'PETG', 9500, 18.00, 'Mais resistente a impacto e calor que o PLA — ideal pra peças funcionais e uso ao ar livre. Levemente flexível, com brilho natural.')
  RETURNING id INTO v_petg_id;

  INSERT INTO "material_types" ("material_id", "name", "price_per_kg_cents", "print_speed_value", "description")
  VALUES (v_plastico_id, 'ABS', 9000, 18.00, 'Resistente a impacto e temperatura, clássico da indústria — exige impressora com câmara fechada, empena mais fácil que PLA/PETG na hora de imprimir.')
  RETURNING id INTO v_abs_id;

  INSERT INTO "material_types" ("material_id", "name", "price_per_kg_cents", "print_speed_value", "description")
  VALUES (v_flexivel_id, 'TPU 95A', 12000, 10.00, 'Material flexível e emborrachado — ideal pra capinhas, solados, peças que precisam dobrar ou absorver impacto. Imprime bem mais devagar que PLA/PETG.')
  RETURNING id INTO v_tpu_id;

  INSERT INTO "material_types" ("material_id", "name", "price_per_kg_cents", "print_speed_value", "description")
  VALUES (v_resina_id, 'Cristal (Padrão)', 25000, 15.00, 'Translúcida, ótima pra decoração e peças com detalhe fino — mais frágil que a Resistente.')
  RETURNING id INTO v_cristal_id;

  INSERT INTO "material_types" ("material_id", "name", "price_per_kg_cents", "print_speed_value", "description")
  VALUES (v_resina_id, 'Resistente (Tough)', 28000, 15.00, 'Menos frágil que a Cristal — boa pra peça funcional e protótipo, não só decorativa.')
  RETURNING id INTO v_resistente_id;

  INSERT INTO "material_types" ("material_id", "name", "price_per_kg_cents", "print_speed_value", "description")
  VALUES (v_resina_id, 'Flexível', 32000, 12.00, 'Resina elástica, pra peças que precisam dobrar ou vedar — mais cara e mais lenta de curar que as outras.')
  RETURNING id INTO v_resina_flex_id;

  -- ---------------------------------------------------------------------
  -- Cores
  -- ---------------------------------------------------------------------

  -- PLA: o Tipo mais popular ganha a paleta mais completa, incluindo 2
  -- combinações dual-color (hex_color_secondary preenchido) já que
  -- allows_dual_color=true no Plástico.
  INSERT INTO "material_colors" ("material_type_id", "name", "hex_color", "hex_color_secondary", "opacity") VALUES
    (v_pla_id, 'Branco', '#FFFFFF', NULL, 1),
    (v_pla_id, 'Preto', '#171717', NULL, 1),
    (v_pla_id, 'Cinza', '#9CA3AF', NULL, 1),
    (v_pla_id, 'Vermelho', '#DC2626', NULL, 1),
    (v_pla_id, 'Azul', '#2563EB', NULL, 1),
    (v_pla_id, 'Verde', '#16A34A', NULL, 1),
    (v_pla_id, 'Amarelo', '#EAB308', NULL, 1),
    (v_pla_id, 'Laranja', '#F97316', NULL, 1),
    (v_pla_id, 'Roxo', '#7C3AED', NULL, 1),
    (v_pla_id, 'Rosa', '#EC4899', NULL, 1),
    (v_pla_id, 'Dourado', '#CA9A3F', NULL, 1),
    (v_pla_id, 'Prata', '#B0B3B8', NULL, 1),
    (v_pla_id, 'Transparente', '#E5F3FF', NULL, 0.4),
    (v_pla_id, 'Azul/Laranja', '#2563EB', '#F97316', 1),
    (v_pla_id, 'Preto/Branco', '#171717', '#FFFFFF', 1);

  INSERT INTO "material_colors" ("material_type_id", "name", "hex_color") VALUES
    (v_petg_id, 'Preto', '#171717'),
    (v_petg_id, 'Branco', '#FFFFFF'),
    (v_petg_id, 'Natural (transparente)', '#E5F3FF'),
    (v_petg_id, 'Azul', '#2563EB'),
    (v_petg_id, 'Vermelho', '#DC2626');

  INSERT INTO "material_colors" ("material_type_id", "name", "hex_color") VALUES
    (v_abs_id, 'Preto', '#171717'),
    (v_abs_id, 'Branco', '#FFFFFF'),
    (v_abs_id, 'Cinza', '#9CA3AF'),
    (v_abs_id, 'Vermelho', '#DC2626');

  INSERT INTO "material_colors" ("material_type_id", "name", "hex_color", "opacity") VALUES
    (v_tpu_id, 'Preto', '#171717', 1),
    (v_tpu_id, 'Branco', '#FFFFFF', 1),
    (v_tpu_id, 'Transparente', '#E5F3FF', 0.45);

  INSERT INTO "material_colors" ("material_type_id", "name", "hex_color", "opacity") VALUES
    (v_cristal_id, 'Transparente', '#E0F2FE', 0.35),
    (v_cristal_id, 'Branco', '#FFFFFF', 1),
    (v_cristal_id, 'Cinza', '#9CA3AF', 1),
    (v_cristal_id, 'Preto', '#171717', 1);

  INSERT INTO "material_colors" ("material_type_id", "name", "hex_color") VALUES
    (v_resistente_id, 'Cinza', '#6B7280'),
    (v_resistente_id, 'Preto', '#171717'),
    (v_resistente_id, 'Branco', '#FFFFFF');

  INSERT INTO "material_colors" ("material_type_id", "name", "hex_color", "opacity") VALUES
    (v_resina_flex_id, 'Preto', '#171717', 1),
    (v_resina_flex_id, 'Transparente', '#E0F2FE', 0.5);
END $$;
