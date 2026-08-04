import { relations } from "drizzle-orm";
import {
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
  meshFileUrl: text("mesh_file_url"), // GLB convertido, usado no preview web
  stlFileUrl: text("stl_file_url"), // STL original, usado só para impressão
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

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
}));

export const productPartsRelations = relations(productParts, ({ one, many }) => ({
  product: one(products, { fields: [productParts.productId], references: [products.id] }),
  materialOptions: many(productPartMaterialOptions),
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

export const ordersRelations = relations(orders, ({ many }) => ({
  items: many(orderItems),
  payments: many(payments),
}));

export const orderItemsRelations = relations(orderItems, ({ one }) => ({
  order: one(orders, { fields: [orderItems.orderId], references: [orders.id] }),
  product: one(products, { fields: [orderItems.productId], references: [products.id] }),
}));

export const paymentsRelations = relations(payments, ({ one }) => ({
  order: one(orders, { fields: [payments.orderId], references: [orders.id] }),
}));
