-- Rode DEPOIS de scripts/pending-migrations-0001-a-0011.sql (precisa das
-- tabelas materials/material_types/material_colors, criadas por ele).
--
-- O QUE ESTE SCRIPT FAZ (nessa ordem):
--   1. Apaga todos os produtos (e tudo que pende deles: partes, materiais
--      atribuídos, regiões pintadas, tamanhos, fotos, avaliações — tudo
--      com ON DELETE CASCADE, cai junto automaticamente).
--   2. Apaga todas as categorias.
--   3. Apaga todo o catálogo de materiais (Material → Tipo → Cor).
--   4. Insere uma base de materiais pra você já começar a cadastrar
--      produtos em cima dela — PREÇOS E VELOCIDADES SÃO CHUTES RAZOÁVEIS,
--      não o custo real do seu fornecedor/impressora. Ajuste cada Tipo em
--      /admin/materiais assim que puder (preço por kg, velocidade de
--      impressão) — a calculadora de preço só fica precisa depois disso.
--
-- NÃO apaga: pedidos, pagamentos, etiquetas, avaliações não ligadas a
-- produto, contas de admin, configurações da loja. Arquivos já enviados
-- pro Supabase Storage (fotos, STL) também não são apagados por aqui —
-- eles ficam órfãos no bucket, sem custo/risco, e dá pra limpar depois
-- direto no painel do Storage se quiser.
--
-- ATENÇÃO — pode dar erro de foreign key: se existir algum PEDIDO (mesmo
-- de teste) referenciando um desses produtos, o DELETE FROM "products"
-- abaixo falha (order_items.product_id é "restrict" de propósito, pra
-- nunca apagar um produto com histórico de pedido por engano). Se isso
-- acontecer e você tiver certeza que quer apagar esses pedidos de teste
-- também, rode ANTES (fora deste script, com calma, um de cada vez):
--   DELETE FROM "custom_model_requests";
--   DELETE FROM "shipments";
--   DELETE FROM "payments";
--   DELETE FROM "order_items";
--   DELETE FROM "orders";

DELETE FROM "products";
DELETE FROM "categories";
DELETE FROM "materials";

DO $$
DECLARE
  v_plastico_id uuid;
  v_resina_id uuid;
  v_pla_id uuid;
  v_abs_id uuid;
  v_cristal_id uuid;
  v_resistente_id uuid;
BEGIN
  INSERT INTO "materials" ("name", "print_process", "allows_dual_color", "post_processing_fee_cents")
  VALUES ('Plástico', 'fdm', true, 0)
  RETURNING id INTO v_plastico_id;

  INSERT INTO "materials" ("name", "print_process", "allows_dual_color", "post_processing_fee_cents")
  VALUES ('Resina', 'resin', false, 1500)
  RETURNING id INTO v_resina_id;

  INSERT INTO "material_types" ("material_id", "name", "price_per_kg_cents", "print_speed_value", "description")
  VALUES (v_plastico_id, 'PLA', 8000, 20.00, 'Filamento mais comum, fácil de imprimir, boa qualidade de acabamento pro dia a dia.')
  RETURNING id INTO v_pla_id;

  INSERT INTO "material_types" ("material_id", "name", "price_per_kg_cents", "print_speed_value", "description")
  VALUES (v_plastico_id, 'ABS', 9000, 18.00, 'Mais resistente a temperatura que o PLA, mas empena mais fácil na impressão — pra peças que pegam sol ou calor.')
  RETURNING id INTO v_abs_id;

  INSERT INTO "material_types" ("material_id", "name", "price_per_kg_cents", "print_speed_value", "description")
  VALUES (v_resina_id, 'Cristal', 25000, 15.00, 'Translúcida, ótima pra decoração e peças com detalhe fino — mais frágil que a Resistente.')
  RETURNING id INTO v_cristal_id;

  INSERT INTO "material_types" ("material_id", "name", "price_per_kg_cents", "print_speed_value", "description")
  VALUES (v_resina_id, 'Resistente', 28000, 15.00, 'Mais resistente a impacto que a Cristal — boa pra peça funcional, não só decorativa.')
  RETURNING id INTO v_resistente_id;

  INSERT INTO "material_colors" ("material_type_id", "name", "hex_color") VALUES
    (v_pla_id, 'Branco', '#FFFFFF'),
    (v_pla_id, 'Preto', '#111111'),
    (v_pla_id, 'Azul', '#2563EB'),
    (v_pla_id, 'Vermelho', '#DC2626'),
    (v_pla_id, 'Verde', '#16A34A'),
    (v_abs_id, 'Preto', '#111111'),
    (v_abs_id, 'Branco', '#FFFFFF'),
    (v_cristal_id, 'Transparente', '#E0F2FE'),
    (v_resistente_id, 'Cinza', '#6B7280'),
    (v_resistente_id, 'Preto', '#111111');
END $$;
