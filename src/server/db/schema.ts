import { relations } from "drizzle-orm";
import {
  boolean,
  integer,
  jsonb,
  numeric,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

// ---------------------------------------------------------------------------
// Enums
// ---------------------------------------------------------------------------

export const productStatusEnum = pgEnum("product_status", ["draft", "published"]);

// Não usado por nenhuma coluna mais (a hierarquia Material→Tipo→Cor da Fase
// 1 do ROADMAP.md substituiu `filament_options`) — mantido declarado de
// propósito, sem uso, só pra `drizzle-kit generate` não confundir "esse enum
// sumiu" com "isso virou material_print_process" e pedir confirmação
// interativa (não tem TTY disponível nesta sessão pra responder). Seguro
// remover numa limpeza futura, depois que a migração desta rodada rodar.
export const filamentTypeEnum = pgEnum("filament_type", ["solid_color", "dual_color", "special"]);

// Determina qual fórmula de tempo de impressão usar (ver
// src/features/catalog/print-estimate.ts): FDM imprime camada por camada
// depositando material (tempo ~ proporcional ao peso), resina cura uma
// camada inteira de cada vez (tempo ~ proporcional à altura da peça).
export const materialPrintProcessEnum = pgEnum("material_print_process", ["fdm", "resin"]);

export const orderStatusEnum = pgEnum("order_status", [
  "awaiting_payment",
  "paid",
  "printing",
  "ready",
  "shipped",
  "delivered",
  "canceled",
]);

export const deliveryMethodEnum = pgEnum("delivery_method", ["pickup", "superfrete"]);

export const paymentProviderEnum = pgEnum("payment_provider", ["woovi", "asaas"]);

export const paymentStatusEnum = pgEnum("payment_status", [
  "pending",
  "paid",
  "expired",
  "failed",
  "refunded",
]);

export const adminRoleEnum = pgEnum("admin_role", ["admin", "editor"]);

export const shipmentStatusEnum = pgEnum("shipment_status", ["pending", "purchased", "error"]);

// Fase 4 do ROADMAP.md: pedido de modelo 3D customizado via IA (Meshy).
// pending = criado, ainda não chamou a Meshy; generating = task enviada;
// ready = malha gerada e re-hospedada, cliente pode escolher material e
// confirmar; failed = a Meshy falhou (crédito, moderação, etc.); confirmed
// = virou um pedido de verdade (ver productId/orderId abaixo).
export const customModelRequestStatusEnum = pgEnum("custom_model_request_status", [
  "pending",
  "generating",
  "ready",
  "failed",
  "confirmed",
]);

// ai = cliente subiu fotos, a Meshy gerou a malha (fluxo original acima).
// upload = cliente já tinha o próprio STL/OBJ/3MF e só quer um orçamento —
// pula pending/generating inteiramente, nasce direto em "ready" (ver
// submitDirectMeshModelRequest). Não cobra customModelFeeCents (essa taxa
// cobre o crédito de IA gasto, que não existe nesse caminho).
export const customModelRequestOriginEnum = pgEnum("custom_model_request_origin", ["ai", "upload"]);

// ---------------------------------------------------------------------------
// Catálogo
// ---------------------------------------------------------------------------

export const categories = pgTable("categories", {
  id: uuid("id").defaultRandom().primaryKey(),
  slug: text("slug").notNull().unique(),
  name: text("name").notNull(),
  description: text("description"),
  // Banner da página da categoria e do tile na home — null cai num
  // gradiente com a cor da marca (mesmo padrão já usado pra thumbnail de
  // produto sem foto em getPublishedProductsForCatalog).
  imageUrl: text("image_url"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const products = pgTable("products", {
  id: uuid("id").defaultRandom().primaryKey(),
  slug: text("slug").notNull().unique(),
  name: text("name").notNull(),
  description: text("description"),
  categoryId: uuid("category_id").references(() => categories.id, { onDelete: "set null" }),
  status: productStatusEnum("status").default("draft").notNull(),
  // valores monetários sempre em centavos (inteiro) para evitar erro de ponto flutuante
  basePriceCents: integer("base_price_cents").notNull(),
  weightGrams: integer("weight_grams"),
  printTimeMinutes: integer("print_time_minutes"),
  // Dimensões da embalagem para cotação/etiqueta de frete — null nos produtos
  // cadastrados antes desta coluna existir; a cotação usa um fallback de
  // caixa pequena nesse caso (ver src/features/shipping/superfrete.ts).
  heightCm: integer("height_cm"),
  widthCm: integer("width_cm"),
  lengthCm: integer("length_cm"),
  metaTitle: text("meta_title"),
  metaDescription: text("meta_description"),
  ogImageUrl: text("og_image_url"),
  // Posição inicial da câmera no preview 3D interativo — o admin escolhe
  // girando o modelo (ver ProductViewerAngleControl) e salva o ponto
  // atual; null usa o ângulo padrão de sempre (canto/diagonal). Só a
  // DIREÇÃO importa (o Bounds do drei recalcula a distância/zoom sozinho
  // a partir dela, nunca o ângulo) — por isso basta um vetor, sem escala.
  viewerCameraPosition: jsonb("viewer_camera_position"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

// Uma ou mais partes/malhas por produto (1 para peça única, N para multi-peça/multi-cor).
export const productParts = pgTable("product_parts", {
  id: uuid("id").defaultRandom().primaryKey(),
  productId: uuid("product_id")
    .notNull()
    .references(() => products.id, { onDelete: "cascade" }),
  name: text("name").notNull(), // ex.: "corpo", "tampa"
  sortOrder: integer("sort_order").default(0).notNull(),
  // Hoje o upload grava o mesmo STL nas duas colunas: o preview 3D carrega o
  // STL direto no navegador (three-stdlib STLLoader), sem conversão pra GLB.
  // meshFileUrl existe separado pra permitir trocar por um GLB otimizado no
  // futuro sem mudar o preview; stlFileUrl é sempre o arquivo original.
  meshFileUrl: text("mesh_file_url"),
  stlFileUrl: text("stl_file_url"),
  // Pré-seleciona essa cor quando o cliente abre a página do produto, em vez
  // da primeira da lista (ordem arbitrária) — admin escolhe qual fica bonito
  // por padrão. Null = usa a primeira da lista, como antes. Nome da coluna
  // física ficou o antigo (default_filament_option_id) de propósito — só a
  // FK muda de alvo (agora aponta pra material_colors), pra não precisar de
  // um rename de coluna que o drizzle-kit não consegue distinguir de "isso
  // virou outra coisa" sem um prompt interativo (sem TTY nesta sessão).
  defaultMaterialColorId: uuid("default_filament_option_id").references(() => materialColors.id, {
    onDelete: "set null",
  }),
  // Peso só desta peça (não o agregado do produto) — medido a partir do
  // próprio arquivo 3D dela (measureMesh/estimatePrintWeight), gravado
  // junto da confirmação do upload. Null até a peça ter um arquivo
  // confirmado (nunca retroagido pra peças que já tinham arquivo antes
  // desta coluna existir — precisa reenviar o mesmo arquivo uma vez).
  // Alimenta o cálculo de preço ao vivo por material/cor (pricing.ts).
  weightGrams: integer("weight_grams"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

// Regiões pintadas dentro de um único arquivo .3mf (pintura MMU da
// PrusaSlicer/BambuStudio) — a parte continua sendo 1 arquivo, mas o cliente
// escolhe uma cor por região em vez de uma cor pra peça inteira. É só
// metadado (rótulo + qual "estado"/extrusora pintado corresponde); a
// geometria em si nunca é armazenada aqui — é sempre re-lida do arquivo
// original no navegador (ver src/features/catalog/mmu-3mf.ts).
export const productPartRegions = pgTable(
  "product_part_regions",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    productPartId: uuid("product_part_id")
      .notNull()
      .references(() => productParts.id, { onDelete: "cascade" }),
    // Estado decodificado do arquivo pintado: 0 = região padrão/sem pintura, 1-16 = Extrusora 1-16.
    paintState: integer("paint_state").notNull(),
    label: text("label").notNull(),
    // Uma região detectada errado (ruído da segmentação MMU) pode ser
    // escondida do cliente sem precisar reenviar o arquivo — continua
    // renderizando no preview com defaultMaterialColorId, só não aparece
    // como opção configurável na loja.
    enabled: boolean("enabled").default(true).notNull(),
    // Mesma ideia do default por parte (acima), mas por região — cai pro
    // padrão da parte quando null. Nome físico antigo mantido pelo mesmo
    // motivo do comentário em productParts.defaultMaterialColorId.
    defaultMaterialColorId: uuid("default_filament_option_id").references(() => materialColors.id, {
      onDelete: "set null",
    }),
    sortOrder: integer("sort_order").default(0).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [uniqueIndex("product_part_region_state_unique").on(table.productPartId, table.paintState)],
);

// Tabela antiga (lista achatada de cores, sem noção de material físico) —
// substituída pela hierarquia Material→Tipo→Cor abaixo (ver ROADMAP.md
// "Fase 1"). Não referenciada por nenhum código mais; mantida declarada de
// propósito (mesmo motivo do filamentTypeEnum acima) só pra `drizzle-kit
// generate` não confundir "essa tabela sumiu" com "virou material_colors"
// (colunas parecidas o bastante pra disparar o prompt de rename, sem TTY
// disponível nesta sessão pra responder). Seguro dropar numa limpeza futura.
export const filamentOptions = pgTable("filament_options", {
  id: uuid("id").defaultRandom().primaryKey(),
  type: filamentTypeEnum("type").notNull(),
  name: text("name").notNull(),
  hexColor: text("hex_color"),
  hexColorSecondary: text("hex_color_secondary"),
  swatchImageUrl: text("swatch_image_url"),
  priceModifierCents: integer("price_modifier_cents").default(0).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

// ---------------------------------------------------------------------------
// Materiais: hierarquia Material (Resina/Plástico) → Tipo (PLA, Cristal...) →
// Cor. Substitui a antiga `filament_options` (lista achatada de cores sem
// noção de material físico nenhuma) — ver ROADMAP.md "Fase 1" pro desenho
// completo e o porquê de cada campo.
// ---------------------------------------------------------------------------

export const materials = pgTable("materials", {
  id: uuid("id").defaultRandom().primaryKey(),
  name: text("name").notNull(), // "Resina" | "Plástico"
  printProcess: materialPrintProcessEnum("print_process").notNull(),
  // Regra de negócio, não limitação técnica: hoje só Plástico permite
  // dual-color. Reforçado no servidor (nunca só escondendo o campo na UI —
  // mesma lição da rodada 14, onde um form sem validação no back deixou
  // gravar dual-color em material que não devia ter 2ª cor).
  allowsDualColor: boolean("allows_dual_color").default(false).notNull(),
  // Mão de obra de pós-processamento (lavagem/cura/remoção de suporte) —
  // não escala com o peso da peça como o custo de material, por isso é uma
  // taxa fixa por peça, não por grama. Normalmente só Resina tem valor > 0.
  postProcessingFeeCents: integer("post_processing_fee_cents").default(0).notNull(),
  // Taxa fixa por peça/região quando a cor escolhida é dual-color — some
  // filamento com 2ª cor custa mais e imprime mais devagar (mais trocas).
  // Fixa (não por grama) pelo mesmo motivo de postProcessingFeeCents.
  dualColorFeeCents: integer("dual_color_fee_cents").default(0).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const materialTypes = pgTable("material_types", {
  id: uuid("id").defaultRandom().primaryKey(),
  materialId: uuid("material_id")
    .notNull()
    .references(() => materials.id, { onDelete: "cascade" }),
  name: text("name").notNull(), // "PLA", "ABS", "Cristal", "Dental"...
  pricePerKgCents: integer("price_per_kg_cents").notNull(),
  // Unidade depende de materials.printProcess: g/hora pra FDM, mm de
  // altura/hora pra resina (ver estimatePrintTimeHours em print-estimate.ts).
  printSpeedValue: numeric("print_speed_value", { precision: 8, scale: 2 }).notNull(),
  // Texto livre explicando pra que esse tipo é indicado (ex.: "translúcida,
  // ótima pra decoração") — exibido pro cliente no configurador.
  description: text("description"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const materialColors = pgTable("material_colors", {
  id: uuid("id").defaultRandom().primaryKey(),
  materialTypeId: uuid("material_type_id")
    .notNull()
    .references(() => materialTypes.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  hexColor: text("hex_color"),
  // Só permitido quando materials.allowsDualColor = true pro material dono
  // do tipo desta cor (validado em material-actions.ts, nunca só no form).
  hexColorSecondary: text("hex_color_secondary"),
  // 1 = opaco (padrão, comportamento de sempre). Menor que 1 deixa a peça
  // translúcida no preview 3D — pensado pra resina tipo "Cristal", mas
  // disponível em qualquer cor (numeric pra permitir qualquer grau, não só
  // "transparente sim/não").
  opacity: numeric("opacity", { precision: 3, scale: 2 }).default("1").notNull(),
  // "Tem em estoque?" — controlado manualmente pelo admin no cadastro de
  // materiais, nasce true. Só cores available=true aparecem pro cliente
  // escolher (ver getProductBySlug em queries.ts); sem estoque, o admin
  // desmarca em vez de excluir a cor (excluir é só pra corrigir cadastro
  // errado, ver checkMaterialColorDeletionImpact).
  available: boolean("available").default(true).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

// Tabela antiga (curava cor por cor, por parte) — substituída por
// productPartMaterialTypes abaixo: a peça passou a aceitar Tipos inteiros de
// material, não cores individuais (as cores oferecidas viram TODAS as
// disponíveis desses Tipos, geral do catálogo). Não referenciada por nenhum
// código mais; mantida declarada de propósito (mesmo motivo de
// filamentOptions acima) só pra `drizzle-kit generate` não confundir "essa
// tabela sumiu" com "virou productPartMaterialTypes". Seguro dropar numa
// limpeza futura.
export const productPartMaterialOptions = pgTable(
  "product_part_material_options",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    productPartId: uuid("product_part_id")
      .notNull()
      .references(() => productParts.id, { onDelete: "cascade" }),
    // Nome físico antigo mantido (filament_option_id) pelo mesmo motivo dos
    // outros campos renomeados só no lado TS desta tabela — evita rename de
    // coluna ambíguo pro drizzle-kit (sem TTY nesta sessão pra confirmar).
    materialColorId: uuid("filament_option_id")
      .notNull()
      .references(() => materialColors.id, { onDelete: "cascade" }),
  },
  (table) => [
    uniqueIndex("product_part_material_unique").on(
      table.productPartId,
      table.materialColorId,
    ),
  ],
);

// Quais Tipos de material cada parte de produto aceita (ex.: uma peça pode
// aceitar "Plástico · PLA" e "Resina · Cristal" ao mesmo tempo) — as cores
// oferecidas pro cliente são todas as disponíveis (material_colors.available)
// desses Tipos, não uma seleção por produto. A única curadoria que sobra por
// peça/região é a cor PADRÃO (productParts.defaultMaterialColorId /
// productPartRegions.defaultMaterialColorId, inalterados).
export const productPartMaterialTypes = pgTable(
  "product_part_material_types",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    productPartId: uuid("product_part_id")
      .notNull()
      .references(() => productParts.id, { onDelete: "cascade" }),
    materialTypeId: uuid("material_type_id")
      .notNull()
      .references(() => materialTypes.id, { onDelete: "cascade" }),
  },
  (table) => [
    uniqueIndex("product_part_material_type_unique").on(
      table.productPartId,
      table.materialTypeId,
    ),
  ],
);

// Quais Tipos de material o admin recomenda pra produtos de uma categoria
// (ex.: "Decoração" recomenda Resina Cristal + Plástico PLA) — Fase 1b do
// ROADMAP.md. Recomendação no nível de Tipo, não de Cor específica: mais
// simples de configurar ("recomendo PLA", não "recomendo o PLA azul"). Só
// afeta o que vem marcado por padrão ao cadastrar um produto nessa
// categoria — o admin sempre pode marcar outras cores manualmente.
export const categoryRecommendedMaterialTypes = pgTable(
  "category_recommended_material_types",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    categoryId: uuid("category_id")
      .notNull()
      .references(() => categories.id, { onDelete: "cascade" }),
    materialTypeId: uuid("material_type_id")
      .notNull()
      .references(() => materialTypes.id, { onDelete: "cascade" }),
  },
  (table) => [
    uniqueIndex("category_recommended_material_type_unique").on(table.categoryId, table.materialTypeId),
  ],
);

export const sizeOptions = pgTable("size_options", {
  id: uuid("id").defaultRandom().primaryKey(),
  productId: uuid("product_id")
    .notNull()
    .references(() => products.id, { onDelete: "cascade" }),
  label: text("label").notNull(), // "P" / "M" / "G" ou medida explícita
  scaleFactor: numeric("scale_factor", { precision: 5, scale: 3 }).default("1").notNull(),
  priceModifierCents: integer("price_modifier_cents").default(0).notNull(),
  weightModifierGrams: integer("weight_modifier_grams").default(0).notNull(),
  sortOrder: integer("sort_order").default(0).notNull(),
});

// Fotos/gifs reais do produto impresso — complementam (não substituem) o
// preview 3D e alimentam a imagem de Open Graph quando existirem.
export const productImages = pgTable("product_images", {
  id: uuid("id").defaultRandom().primaryKey(),
  productId: uuid("product_id")
    .notNull()
    .references(() => products.id, { onDelete: "cascade" }),
  url: text("url").notNull(),
  position: integer("position").default(0).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

// Avaliação de um produto — exige conta (customerId nunca é null; sem
// checkout de convidado pra isso, evita review anônima/spam fácil). Não
// exige compra verificada nesta v1 (qualquer cliente logado pode avaliar
// qualquer produto) — poderia cruzar com order_items no futuro se virar
// problema de verdade. customerName é um snapshot (igual
// orders.customerName) porque auth.users vive num schema do Supabase que o
// Drizzle não gerencia, não dá pra fazer join direto.
export const productReviews = pgTable(
  "product_reviews",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    productId: uuid("product_id")
      .notNull()
      .references(() => products.id, { onDelete: "cascade" }),
    customerId: uuid("customer_id").notNull(),
    customerName: text("customer_name").notNull(),
    rating: integer("rating").notNull(),
    comment: text("comment"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [uniqueIndex("product_review_customer_unique").on(table.productId, table.customerId)],
);

// ---------------------------------------------------------------------------
// Pedidos
// ---------------------------------------------------------------------------

export const orders = pgTable("orders", {
  id: uuid("id").defaultRandom().primaryKey(),
  // usado no link público de rastreio (/pedido/[token]) — não expõe o id sequencial do pedido
  publicToken: uuid("public_token").defaultRandom().notNull().unique(),
  customerName: text("customer_name").notNull(),
  customerEmail: text("customer_email").notNull(),
  customerPhone: text("customer_phone"),
  // Preenchido só quando o pedido é feito com uma sessão ativa (Supabase
  // Auth) — checkout continua funcionando 100% como convidado sem isso.
  // Sem FK de propósito: auth.users vive num schema do Supabase que o
  // Drizzle não gerencia (mesmo padrão de admin_users.id, acima).
  customerId: uuid("customer_id"),
  status: orderStatusEnum("status").default("awaiting_payment").notNull(),
  deliveryMethod: deliveryMethodEnum("delivery_method").notNull(),
  shippingAddress: jsonb("shipping_address"), // null quando deliveryMethod = "pickup"
  shippingCostCents: integer("shipping_cost_cents").default(0).notNull(),
  // Serviço da Superfrete cotado/escolhido no checkout — guardados pra poder
  // re-cotar o mesmo serviço na hora de comprar a etiqueta (ver `shipments`).
  shippingCarrierName: text("shipping_carrier_name"),
  shippingServiceId: text("shipping_service_id"),
  totalCents: integer("total_cents").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export const orderItems = pgTable("order_items", {
  id: uuid("id").defaultRandom().primaryKey(),
  orderId: uuid("order_id")
    .notNull()
    .references(() => orders.id, { onDelete: "cascade" }),
  productId: uuid("product_id")
    .notNull()
    .references(() => products.id, { onDelete: "restrict" }),
  productNameSnapshot: text("product_name_snapshot").notNull(),
  quantity: integer("quantity").default(1).notNull(),
  // snapshot completo da configuração escolhida (tamanho + material por parte).
  // Guardado em JSON porque preços/opções do catálogo podem mudar após a compra
  // e o pedido precisa preservar exatamente o que foi vendido.
  configuration: jsonb("configuration").notNull(),
  unitPriceCents: integer("unit_price_cents").notNull(),
  subtotalCents: integer("subtotal_cents").notNull(),
});

export const payments = pgTable("payments", {
  id: uuid("id").defaultRandom().primaryKey(),
  orderId: uuid("order_id")
    .notNull()
    .references(() => orders.id, { onDelete: "cascade" }),
  provider: paymentProviderEnum("provider").notNull(),
  externalId: text("external_id"),
  status: paymentStatusEnum("status").default("pending").notNull(),
  pixQrCode: text("pix_qr_code"),
  pixCopyPaste: text("pix_copy_paste"),
  rawWebhookPayload: jsonb("raw_webhook_payload"), // payload bruto do webhook, para auditoria
  paidAt: timestamp("paid_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

// Etiqueta de envio comprada via Superfrete para um pedido — espelha o
// formato de `payments` (provider + externalId + status + payload bruto).
// Uma linha só é criada quando o admin confirma a compra (nunca automático,
// já que isso gasta saldo real da carteira Superfrete).
export const shipments = pgTable("shipments", {
  id: uuid("id").defaultRandom().primaryKey(),
  orderId: uuid("order_id")
    .notNull()
    .unique()
    .references(() => orders.id, { onDelete: "cascade" }),
  provider: text("provider").default("superfrete").notNull(),
  externalId: text("external_id"),
  trackingCode: text("tracking_code"),
  labelUrl: text("label_url"),
  status: shipmentStatusEnum("status").default("pending").notNull(),
  rawPayload: jsonb("raw_payload"), // resposta bruta da Superfrete, para auditoria
  purchasedAt: timestamp("purchased_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

// Fase 4 do ROADMAP.md: cliente sobe 1-4 fotos, o servidor chama a Meshy
// (image-to-3d) e, se o cliente confirmar depois de ver o preview, isso
// vira um pedido de verdade — ver src/features/custom-models. Sem FK pra
// auth.users (mesmo padrão de orders.customerId): esse schema fica num
// schema do Supabase que o Drizzle não gerencia.
export const customModelRequests = pgTable("custom_model_requests", {
  id: uuid("id").defaultRandom().primaryKey(),
  customerId: uuid("customer_id").notNull(),
  description: text("description").notNull(),
  photoUrls: jsonb("photo_urls").notNull(), // string[] — URLs públicas no bucket custom-model-photos; [] pra origin="upload"
  origin: customModelRequestOriginEnum("origin").default("ai").notNull(),
  status: customModelRequestStatusEnum("status").default("pending").notNull(),
  meshyTaskId: text("meshy_task_id"),
  // Arquivo/preview gerados pela Meshy são re-hospedados nos buckets já
  // existentes (models/product-media) assim que a task termina — a URL da
  // Meshy em si expira depois de um tempo.
  meshFileUrl: text("mesh_file_url"),
  thumbnailUrl: text("thumbnail_url"),
  // Medidos no servidor a partir do STL baixado da Meshy (measureMeshFromBuffer)
  // — nunca confiados do cliente, já que alimentam o cálculo do preço final.
  weightGrams: numeric("weight_grams", { precision: 10, scale: 2 }),
  widthMm: numeric("width_mm", { precision: 10, scale: 2 }),
  heightMm: numeric("height_mm", { precision: 10, scale: 2 }),
  depthMm: numeric("depth_mm", { precision: 10, scale: 2 }),
  consumedCredits: integer("consumed_credits"),
  errorMessage: text("error_message"),
  // Preenchidos só quando o cliente confirma o pedido (status vira "confirmed").
  productId: uuid("product_id").references(() => products.id, { onDelete: "set null" }),
  orderId: uuid("order_id").references(() => orders.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

// ---------------------------------------------------------------------------
// Configuração da loja
// ---------------------------------------------------------------------------

// Linha única (id fixo "default") com os dados do remetente usados para
// emitir etiquetas de frete — preenchido em /admin/configuracoes.
export const storeSettings = pgTable("store_settings", {
  id: text("id").primaryKey().default("default"),
  senderName: text("sender_name"),
  senderDocument: text("sender_document"), // CPF ou CNPJ
  senderPhone: text("sender_phone"),
  zipCode: text("zip_code"),
  street: text("street"),
  number: text("number"),
  complement: text("complement"),
  neighborhood: text("neighborhood"),
  city: text("city"),
  state: text("state"),
  // Sugestão de preço "v1" (rodada 22), substituída pela calculadora
  // completa da Fase 1 (material + energia + pós-processamento + margem,
  // abaixo). Não lida/gravada por nenhum código mais — mantida declarada só
  // pra `drizzle-kit generate` não confundir "esse campo sumiu" com "virou
  // um dos campos novos abaixo" e pedir confirmação interativa (sem TTY
  // disponível nesta sessão). Seguro dropar numa limpeza futura.
  pricePerGramCents: integer("price_per_gram_cents"),
  // Usada só pra sugerir um preço base ao cadastrar produto — nunca
  // aplicada automaticamente, o admin sempre confirma clicando. Somada por
  // cima do custo calculado (material + energia + pós-processamento +
  // margem, ver print-estimate.ts) — representa taxas fixas por pedido
  // (embalagem, etc.) que não variam por material.
  fixedFeeCents: integer("fixed_fee_cents"),
  // Config global da calculadora de preço (rodada Fase 1 do roadmap) — um
  // valor só pra loja inteira, não por material/impressora. Null = ainda
  // não configurado, a sugestão de preço fica indisponível até preencher.
  energyPriceCentsPerKwh: integer("energy_price_cents_per_kwh"),
  printerPowerWatts: integer("printer_power_watts"),
  profitMarginPercent: numeric("profit_margin_percent", { precision: 5, scale: 2 }),
  // Fase 4 do ROADMAP.md: somada por cima do custo de material calculado
  // (estimateMaterialCost) num pedido de modelo customizado via IA — cobre
  // o crédito gasto na geração + o trabalho extra de acompanhar o pedido.
  // Null = confirmação de modelo customizado fica bloqueada até configurar.
  customModelFeeCents: integer("custom_model_fee_cents"),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

// ---------------------------------------------------------------------------
// Admin
// ---------------------------------------------------------------------------

// Espelha o id de auth.users (gerenciado pelo Supabase Auth) — ter uma linha
// aqui é o que concede acesso ao painel /admin.
export const adminUsers = pgTable("admin_users", {
  id: uuid("id").primaryKey(),
  email: text("email").notNull(),
  name: text("name"),
  role: adminRoleEnum("role").default("admin").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

// ---------------------------------------------------------------------------
// Relations (habilita queries aninhadas via `db.query.produtos.findMany({ with: ... })`)
// ---------------------------------------------------------------------------

export const categoriesRelations = relations(categories, ({ many }) => ({
  products: many(products),
  recommendedMaterialTypes: many(categoryRecommendedMaterialTypes),
}));

export const categoryRecommendedMaterialTypesRelations = relations(categoryRecommendedMaterialTypes, ({ one }) => ({
  category: one(categories, {
    fields: [categoryRecommendedMaterialTypes.categoryId],
    references: [categories.id],
  }),
  materialType: one(materialTypes, {
    fields: [categoryRecommendedMaterialTypes.materialTypeId],
    references: [materialTypes.id],
  }),
}));

export const productsRelations = relations(products, ({ one, many }) => ({
  category: one(categories, { fields: [products.categoryId], references: [categories.id] }),
  parts: many(productParts),
  sizeOptions: many(sizeOptions),
  images: many(productImages),
  reviews: many(productReviews),
}));

export const productImagesRelations = relations(productImages, ({ one }) => ({
  product: one(products, { fields: [productImages.productId], references: [products.id] }),
}));

export const productReviewsRelations = relations(productReviews, ({ one }) => ({
  product: one(products, { fields: [productReviews.productId], references: [products.id] }),
}));

export const productPartsRelations = relations(productParts, ({ one, many }) => ({
  product: one(products, { fields: [productParts.productId], references: [products.id] }),
  materialOptions: many(productPartMaterialOptions),
  materialTypeOptions: many(productPartMaterialTypes),
  regions: many(productPartRegions),
}));

export const productPartRegionsRelations = relations(productPartRegions, ({ one }) => ({
  part: one(productParts, { fields: [productPartRegions.productPartId], references: [productParts.id] }),
}));

export const materialsRelations = relations(materials, ({ many }) => ({
  types: many(materialTypes),
}));

export const materialTypesRelations = relations(materialTypes, ({ one, many }) => ({
  material: one(materials, { fields: [materialTypes.materialId], references: [materials.id] }),
  colors: many(materialColors),
  partOptions: many(productPartMaterialTypes),
}));

export const materialColorsRelations = relations(materialColors, ({ one, many }) => ({
  type: one(materialTypes, { fields: [materialColors.materialTypeId], references: [materialTypes.id] }),
  partOptions: many(productPartMaterialOptions),
}));

export const productPartMaterialOptionsRelations = relations(
  productPartMaterialOptions,
  ({ one }) => ({
    part: one(productParts, {
      fields: [productPartMaterialOptions.productPartId],
      references: [productParts.id],
    }),
    color: one(materialColors, {
      fields: [productPartMaterialOptions.materialColorId],
      references: [materialColors.id],
    }),
  }),
);

export const productPartMaterialTypesRelations = relations(
  productPartMaterialTypes,
  ({ one }) => ({
    part: one(productParts, {
      fields: [productPartMaterialTypes.productPartId],
      references: [productParts.id],
    }),
    type: one(materialTypes, {
      fields: [productPartMaterialTypes.materialTypeId],
      references: [materialTypes.id],
    }),
  }),
);

export const sizeOptionsRelations = relations(sizeOptions, ({ one }) => ({
  product: one(products, { fields: [sizeOptions.productId], references: [products.id] }),
}));

export const ordersRelations = relations(orders, ({ one, many }) => ({
  items: many(orderItems),
  payments: many(payments),
  shipment: one(shipments, { fields: [orders.id], references: [shipments.orderId] }),
}));

export const shipmentsRelations = relations(shipments, ({ one }) => ({
  order: one(orders, { fields: [shipments.orderId], references: [orders.id] }),
}));

export const orderItemsRelations = relations(orderItems, ({ one }) => ({
  order: one(orders, { fields: [orderItems.orderId], references: [orders.id] }),
  product: one(products, { fields: [orderItems.productId], references: [products.id] }),
}));

export const paymentsRelations = relations(payments, ({ one }) => ({
  order: one(orders, { fields: [payments.orderId], references: [orders.id] }),
}));

export const customModelRequestsRelations = relations(customModelRequests, ({ one }) => ({
  product: one(products, { fields: [customModelRequests.productId], references: [products.id] }),
  order: one(orders, { fields: [customModelRequests.orderId], references: [orders.id] }),
}));
