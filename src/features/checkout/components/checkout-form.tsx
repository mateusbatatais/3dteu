"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { useForm, useWatch } from "react-hook-form";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { ShippingQuote } from "@/features/shipping/types";
import { formatPriceCents } from "@/lib/format";

import { getShippingQuotes, submitOrder } from "../actions";
import { useCartStore } from "../cart-store";
import { checkoutFormSchema, type CheckoutFormValues } from "../schemas";
import { lookupAddressByZipCode } from "../via-cep";

export function CheckoutForm() {
  const router = useRouter();
  const items = useCartStore((state) => state.items);
  const clearCart = useCartStore((state) => state.clear);

  const [serverError, setServerError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const [isQuoting, startQuoting] = useTransition();
  const [quotes, setQuotes] = useState<ShippingQuote[]>([]);
  const [quoteError, setQuoteError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    control,
    getValues,
    setValue,
    formState: { errors },
  } = useForm<CheckoutFormValues>({
    resolver: zodResolver(checkoutFormSchema),
    defaultValues: {
      customerName: "",
      customerEmail: "",
      customerPhone: "",
      deliveryMethod: "pickup",
    },
  });

  const deliveryMethod = useWatch({ control, name: "deliveryMethod" });
  const shippingServiceId = useWatch({ control, name: "shippingServiceId" });

  const subtotalCents = items.reduce((sum, item) => sum + item.estimatedUnitPriceCents * item.quantity, 0);
  const selectedQuote = quotes.find((quote) => quote.serviceId === shippingServiceId);
  const shippingCostCents = deliveryMethod === "superfrete" ? (selectedQuote?.priceCents ?? 0) : 0;
  const totalCents = subtotalCents + shippingCostCents;

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
      const result = await getShippingQuotes(getValues("zipCode") ?? "", items);
      setQuotes(result.quotes);
      setQuoteError(result.error ?? (result.quotes.length === 0 ? "Nenhuma opção de frete encontrada pra esse CEP." : null));
    });
  }

  function onSubmit(values: CheckoutFormValues) {
    setServerError(null);
    startTransition(async () => {
      const result = await submitOrder({
        customerName: values.customerName,
        customerEmail: values.customerEmail,
        customerPhone: values.customerPhone,
        deliveryMethod: values.deliveryMethod,
        shippingAddress:
          values.deliveryMethod === "superfrete"
            ? {
                recipientName: values.customerName,
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
        items,
      });

      if (result.error) {
        setServerError(result.error);
        return;
      }

      clearCart();
      router.push(`/pedido/${result.orderToken}`);
    });
  }

  if (items.length === 0) {
    return <p className="text-muted-foreground">Seu carrinho está vazio.</p>;
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-6">
      <div className="flex flex-col gap-4">
        <div className="flex flex-col gap-2">
          <Label htmlFor="customerName">Nome</Label>
          <Input id="customerName" {...register("customerName")} />
          {errors.customerName ? <p className="text-sm text-destructive">{errors.customerName.message}</p> : null}
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="customerEmail">E-mail</Label>
          <Input id="customerEmail" type="email" {...register("customerEmail")} />
          <p className="text-xs text-muted-foreground">Enviamos o link de acompanhamento do pedido pra ele.</p>
          {errors.customerEmail ? <p className="text-sm text-destructive">{errors.customerEmail.message}</p> : null}
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="customerPhone">Telefone (opcional)</Label>
          <Input id="customerPhone" {...register("customerPhone")} />
        </div>
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

        {deliveryMethod === "pickup" ? (
          <p className="mt-3 rounded-xl bg-muted/40 p-4 text-sm text-muted-foreground">
            Combinamos o local/horário por e-mail depois da confirmação.
          </p>
        ) : (
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
                {errors.neighborhood ? <p className="text-sm text-destructive">{errors.neighborhood.message}</p> : null}
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
        )}
      </div>

      <div className="flex flex-col gap-1 border-t pt-4">
        <div className="flex items-center justify-between text-sm text-muted-foreground">
          <span>Subtotal</span>
          <span>{formatPriceCents(subtotalCents)}</span>
        </div>
        {deliveryMethod === "superfrete" ? (
          <div className="flex items-center justify-between text-sm text-muted-foreground">
            <span>Frete</span>
            <span>{selectedQuote ? formatPriceCents(shippingCostCents) : "—"}</span>
          </div>
        ) : null}
        <div className="flex items-center justify-between">
          <span className="text-lg font-semibold">Total</span>
          <span className="text-lg font-semibold">{formatPriceCents(totalCents)}</span>
        </div>
      </div>

      {serverError ? <p className="text-sm text-destructive">{serverError}</p> : null}

      <Button type="submit" size="lg" disabled={isPending}>
        {isPending ? "Enviando..." : "Confirmar pedido"}
      </Button>
    </form>
  );
}
