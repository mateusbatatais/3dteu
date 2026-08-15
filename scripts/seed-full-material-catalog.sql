-- Rode DEPOIS de scripts/pending-migrations-0001-a-0015.sql (precisa de
-- todas as colunas/tabelas de materiais criadas até agora, incluindo
-- opacity, dual_color_fee_cents e hex_color_secondary).
--
-- Catálogo comprehensive pra uma loja de impressão 3D em FDM + resina:
-- 3 Materiais (Plástico, Flexível/TPU, Resina), 11 Tipos, 60 Cores —
-- pensado pra cobrir o que a maioria das lojas precisa de cara, sem ser
-- infinito. Ajuste/complete depois direto em /admin/materiais (a tela já
-- tem CRUD completo pros 3 níveis).
--
-- PLA/PLA Silk/ABS/PETG usam as cores REAIS vendidas pela Cliever
-- (https://cliever3d.commercesuite.com.br/filamento, conferido produto a
-- produto — PETG realmente só tem 2 cores no catálogo deles, Preto e
-- Branco; não é falta de dado, é a oferta real do fornecedor).
--
-- Os 6 Tipos de Resina (Padrão, Alta Definição, Resistente a Impacto,
-- Flexível, Cristal, ABS-like) mesclam dois fornecedores conferidos
-- produto a produto: 3D Cure
-- (https://3dcure.com.br/categoria/resina-3d/ — Basic/Pixel/Gamer/Flex/
-- ABS-like, com preço e cores reais de cada produto) e Quanton
-- (https://quanton3d.com.br/resinas/ — Spin/PyroBlast/Spark, usados só
-- pra ampliar a paleta de cor da linha "Padrão" e como referência da
-- linha "Cristal"). Linhas de nicho dos dois sites (odontologia, joalheria,
-- fundição/cera) ficaram de fora de propósito — não fazem sentido pra uma
-- loja de impressão sob encomenda geral como a 3D Teu.
--
-- TPU não tem um fornecedor de referência aqui ainda, continua com uma
-- paleta razoável genérica — manda um link se tiver um fornecedor em mente.
--
-- PREÇOS E VELOCIDADES SÃO CHUTES RAZOÁVEIS pro mercado brasileiro (os de
-- PLA/PLA Silk/ABS/PETG/Padrão/Alta Definição/Resistente a Impacto/
-- Flexível(resina)/ABS-like(resina) usam como referência os preços reais
-- vistos nos sites da Cliever/3D Cure, arredondados — só "Cristal" ficou
-- sem preço real confirmado, é uma estimativa), não o custo exato do seu
-- fornecedor — a calculadora de preço (e o preço ao vivo por material da
-- loja) só fica precisa depois de você revisar cada Tipo em
-- /admin/materiais.
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
  v_pla_silk_id uuid;
  v_petg_id uuid;
  v_abs_id uuid;
  v_tpu_id uuid;
  v_padrao_id uuid;
  v_alta_def_id uuid;
  v_cristal_id uuid;
  v_resistente_id uuid;
  v_resina_flex_id uuid;
  v_abslike_id uuid;
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
  VALUES (v_plastico_id, 'PLA', 9000, 20.00, 'O material mais popular e fácil de imprimir — bom acabamento, ideal pra decoração e protótipos. Não recomendado pra uso em áreas muito quentes (empena acima de ~60°C).')
  RETURNING id INTO v_pla_id;

  -- Linha separada da Cliever (categoria própria no site deles, preço bem
  -- acima do PLA comum) — acabamento com brilho metálico de verdade.
  INSERT INTO "material_types" ("material_id", "name", "price_per_kg_cents", "print_speed_value", "description")
  VALUES (v_plastico_id, 'PLA Silk', 11000, 20.00, 'Mesma facilidade de imprimir do PLA comum, com acabamento brilhante/metálico de verdade — ótimo pra peças decorativas que pedem um efeito premium.')
  RETURNING id INTO v_pla_silk_id;

  -- Só 2 cores mesmo — não é falta de cadastro, é a oferta real da
  -- Cliever pra PETG hoje (ver cores mais abaixo).
  INSERT INTO "material_types" ("material_id", "name", "price_per_kg_cents", "print_speed_value", "description")
  VALUES (v_plastico_id, 'PETG', 10000, 18.00, 'Mais resistente a impacto e calor que o PLA — ideal pra peças funcionais e uso ao ar livre. Levemente flexível, com brilho natural.')
  RETURNING id INTO v_petg_id;

  INSERT INTO "material_types" ("material_id", "name", "price_per_kg_cents", "print_speed_value", "description")
  VALUES (v_plastico_id, 'ABS', 8500, 18.00, 'Resistente a impacto e temperatura, clássico da indústria — exige impressora com câmara fechada, empena mais fácil que PLA/PETG na hora de imprimir.')
  RETURNING id INTO v_abs_id;

  INSERT INTO "material_types" ("material_id", "name", "price_per_kg_cents", "print_speed_value", "description")
  VALUES (v_flexivel_id, 'TPU 95A', 12000, 10.00, 'Material flexível e emborrachado — ideal pra capinhas, solados, peças que precisam dobrar ou absorver impacto. Imprime bem mais devagar que PLA/PETG.')
  RETURNING id INTO v_tpu_id;

  -- Preço real da 3D Cure Basic (R$149,00/kg) — linha de uso geral,
  -- equivalente à "Spin"/"PyroBlast" da Quanton.
  INSERT INTO "material_types" ("material_id", "name", "price_per_kg_cents", "print_speed_value", "description")
  VALUES (v_resina_id, 'Padrão', 14900, 15.00, 'Resina rígida de uso geral, ótimo custo-benefício e bom acabamento — a mais indicada pra quem tá começando ou quer o dia a dia da loja.')
  RETURNING id INTO v_padrao_id;

  -- Preço real da 3D Cure Pixel (R$189,00/kg) — feita pra impressoras LCD
  -- 8K/12K/14K, pigmentação densa que realça muito detalhe.
  INSERT INTO "material_types" ("material_id", "name", "price_per_kg_cents", "print_speed_value", "description")
  VALUES (v_resina_id, 'Alta Definição', 18900, 15.00, 'Detalhe superior pra impressoras LCD de alta resolução — ideal pra miniaturas, joias e maquetes. Mais indicada pra peça de exposição do que peça manuseada com frequência.')
  RETURNING id INTO v_alta_def_id;

  -- Preço real da 3D Cure Gamer (R$219,00/kg) — pensada pra ter mais
  -- resistência a impacto que a Alta Definição, pra peças que são
  -- manuseadas (miniaturas de jogo, action figures).
  INSERT INTO "material_types" ("material_id", "name", "price_per_kg_cents", "print_speed_value", "description")
  VALUES (v_resina_id, 'Resistente a Impacto', 21900, 15.00, 'Equilíbrio entre detalhe e resistência a queda/impacto — ideal pra figures e miniaturas que vão ser manuseados de verdade, não só expostos.')
  RETURNING id INTO v_resistente_id;

  -- Preço real da 3D Cure Flex (R$179,00/kg).
  INSERT INTO "material_types" ("material_id", "name", "price_per_kg_cents", "print_speed_value", "description")
  VALUES (v_resina_id, 'Flexível', 17900, 12.00, 'Resina elástica, pra peças que precisam dobrar, vedar ou absorver impacto (pneus de miniatura, o-rings, protótipos funcionais) — não é biocompatível.')
  RETURNING id INTO v_resina_flex_id;

  -- Sem preço real confirmado nos dois sites (a Quanton não lista preço
  -- por kg claramente pra "Spark") — estimativa a partir do padrão de
  -- preço das outras linhas de detalhe.
  INSERT INTO "material_types" ("material_id", "name", "price_per_kg_cents", "print_speed_value", "description")
  VALUES (v_resina_id, 'Cristal', 20000, 15.00, 'Transparente de verdade (não só translúcida) — pensada pra peças decorativas com efeito de vidro/cristal. Mais frágil que as outras linhas.')
  RETURNING id INTO v_cristal_id;

  -- Preço real da 3D Cure ABS-like (R$229,00/kg) — resina de engenharia,
  -- simula a resistência mecânica do ABS.
  INSERT INTO "material_types" ("material_id", "name", "price_per_kg_cents", "print_speed_value", "description")
  VALUES (v_resina_id, 'ABS-like (Engenharia)', 22900, 15.00, 'Alta tenacidade e resistência a impacto, simulando o comportamento do ABS — pra peça técnica/funcional, não decorativa.')
  RETURNING id INTO v_abslike_id;

  -- ---------------------------------------------------------------------
  -- Cores
  -- ---------------------------------------------------------------------

  -- PLA: cores reais da linha "PLA Premium" da Cliever (Essencial +
  -- Metalizada + Perolada + Fluorescente + Suave, todas a mesma
  -- formulação de PLA — só muda o pigmento/acabamento, por isso ficam
  -- juntas num Tipo só). Incluídas mesmo as que estavam "esgotado" no
  -- site no momento da consulta — são cores reais da linha, só uma
  -- questão de estoque, não deixam de existir no catálogo do fornecedor.
  -- "Marmorizado" ficou de fora de propósito: é um efeito de mistura
  -- dentro do próprio filamento, não dá pra representar com um hex só.
  -- 2 combinações dual-color de exemplo no final (hex_color_secondary
  -- preenchido) já que allows_dual_color=true no Plástico — o admin pode
  -- criar mais combinações em /admin/materiais.
  INSERT INTO "material_colors" ("material_type_id", "name", "hex_color", "hex_color_secondary", "opacity") VALUES
    (v_pla_id, 'Preto', '#171717', NULL, 1),
    (v_pla_id, 'Branco', '#FFFFFF', NULL, 1),
    (v_pla_id, 'Vermelho', '#DC2626', NULL, 1),
    (v_pla_id, 'Amarelo', '#EAB308', NULL, 1),
    (v_pla_id, 'Azul Cobalto', '#1E3A8A', NULL, 1),
    (v_pla_id, 'Verde', '#16A34A', NULL, 1),
    (v_pla_id, 'Cinza', '#9CA3AF', NULL, 1),
    (v_pla_id, 'Azul Céu', '#38BDF8', NULL, 1),
    (v_pla_id, 'Verde Tiffany', '#0ABAB5', NULL, 1),
    (v_pla_id, 'Azul Metalizado', '#4A6FA5', NULL, 1),
    (v_pla_id, 'Rose Metalizado', '#B76E79', NULL, 1),
    (v_pla_id, 'Preto Perolado', '#262626', NULL, 1),
    (v_pla_id, 'Azul Escuro Perolado', '#1E2A4A', NULL, 1),
    (v_pla_id, 'Verde Fluorescente', '#ADFF2F', NULL, 1),
    (v_pla_id, 'Amarelo Fluorescente', '#FFFF33', NULL, 1),
    (v_pla_id, 'Rosa Fluorescente', '#FF1493', NULL, 1),
    (v_pla_id, 'Lilás Aurora', '#C4A7E7', NULL, 1),
    (v_pla_id, 'Bege Marfim', '#F0E6D2', NULL, 1),
    (v_pla_id, 'Laranja', '#F97316', NULL, 1),
    (v_pla_id, 'Alumínio', '#A8A9AD', NULL, 1),
    (v_pla_id, 'Marrom', '#78350F', NULL, 1),
    (v_pla_id, 'Roxo', '#7C3AED', NULL, 1),
    (v_pla_id, 'Rosa Claro', '#FBCFE8', NULL, 1),
    (v_pla_id, 'Natural (transparente)', '#F5F0E1', NULL, 0.5),
    (v_pla_id, 'Azul/Laranja', '#2563EB', '#F97316', 1),
    (v_pla_id, 'Preto/Branco', '#171717', '#FFFFFF', 1);

  -- PLA Silk: as 3 únicas cores reais da linha Silk da Cliever — todas
  -- com acabamento metálico de verdade (não é só um hex "dourado", é a
  -- descrição do Tipo que já avisa do brilho).
  INSERT INTO "material_colors" ("material_type_id", "name", "hex_color") VALUES
    (v_pla_silk_id, 'Gold', '#D4AF37'),
    (v_pla_silk_id, 'Bronze', '#8C5E2A'),
    (v_pla_silk_id, 'Silver', '#C0C0C0');

  -- PETG: só 2 cores mesmo (Preto e Branco) — oferta real da Cliever,
  -- não uma paleta incompleta por engano.
  INSERT INTO "material_colors" ("material_type_id", "name", "hex_color") VALUES
    (v_petg_id, 'Preto', '#171717'),
    (v_petg_id, 'Branco', '#FFFFFF');

  -- ABS: as 6 cores reais da linha "ABS Premium" da Cliever (fora a
  -- "ABS Econômico", que é uma linha de preço mais baixo, não uma cor).
  INSERT INTO "material_colors" ("material_type_id", "name", "hex_color") VALUES
    (v_abs_id, 'Preto', '#171717'),
    (v_abs_id, 'Branco', '#FFFFFF'),
    (v_abs_id, 'Cinza', '#9CA3AF'),
    (v_abs_id, 'Amarelo', '#EAB308'),
    (v_abs_id, 'Vermelho', '#DC2626'),
    (v_abs_id, 'Azul', '#2563EB');

  INSERT INTO "material_colors" ("material_type_id", "name", "hex_color", "opacity") VALUES
    (v_tpu_id, 'Preto', '#171717', 1),
    (v_tpu_id, 'Branco', '#FFFFFF', 1),
    (v_tpu_id, 'Transparente', '#E5F3FF', 0.45);

  -- Padrão: mescla as cores reais da 3D Cure Basic (Cinza Claro, Clear,
  -- Skin) com as da linha Spin/PyroBlast da Quanton (mesma categoria de
  -- "uso geral" nos dois fornecedores) — paleta bem mais ampla que uma
  -- resina de nicho, faz sentido pra linha mais vendida da loja.
  INSERT INTO "material_colors" ("material_type_id", "name", "hex_color", "opacity") VALUES
    (v_padrao_id, 'Cinza Claro', '#B0B3B8', 1),
    (v_padrao_id, 'Cinza Escuro', '#4B5563', 1),
    (v_padrao_id, 'Branco', '#FFFFFF', 1),
    (v_padrao_id, 'Preto', '#171717', 1),
    (v_padrao_id, 'Skin', '#E8B796', 1),
    (v_padrao_id, 'Azul', '#2563EB', 1),
    (v_padrao_id, 'Verde', '#16A34A', 1),
    (v_padrao_id, 'Amarelo', '#EAB308', 1),
    (v_padrao_id, 'Ocre', '#C08552', 1),
    (v_padrao_id, 'Transparente', '#E0F2FE', 0.4);

  -- Alta Definição: só 1 cor mesmo — oferta real da 3D Cure Pixel hoje
  -- (pigmentação pensada só pra realçar detalhe, não pra variedade de cor).
  INSERT INTO "material_colors" ("material_type_id", "name", "hex_color") VALUES
    (v_alta_def_id, 'Cinza Claro', '#B0B3B8');

  -- Resistente a Impacto: as 4 cores reais da 3D Cure Gamer.
  INSERT INTO "material_colors" ("material_type_id", "name", "hex_color", "opacity") VALUES
    (v_resistente_id, 'Cinza', '#6B7280', 1),
    (v_resistente_id, 'Cinza Claro', '#B0B3B8', 1),
    (v_resistente_id, 'Preto', '#171717', 1),
    (v_resistente_id, 'Transparente', '#E0F2FE', 0.35);

  -- Flexível: as 2 cores reais da 3D Cure Flex (a Clear é justamente pra
  -- quem quer colorir com pigmento à parte).
  INSERT INTO "material_colors" ("material_type_id", "name", "hex_color", "opacity") VALUES
    (v_resina_flex_id, 'Transparente', '#E0F2FE', 0.5),
    (v_resina_flex_id, 'Preto', '#171717', 1);

  -- Cristal: uma cor só de propósito — é justamente a linha "só
  -- transparente" (equivalente à Spark da Quanton).
  INSERT INTO "material_colors" ("material_type_id", "name", "hex_color", "opacity") VALUES
    (v_cristal_id, 'Transparente', '#E0F2FE', 0.3);

  -- ABS-like: as 2 cores reais da 3D Cure ABS-like.
  INSERT INTO "material_colors" ("material_type_id", "name", "hex_color", "opacity") VALUES
    (v_abslike_id, 'Cinza Claro', '#B0B3B8', 1),
    (v_abslike_id, 'Transparente', '#E0F2FE', 0.4);
END $$;
