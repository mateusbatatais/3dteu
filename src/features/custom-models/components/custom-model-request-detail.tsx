"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
import { useForm, useWatch } from "react-hook-form";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { lookupAddressByZipCode } from "@/features/checkout/via-cep";
import { ColorSwatches, MaterialTypeDescription } from "@/features/catalog/components/product-configurator";
import { ProductViewer3D, type ViewerPart } from "@/features/catalog/components/product-viewer-3d";
import type { MaterialColor } from "@/features/catalog/types";
import type { ShippingQuote } from "@/features/shipping/types";
import { formatPriceCents } from "@/lib/format";

import {
  confirmCustomModelRequest,
  getCustomModelPriceEstimate,
  getCustomModelRequestStatus,
  getCustomModelShippingQuotes,
} from "../actions";
import type { CustomModelPriceBreakdown } from "../pricing";
import { customModelDeliveryFormSchema, type CustomModelDeliveryFormValues } from "../schemas";
import {
  CUSTOM_MODEL_REQUEST_STATUS_BADGE_CLASSES,
  CUSTOM_MODEL_REQUEST_STATUS_LABELS,
  type CustomModelRequestView,
} from "../types";

const POLL_INTERVAL_MS = 4000;

export function CustomModelRequestDetail({
  initialRequest,
  colors,
  initialOrderToken,
}: {
  initialRequest: CustomModelRequestView;
  colors: MaterialColor[];
  initialOrderToken: string | null;
}) {
  const router = useRouter();
  const [request, setRequest] = useState(initialRequest);
  const [selectedColorId, setSelectedColorId] = useState(colors[0]?.id ?? "");
  const [priceBreakdown, setPriceBreakdown] = useState<CustomModelPriceBreakdown | null>(null);
  const [priceError, setPriceError] = useState<string | null>(null);
  const [quotes, setQuotes] = useState<ShippingQuote[]>([]);
  const [quoteError, setQuoteError] = useState<string | null>(null);
  const [serverError, setServerError] = useState<string | null>(null);
  const [isQuoting, startQuoting] = useTransition();
  const [isConfirming, startConfirming] = useTransition();
  const pollTimer = useRef<ReturnType<typeof setInterval> | null>(null);

  const {
    register,
    handleSubmit,
    control,
    getValues,
    setValue,
    formState: { errors },
  } = useForm<CustomModelDeliveryFormValues>({
    resolver: zodResolver(customModelDeliveryFormSchema),
    defaultValues: { customerPhone: "", deliveryMethod: "pickup" },
  });

  const deliveryMethod = useWatch({ control, name: "deliveryMethod" });
  const shippingServiceId = useWatch({ control, name: "shippingServiceId" });

  // Enquanto a IA está gerando, consulta o status a cada alguns segundos —
  // mais simples que webhook (a Meshy suporta os dois) pro volume esperado.
  useEffect(() => {
    if (request.status !== "generating" && request.status !== "pending") return;

    pollTimer.current = setInterval(async () => {
      const result = await getCustomModelRequestStatus(request.id);
      if (result.request) setRequest(result.request as unknown as CustomModelRequestView);
    }, POLL_INTERVAL_MS);

    return () => {
      if (pollTimer.current) clearInterval(pollTimer.current);
    };
  }, [request.id, request.status]);

  // Preço ao vivo assim que o modelo está pronto e uma cor está selecionada
  // — recalculado no servidor de novo na hora de confirmar de verdade.
  useEffect(() => {
    if (request.status !== "ready" || !selectedColorId) return;
    let cancelled = false;

    getCustomModelPriceEstimate(request.id, selectedColorId).then((result) => {
      if (cancelled) return;
      if (result.error || !result.breakdown) {
        setPriceError(result.error ?? "Não foi possível calcular o preço.");
        setPriceBreakdown(null);
        return;
      }
      setPriceError(null);
      setPriceBreakdown(result.breakdown);
    });

    return () => {
      cancelled = true;
    };
  }, [request.id, request.status, selectedColorId]);

  async function handleZipCodeBlur() {
    const address = await lookupAddressByZipCode(getValues("zipCode") ?? "");
    if (!address) return;
    setValue("street", address.street);
    setValue("neighborhood", address.neighborhood);
    setValue("city", address.city);
    setValue("state", address.state);
  }

  function handleCalculateShipping() {
    setQuoteError(null);
    setValue("shippingServiceId", "");
    startQuoting(async () => {
      const result = await getCustomModelShippingQuotes(request.id, getValues("zipCode") ?? "");
      setQuotes(result.quotes);
      setQuoteError(result.error ?? (result.quotes.length === 0 ? "Nenhuma opção de frete encontrada pra esse CEP." : null));
    });
  }

  function onSubmit(values: CustomModelDeliveryFormValues) {
    setServerError(null);
    startConfirming(async () => {
      const result = await confirmCustomModelRequest(request.id, {
        materialColorId: selectedColorId,
        deliveryMethod: values.deliveryMethod,
        customerPhone: values.customerPhone,
        shippingAddress:
          values.deliveryMethod === "superfrete"
            ? {
                recipientName: "",
                zipCode: values.zipCode!,
                street: values.street!,
                number: values.number!,
                complement: values.complement,
                neighborhood: values.neighborhood!,
                city: values.city!,
                state: values.state!,
              }
            : undefined,
        shippingServiceId: values.deliveryMethod === "superfrete" ? values.shippingServiceId : undefined,
      });

      if (result.error || !result.orderToken) {
        setServerError(result.error ?? "Não foi possível confirmar o pedido.");
        return;
      }

      router.push(`/pedido/${result.orderToken}`);
    });
  }

  const selectedColor = colors.find((c) => c.id === selectedColorId);
  const shippingCostCents = deliveryMethod === "superfrete" ? (quotes.find((q) => q.serviceId === shippingServiceId)?.priceCents ?? 0) : 0;

  return (
    <div>
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Seu modelo customizado</h1>
          <p className="mt-1 text-sm text-muted-foreground">{request.description}</p>
        </div>
        <Badge variant="outline" className={CUSTOM_MODEL_REQUEST_STATUS_BADGE_CLASSES[request.status]}>
          {CUSTOM_MODEL_REQUEST_STATUS_LABELS[request.status]}
        </Badge>
      </div>

      {request.status === "pending" || request.status === "generating" ? (
        <div className="mt-8 flex flex-col items-center gap-3 rounded-xl bg-muted/40 p-10 text-center">
          <div className="size-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
          <p className="text-sm text-muted-foreground">
            A IA está gerando seu modelo 3D — isso costuma levar alguns minutos. Pode deixar essa página aberta.
          </p>
        </div>
      ) : null}

      {request.status === "failed" ? (
        <div className="mt-8 rounded-xl bg-destructive/10 p-6 text-sm text-destructive">
          <p className="font-medium">Não foi possível gerar o modelo.</p>
          <p className="mt-1">{request.errorMessage ?? "Erro desconhecido."}</p>
          <Link href="/conta/modelo-3d" className="mt-3 inline-block font-medium underline-offset-2 hover:underline">
            Tentar de novo
          </Link>
        </div>
      ) : null}

      {request.status === "confirmed" ? (
        <div className="mt-8 rounded-xl bg-primary/5 p-6 text-sm">
          <p>Esse modelo já virou um pedido.</p>
          {initialOrderToken ? (
            <Link href={`/pedido/${initialOrderToken}`} className="mt-2 inline-block font-medium underline-offset-2 hover:underline">
              Ver pedido
            </Link>
          ) : null}
        </div>
      ) : null}

      {request.status === "ready" ? (
        <div className="mt-8 flex flex-col gap-6">
          <ProductViewer3D
            parts={[
              {
                id: request.id,
                meshUrl: request.meshFileUrl,
                color: selectedColor?.hexColor ?? "#a1a1aa",
                colorSecondary: selectedColor?.hexColorSecondary ?? null,
                printProcess: selectedColor?.printProcess,
              } satisfies ViewerPart,
            ]}
          />

          <div>
            <h2 className="text-xs font-medium tracking-wide text-muted-foreground uppercase">Material</h2>
            {colors.length === 0 ? (
              <p className="mt-2 text-sm text-muted-foreground">Nenhum material cadastrado ainda — fale com a loja.</p>
            ) : (
              <>
                <ColorSwatches colors={colors} selectedId={selectedColorId} onSelect={setSelectedColorId} />
                <MaterialTypeDescription color={selectedColor} />
              </>
            )}
          </div>

          {priceError ? (
            <p className="text-sm text-destructive">{priceError}</p>
          ) : priceBreakdown ? (
            <div className="rounded-xl bg-muted/40 p-4 text-sm">
              <p className="text-muted-foreground">
                Material: {formatPriceCents(priceBreakdown.materialCostCents)} + Energia:{" "}
                {formatPriceCents(priceBreakdown.energyCostCents)} + Pós-processamento:{" "}
                {formatPriceCents(priceBreakdown.postProcessingFeeCents)} + Modelagem customizada:{" "}
                {formatPriceCents(priceBreakdown.customModelFeeCents)}
              </p>
              <p className="mt-1 text-lg font-semibold">{formatPriceCents(priceBreakdown.totalPriceCents)}</p>
            </div>
          ) : null}

          <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-4 border-t pt-6">
            <div className="flex flex-col gap-2 sm:max-w-72">
              <Label htmlFor="customerPhone">Telefone (opcional)</Label>
              <Input id="customerPhone" {...register("customerPhone")} />
            </div>

            <div>
              <h2 className="text-xs font-medium tracking-wide text-muted-foreground uppercase">Entrega</h2>
              <div className="mt-2 flex flex-wrap gap-2">
                <Button
                  type="button"
                  variant={deliveryMethod === "pickup" ? "default" : "outline"}
                  size="sm"
                  onClick={() => setValue("deliveryMethod", "pickup")}
                >
                  Retirada em mãos
                </Button>
                <Button
                  type="button"
                  variant={deliveryMethod === "superfrete" ? "default" : "outline"}
                  size="sm"
                  onClick={() => setValue("deliveryMethod", "superfrete")}
                >
                  Enviar pelo correio
                </Button>
              </div>

              {deliveryMethod === "superfrete" ? (
                <div className="mt-3 flex flex-col gap-4 rounded-xl bg-muted/40 p-4">
                  <div className="flex flex-col gap-2 sm:max-w-40">
                    <Label htmlFor="zipCode">CEP</Label>
                    <Input id="zipCode" {...register("zipCode")} onBlur={handleZipCodeBlur} placeholder="00000-000" />
                    {errors.zipCode ? <p className="text-sm text-destructive">{errors.zipCode.message}</p> : null}
                  </div>

                  <div className="grid gap-4 sm:grid-cols-[1fr_auto]">
                    <div className="flex flex-col gap-2">
                      <Label htmlFor="street">Rua</Label>
                      <Input id="street" {...register("street")} />
                      {errors.street ? <p className="text-sm text-destructive">{errors.street.message}</p> : null}
                    </div>
                    <div className="flex flex-col gap-2 sm:w-28">
                      <Label htmlFor="number">Número</Label>
                      <Input id="number" {...register("number")} />
                      {errors.number ? <p className="text-sm text-destructive">{errors.number.message}</p> : null}
                    </div>
                  </div>

                  <div className="flex flex-col gap-2">
                    <Label htmlFor="complement">Complemento (opcional)</Label>
                    <Input id="complement" {...register("complement")} />
                  </div>

                  <div className="grid gap-4 sm:grid-cols-[1fr_1fr_auto]">
                    <div className="flex flex-col gap-2">
                      <Label htmlFor="neighborhood">Bairro</Label>
                      <Input id="neighborhood" {...register("neighborhood")} />
                      {errors.neighborhood ? (
                        <p className="text-sm text-destructive">{errors.neighborhood.message}</p>
                      ) : null}
                    </div>
                    <div className="flex flex-col gap-2">
                      <Label htmlFor="city">Cidade</Label>
                      <Input id="city" {...register("city")} />
                      {errors.city ? <p className="text-sm text-destructive">{errors.city.message}</p> : null}
                    </div>
                    <div className="flex flex-col gap-2 sm:w-20">
                      <Label htmlFor="state">UF</Label>
                      <Input id="state" maxLength={2} {...register("state")} />
                      {errors.state ? <p className="text-sm text-destructive">{errors.state.message}</p> : null}
                    </div>
                  </div>

                  <Button type="button" variant="outline" size="sm" disabled={isQuoting} onClick={handleCalculateShipping}>
                    {isQuoting ? "Calculando..." : "Calcular frete"}
                  </Button>

                  {quoteError ? <p className="text-sm text-destructive">{quoteError}</p> : null}

                  {quotes.length > 0 ? (
                    <div className="flex flex-col gap-2">
                      {quotes.map((quote) => (
                        <button
                          key={quote.serviceId}
                          type="button"
                          onClick={() => setValue("shippingServiceId", quote.serviceId)}
                          className={`flex items-center justify-between rounded-lg border p-3 text-left text-sm transition-colors ${
                            shippingServiceId === quote.serviceId
                              ? "border-primary bg-primary/5"
                              : "border-border hover:bg-muted"
                          }`}
                        >
                          <span>
                            {quote.carrierName} · até {quote.estimatedDays} dias úteis
                          </span>
                          <span className="font-medium">{formatPriceCents(quote.priceCents)}</span>
                        </button>
                      ))}
                    </div>
                  ) : null}
                  {errors.shippingServiceId ? (
                    <p className="text-sm text-destructive">{errors.shippingServiceId.message}</p>
                  ) : null}
                </div>
              ) : null}
            </div>

            {priceBreakdown ? (
              <div className="flex items-center justify-between border-t pt-4">
                <span className="text-lg font-semibold">Total</span>
                <span className="text-lg font-semibold">
                  {formatPriceCents(priceBreakdown.totalPriceCents + shippingCostCents)}
                </span>
              </div>
            ) : null}

            {serverError ? <p className="text-sm text-destructive">{serverError}</p> : null}

            <Button type="submit" size="lg" disabled={isConfirming || !priceBreakdown}>
              {isConfirming ? "Confirmando..." : "Fazer pedido"}
            </Button>
          </form>
        </div>
      ) : null}

      {request.thumbnailUrl && request.status !== "ready" ? (
        <div className="mt-6">
          <Image
            src={request.thumbnailUrl}
            alt="Preview do modelo gerado"
            width={200}
            height={200}
            className="rounded-xl"
            unoptimized
          />
        </div>
      ) : null}
    </div>
  );
}
