"use server";

import { randomUUID } from "node:crypto";

import { and, count, eq, gte } from "drizzle-orm";
import { revalidatePath } from "next/cache";

import { createProductDraft, createProductPart, createSizeOption, setPartMaterialTypes } from "@/features/catalog/actions";
import { measureMeshFromBuffer } from "@/features/catalog/mesh-measure";
import { estimatePrintWeight } from "@/features/catalog/print-estimate";
import { getAllMaterialColorsForConfigurator } from "@/features/catalog/queries";
import { sendAdminNewOrderNotification, sendOrderConfirmationEmail } from "@/features/orders/email";
import { wooviProvider } from "@/features/payments/woovi";
import type { DeliveryMethod, ShippingAddress } from "@/features/shipping/types";
import { createClient } from "@/lib/supabase/server";
import { createStorageClient, CUSTOM_MODEL_PHOTOS_BUCKET, MEDIA_BUCKET, MODELS_BUCKET } from "@/lib/supabase/storage";
import {
  ALLOWED_MEDIA_EXTENSIONS,
  ALLOWED_MESH_EXTENSIONS,
  type MediaExtension,
  type MeshExtension,
} from "@/lib/supabase/storage-constants";
import { db } from "@/server/db/client";
import { customModelRequests, orderItems, orders, payments, productParts } from "@/server/db/schema";

import { createImageTo3DTask, getImageTo3DTask } from "./meshy";
import { computeCustomModelPrice } from "./pricing";
import { getCustomModelRequestById } from "./queries";
import { getCustomModelShippingQuotes as resolveCustomModelShippingQuotes } from "./shipping";

async function requireCustomerId(): Promise<string | null> {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    return user?.id ?? null;
  } catch (error) {
    console.error("[supabase] falha ao checar sessão do cliente (modelo customizado)", error);
    return null;
  }
}

export interface CreateCustomModelPhotoUploadUrlResult {
  error?: string;
  path?: string;
  token?: string;
}

/** Mesmo padrão de createProductImageUploadUrl — signed URL, upload direto
 * do navegador pro Storage, sem passar pelo servidor. Sem productId ainda
 * (o produto só existe se/quando o pedido for confirmado). */
export async function createCustomModelPhotoUploadUrl(extension: string): Promise<CreateCustomModelPhotoUploadUrlResult> {
  const normalizedExt = extension.toLowerCase().replace(/^\./, "");
  if (!(ALLOWED_MEDIA_EXTENSIONS as readonly string[]).includes(normalizedExt)) {
    return { error: `Formato .${normalizedExt} não suportado. Use ${ALLOWED_MEDIA_EXTENSIONS.join(", ")}.` };
  }

  try {
    const storage = createStorageClient();
    const path = `${randomUUID()}.${normalizedExt as MediaExtension}`;

    const { data, error } = await storage.storage.from(CUSTOM_MODEL_PHOTOS_BUCKET).createSignedUploadUrl(path);
    if (error || !data) {
      return { error: `Falha ao preparar o upload: ${error?.message ?? "erro desconhecido"}` };
    }

    return { path: data.path, token: data.token };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Erro desconhecido.";
    return { error: `Falha ao preparar o upload: ${message}` };
  }
}

export interface SubmitCustomModelRequestResult {
  error?: string;
  requestId?: string;
}

export async function submitCustomModelRequest(input: {
  description: string;
  photoPaths: string[];
}): Promise<SubmitCustomModelRequestResult> {
  const customerId = await requireCustomerId();
  if (!customerId) return { error: "Entre na sua conta antes de pedir um modelo customizado." };

  const description = input.description.trim();
  if (!description) return { error: "Descreva o que você quer imprimir." };
  if (input.photoPaths.length === 0 || input.photoPaths.length > 4) {
    return { error: "Envie de 1 a 4 fotos." };
  }

  // Guardrail contra abuso: cada geração custa crédito real, então 1 pedido
  // grátis por cliente por dia (confirmado com o usuário) — primeiro
  // rate-limit do projeto, fica só aqui, não vale generalizar ainda. Só
  // conta gerações por IA (origin="ai") — upload direto (Fase 4b) não gasta
  // crédito nenhum, não devia contar nem ser bloqueado por este limite.
  const startOfDayUtc = new Date();
  startOfDayUtc.setUTCHours(0, 0, 0, 0);
  const [{ value: requestsToday }] = await db
    .select({ value: count() })
    .from(customModelRequests)
    .where(
      and(
        eq(customModelRequests.customerId, customerId),
        eq(customModelRequests.origin, "ai"),
        gte(customModelRequests.createdAt, startOfDayUtc),
      ),
    );

  if (requestsToday >= 1) {
    return { error: "Você já pediu um modelo customizado hoje — tente de novo amanhã." };
  }

  const storage = createStorageClient();
  const photoUrls = input.photoPaths.map(
    (path) => storage.storage.from(CUSTOM_MODEL_PHOTOS_BUCKET).getPublicUrl(path).data.publicUrl,
  );

  const [row] = await db
    .insert(customModelRequests)
    .values({ customerId, description, photoUrls, status: "pending" })
    .returning({ id: customModelRequests.id });

  try {
    const taskId = await createImageTo3DTask(photoUrls);
    await db
      .update(customModelRequests)
      .set({ meshyTaskId: taskId, status: "generating", updatedAt: new Date() })
      .where(eq(customModelRequests.id, row.id));
  } catch (error) {
    const message = error instanceof Error ? error.message : "Erro desconhecido.";
    console.error("[meshy] falha ao criar task de geração", row.id, error);
    await db
      .update(customModelRequests)
      .set({ status: "failed", errorMessage: message, updatedAt: new Date() })
      .where(eq(customModelRequests.id, row.id));
  }

  revalidatePath("/conta/modelo-3d");
  return { requestId: row.id };
}

export interface CreateDirectMeshUploadUrlResult {
  error?: string;
  path?: string;
  token?: string;
}

/** Mesmo padrão de createCustomModelPhotoUploadUrl (signed URL, sem
 * productId/partId ainda) — só que mirando o bucket de malhas (o mesmo já
 * usado pro STL de produtos de catálogo), pro fluxo de cliente que já tem
 * o próprio arquivo 3D (Fase 4b: "enviar arquivo pra orçamento"). */
export async function createDirectMeshUploadUrl(extension: string): Promise<CreateDirectMeshUploadUrlResult> {
  const normalizedExt = extension.toLowerCase().replace(/^\./, "");
  if (!(ALLOWED_MESH_EXTENSIONS as readonly string[]).includes(normalizedExt)) {
    return { error: `Formato .${normalizedExt} não suportado. Use .stl, .obj ou .3mf.` };
  }

  try {
    const storage = createStorageClient();
    const path = `${randomUUID()}.${normalizedExt as MeshExtension}`;

    const { data, error } = await storage.storage.from(MODELS_BUCKET).createSignedUploadUrl(path);
    if (error || !data) {
      return { error: `Falha ao preparar o upload: ${error?.message ?? "erro desconhecido"}` };
    }

    return { path: data.path, token: data.token };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Erro desconhecido.";
    return { error: `Falha ao preparar o upload: ${message}` };
  }
}

/**
 * Cliente que já tem o próprio STL/OBJ/3MF — pula fotos/Meshy inteiramente
 * e vai direto pro estado "ready" (mede o arquivo de verdade no servidor,
 * nunca confia em nada vindo do cliente). Sem o guardrail de 1/dia: não
 * gasta crédito de IA nenhum, só armazenamento (mesmo teto de 50MB já
 * aplicado a qualquer STL do projeto).
 */
export async function submitDirectMeshModelRequest(input: {
  description: string;
  meshPath: string;
  extension: MeshExtension;
}): Promise<SubmitCustomModelRequestResult> {
  const customerId = await requireCustomerId();
  if (!customerId) return { error: "Entre na sua conta antes de enviar um arquivo." };

  const description = input.description.trim();
  if (!description) return { error: "Escreva uma breve descrição da peça." };

  try {
    const storage = createStorageClient();

    const { data: fileBlob, error: downloadError } = await storage.storage
      .from(MODELS_BUCKET)
      .download(input.meshPath);
    if (downloadError || !fileBlob) {
      return { error: `Não foi possível ler o arquivo enviado: ${downloadError?.message ?? "erro desconhecido"}` };
    }

    const buffer = await fileBlob.arrayBuffer();
    const measurements = await measureMeshFromBuffer(buffer, input.extension);
    if (!measurements) return { error: "Não foi possível medir o arquivo enviado — confira se ele não está corrompido." };

    const { weightGrams } = estimatePrintWeight(measurements.volumeMm3, measurements.surfaceAreaMm2);
    const meshFileUrl = storage.storage.from(MODELS_BUCKET).getPublicUrl(input.meshPath).data.publicUrl;

    const [row] = await db
      .insert(customModelRequests)
      .values({
        customerId,
        description,
        photoUrls: [],
        origin: "upload",
        status: "ready",
        meshFileUrl,
        weightGrams: weightGrams.toFixed(2),
        widthMm: measurements.widthMm.toFixed(2),
        heightMm: measurements.heightMm.toFixed(2),
        depthMm: measurements.depthMm.toFixed(2),
      })
      .returning({ id: customModelRequests.id });

    revalidatePath("/conta/modelo-3d");
    return { requestId: row.id };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Erro desconhecido.";
    return { error: `Não foi possível processar o arquivo: ${message}` };
  }
}

/**
 * Chamada em loop pelo client enquanto o status for "generating". Sempre
 * confere que a request pertence à sessão atual antes de devolver qualquer
 * coisa — nunca confia só no requestId vindo do client.
 */
export async function getCustomModelRequestStatus(requestId: string) {
  const customerId = await requireCustomerId();
  if (!customerId) return { error: "Sessão expirada — entre de novo." };

  const request = await getCustomModelRequestById(requestId);
  if (!request || request.customerId !== customerId) return { error: "Pedido não encontrado." };

  if (request.status !== "generating" || !request.meshyTaskId) {
    return { request };
  }

  try {
    const task = await getImageTo3DTask(request.meshyTaskId);

    if (task.status === "FAILED" || task.status === "CANCELED") {
      const [updated] = await db
        .update(customModelRequests)
        .set({
          status: "failed",
          errorMessage: task.taskError ?? "A geração falhou na Meshy.",
          updatedAt: new Date(),
        })
        .where(eq(customModelRequests.id, requestId))
        .returning();
      return { request: updated };
    }

    if (task.status !== "SUCCEEDED") {
      // PENDING/IN_PROGRESS — ainda gerando, nada pra atualizar.
      return { request };
    }

    const stlUrl = task.modelUrls?.stl;
    if (!stlUrl) throw new Error("A Meshy terminou mas não devolveu um arquivo STL.");

    const stlResponse = await fetch(stlUrl);
    if (!stlResponse.ok) throw new Error(`Falha ao baixar o STL gerado (${stlResponse.status}).`);
    const stlBuffer = await stlResponse.arrayBuffer();

    const measurements = await measureMeshFromBuffer(stlBuffer, "stl");
    if (!measurements) throw new Error("Não foi possível medir o arquivo gerado pela IA.");
    const { weightGrams } = estimatePrintWeight(measurements.volumeMm3, measurements.surfaceAreaMm2);

    const storage = createStorageClient();
    const meshPath = `custom-${requestId}-${Date.now()}.stl`;
    const { error: meshUploadError } = await storage.storage
      .from(MODELS_BUCKET)
      .upload(meshPath, Buffer.from(stlBuffer), { contentType: "model/stl", upsert: true });
    if (meshUploadError) throw new Error(`Falha ao re-hospedar o STL: ${meshUploadError.message}`);
    const meshFileUrl = storage.storage.from(MODELS_BUCKET).getPublicUrl(meshPath).data.publicUrl;

    let thumbnailUrl: string | null = null;
    if (task.thumbnailUrl) {
      try {
        const thumbResponse = await fetch(task.thumbnailUrl);
        if (thumbResponse.ok) {
          const thumbBuffer = await thumbResponse.arrayBuffer();
          const thumbPath = `custom-${requestId}-${Date.now()}.png`;
          const { error: thumbUploadError } = await storage.storage
            .from(MEDIA_BUCKET)
            .upload(thumbPath, Buffer.from(thumbBuffer), { contentType: "image/png", upsert: true });
          if (!thumbUploadError) {
            thumbnailUrl = storage.storage.from(MEDIA_BUCKET).getPublicUrl(thumbPath).data.publicUrl;
          }
        }
      } catch (error) {
        // Preview é conveniência, não motivo pra falhar a request inteira.
        console.error("[meshy] falha ao re-hospedar thumbnail", requestId, error);
      }
    }

    const [updated] = await db
      .update(customModelRequests)
      .set({
        status: "ready",
        meshFileUrl,
        thumbnailUrl,
        weightGrams: weightGrams.toFixed(2),
        widthMm: measurements.widthMm.toFixed(2),
        heightMm: measurements.heightMm.toFixed(2),
        depthMm: measurements.depthMm.toFixed(2),
        consumedCredits: task.consumedCredits,
        updatedAt: new Date(),
      })
      .where(eq(customModelRequests.id, requestId))
      .returning();

    revalidatePath(`/conta/modelo-3d/${requestId}`);
    return { request: updated };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Erro desconhecido.";
    console.error("[meshy] falha ao processar resultado da geração", requestId, error);
    const [updated] = await db
      .update(customModelRequests)
      .set({ status: "failed", errorMessage: message, updatedAt: new Date() })
      .where(eq(customModelRequests.id, requestId))
      .returning();
    return { request: updated };
  }
}

export async function getCustomModelPriceEstimate(requestId: string, materialColorId: string) {
  const customerId = await requireCustomerId();
  if (!customerId) return { error: "Sessão expirada — entre de novo." };

  const request = await getCustomModelRequestById(requestId);
  if (!request || request.customerId !== customerId) return { error: "Pedido não encontrado." };

  return computeCustomModelPrice(request, materialColorId);
}

export async function getCustomModelShippingQuotes(requestId: string, zipCode: string) {
  const customerId = await requireCustomerId();
  if (!customerId) return { quotes: [], error: "Sessão expirada — entre de novo." };

  const request = await getCustomModelRequestById(requestId);
  if (!request || request.customerId !== customerId) return { quotes: [], error: "Pedido não encontrado." };

  return resolveCustomModelShippingQuotes(request, zipCode);
}

export interface ConfirmCustomModelRequestInput {
  materialColorId: string;
  deliveryMethod: DeliveryMethod;
  shippingAddress?: ShippingAddress;
  shippingServiceId?: string;
  customerPhone?: string;
}

export interface ConfirmCustomModelRequestResult {
  error?: string;
  orderToken?: string;
}

/**
 * Recalcula tudo do zero no servidor (preço + frete) — nunca confia em nada
 * vindo do client além do materialColorId escolhido. Cria um produto oculto
 * (status "draft", invisível em qualquer lugar público) com as mesmas
 * server actions que o admin usa pra cadastrar produto, e insere o pedido
 * direto (não reaproveita submitOrder — a fórmula de preço é outra).
 */
export async function confirmCustomModelRequest(
  requestId: string,
  input: ConfirmCustomModelRequestInput,
): Promise<ConfirmCustomModelRequestResult> {
  const customerId = await requireCustomerId();
  if (!customerId) return { error: "Entre na sua conta antes de confirmar o pedido." };

  const request = await getCustomModelRequestById(requestId);
  if (!request || request.customerId !== customerId) return { error: "Pedido não encontrado." };
  if (request.status !== "ready") return { error: "Este modelo ainda não está pronto pra virar pedido." };

  const priceResult = await computeCustomModelPrice(request, input.materialColorId);
  if (priceResult.error || !priceResult.breakdown) {
    return { error: priceResult.error ?? "Não foi possível calcular o preço." };
  }
  const { totalPriceCents } = priceResult.breakdown;

  let shippingCostCents = 0;
  let shippingCarrierName: string | null = null;
  let shippingServiceId: string | null = null;
  let shippingAddress: ShippingAddress | null = null;

  if (input.deliveryMethod === "superfrete") {
    if (!input.shippingAddress || !input.shippingServiceId) {
      return { error: "Preencha o endereço de entrega e escolha uma opção de frete." };
    }
    const { quotes, error } = await resolveCustomModelShippingQuotes(request, input.shippingAddress.zipCode);
    if (error) return { error };
    const quote = quotes.find((q) => q.serviceId === input.shippingServiceId);
    if (!quote) return { error: "A opção de frete escolhida não está mais disponível. Calcule o frete de novo." };

    shippingCostCents = quote.priceCents;
    shippingCarrierName = quote.carrierName;
    shippingServiceId = quote.serviceId;
    shippingAddress = input.shippingAddress;
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user?.email) return { error: "Sessão expirada — entre de novo." };
  const customerName = (user.user_metadata?.name as string | undefined)?.trim() || user.email;

  // Produto oculto: reaproveita 100% as mesmas server actions do cadastro
  // de produto do admin — status "draft" já é invisível em toda rota
  // pública (getProductBySlug/getPublishedProductsForCatalog filtram por
  // "published"), mas continua editável/visualizável em /admin/produtos.
  const draft = await createProductDraft({
    name: `Modelo customizado — ${request.description.slice(0, 60)}`,
    slug: `modelo-customizado-${requestId}`,
    description: request.description,
    categoryId: "",
    basePriceReais: totalPriceCents / 100,
    status: "draft",
  });
  if (draft.error || !draft.productId) return { error: draft.error ?? "Não foi possível criar o produto." };
  const productId = draft.productId;

  const part = await createProductPart(productId, "Peça única");
  if (part.error || !part.id) return { error: part.error ?? "Não foi possível criar a peça." };
  const partId = part.id;

  await db
    .update(productParts)
    .set({ meshFileUrl: request.meshFileUrl, stlFileUrl: request.meshFileUrl })
    .where(eq(productParts.id, partId));

  // A peça aceita o TIPO inteiro da cor escolhida (mesma regra universal de
  // qualquer produto do catálogo agora) — não só aquela cor isolada; a cor
  // escolhida pelo cliente vira o padrão.
  const colors = await getAllMaterialColorsForConfigurator();
  const chosenColor = colors.find((c) => c.id === input.materialColorId);
  if (!chosenColor) return { error: "A cor escolhida não é mais válida." };

  const materialsFormData = new FormData();
  materialsFormData.append("materialTypeId", chosenColor.type.id);
  materialsFormData.set("defaultMaterialColorId", input.materialColorId);
  await setPartMaterialTypes(productId, partId, materialsFormData);

  await createSizeOption(productId, { label: "Único", scaleFactor: 1 });

  const [order] = await db
    .insert(orders)
    .values({
      customerName,
      customerEmail: user.email,
      customerPhone: input.customerPhone?.trim() || null,
      customerId,
      deliveryMethod: input.deliveryMethod,
      shippingAddress,
      shippingCostCents,
      shippingCarrierName,
      shippingServiceId,
      totalCents: totalPriceCents + shippingCostCents,
    })
    .returning();

  const productNameSnapshot = `Modelo customizado — ${request.description.slice(0, 60)}`;

  await db.insert(orderItems).values({
    orderId: order.id,
    productId,
    productNameSnapshot,
    quantity: 1,
    configuration: { custom: true, materialColorId: input.materialColorId, requestId },
    unitPriceCents: totalPriceCents,
    subtotalCents: totalPriceCents,
  });

  // Mesmo tail best-effort de submitOrder (checkout/actions.ts) — Woovi e
  // e-mails nunca podem derrubar um pedido já criado.
  try {
    const charge = await wooviProvider.createCharge({
      orderId: order.id,
      amountCents: order.totalCents,
      customerName: order.customerName,
      customerEmail: order.customerEmail,
    });
    await db.insert(payments).values({
      orderId: order.id,
      provider: "woovi",
      externalId: charge.externalId,
      pixQrCode: charge.pixQrCode,
      pixCopyPaste: charge.pixCopyPaste,
      status: "pending",
    });
  } catch (error) {
    console.error("[woovi] falha ao gerar cobrança para o pedido customizado", order.id, error);
  }

  try {
    await sendOrderConfirmationEmail({
      customerEmail: order.customerEmail,
      customerName: order.customerName,
      orderToken: order.publicToken,
      totalCents: order.totalCents,
    });
  } catch (error) {
    console.error("[resend] falha ao enviar e-mail de confirmação do pedido customizado", order.id, error);
  }

  try {
    await sendAdminNewOrderNotification({
      orderId: order.id,
      customerName: order.customerName,
      customerEmail: order.customerEmail,
      customerPhone: order.customerPhone,
      totalCents: order.totalCents,
      items: [{ productNameSnapshot, quantity: 1, subtotalCents: totalPriceCents }],
    });
  } catch (error) {
    console.error("[resend] falha ao notificar admin sobre pedido customizado novo", order.id, error);
  }

  await db
    .update(customModelRequests)
    .set({ status: "confirmed", productId, orderId: order.id, updatedAt: new Date() })
    .where(eq(customModelRequests.id, requestId));

  revalidatePath(`/conta/modelo-3d/${requestId}`);
  return { orderToken: order.publicToken };
}
