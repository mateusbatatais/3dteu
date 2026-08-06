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

export const filamentTypeEnum = pgEnum("filament_type", [
  "solid_color",
  "dual_color",
  "special",
]);

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

// ---------------------------------------------------------------------------
// Catálogo
// ---------------------------------------------------------------------------

export const categories = pgTable("categories", {
  id: uuid("id").defaultRandom().primaryKey(),
  slug: text("slug").notNull().unique(),
  name: text("name").notNull(),
  description: text("description"),
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
  // Pré-seleciona esse material quando o cliente abre a página do produto,
  // em vez do primeiro material da lista (ordem arbitrária) — admin escolhe
  // qual fica bonito por padrão. Null = usa o primeiro da lista, como antes.
  defaultFilamentOptionId: uuid("default_filament_option_id").references(() => filamentOptions.id, {
    onDelete: "set null",
  }),
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
    // renderizando no preview com defaultFilamentOptionId, só não aparece
    // como opção configurável na loja.
    enabled: boolean("enabled").default(true).notNull(),
    // Mesma ideia do default por parte (acima), mas por região — cai pro
    // padrão da parte quando null.
    defaultFilamentOptionId: uuid("default_filament_option_id").references(() => filamentOptions.id, {
      onDelete: "set null",
    }),
    sortOrder: integer("sort_order").default(0).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [uniqueIndex("product_part_region_state_unique").on(table.productPartId, table.paintState)],
);

// Catálogo global de materiais/filamentos disponíveis para uso em qualquer produto.
export const filamentOptions = pgTable("filament_options", {
  id: uuid("id").defaultRandom().primaryKey(),
  type: filamentTypeEnum("type").notNull(),
  name: text("name").notNull(),
  hexColor: text("hex_color"), // cor única, ou primeira cor de um dual-color
  hexColorSecondary: text("hex_color_secondary"), // segunda cor, só em dual-color
  swatchImageUrl: text("swatch_image_url"),
  priceModifierCents: integer("price_modifier_cents").default(0).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

// Quais materiais estão disponíveis para cada parte de cada produto
// (nem toda peça suporta todo material — ex.: peça fina em madeira pode quebrar).
export const productPartMaterialOptions = pgTable(
  "product_part_material_options",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    productPartId: uuid("product_part_id")
      .notNull()
      .references(() => productParts.id, { onDelete: "cascade" }),
    filamentOptionId: uuid("filament_option_id")
      .notNull()
      .references(() => filamentOptions.id, { onDelete: "cascade" }),
  },
  (table) => [
    uniqueIndex("product_part_material_unique").on(
      table.productPartId,
      table.filamentOptionId,
    ),
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
}));

export const productsRelations = relations(products, ({ one, many }) => ({
  category: one(categories, { fields: [products.categoryId], references: [categories.id] }),
  parts: many(productParts),
  sizeOptions: many(sizeOptions),
  images: many(productImages),
}));

export const productImagesRelations = relations(productImages, ({ one }) => ({
  product: one(products, { fields: [productImages.productId], references: [products.id] }),
}));

export const productPartsRelations = relations(productParts, ({ one, many }) => ({
  product: one(products, { fields: [productParts.productId], references: [products.id] }),
  materialOptions: many(productPartMaterialOptions),
  regions: many(productPartRegions),
}));

export const productPartRegionsRelations = relations(productPartRegions, ({ one }) => ({
  part: one(productParts, { fields: [productPartRegions.productPartId], references: [productParts.id] }),
}));

export const filamentOptionsRelations = relations(filamentOptions, ({ many }) => ({
  partOptions: many(productPartMaterialOptions),
}));

export const productPartMaterialOptionsRelations = relations(
  productPartMaterialOptions,
  ({ one }) => ({
    part: one(productParts, {
      fields: [productPartMaterialOptions.productPartId],
      references: [productParts.id],
    }),
    filament: one(filamentOptions, {
      fields: [productPartMaterialOptions.filamentOptionId],
      references: [filamentOptions.id],
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
