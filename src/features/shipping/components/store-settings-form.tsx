"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useState, useTransition } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

import { updateStoreSettings } from "../actions";
import { storeSettingsSchema, type StoreSettingsFormValues } from "../schemas";

interface StoreSettingsFormProps {
  settings: {
    senderName: string | null;
    senderDocument: string | null;
    senderPhone: string | null;
    zipCode: string | null;
    street: string | null;
    number: string | null;
    complement: string | null;
    neighborhood: string | null;
    city: string | null;
    state: string | null;
    pricePerGramCents: number | null;
    fixedFeeCents: number | null;
  } | null;
}

export function StoreSettingsForm({ settings }: StoreSettingsFormProps) {
  const [serverError, setServerError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<StoreSettingsFormValues>({
    resolver: zodResolver(storeSettingsSchema),
    defaultValues: {
      senderName: settings?.senderName ?? "",
      senderDocument: settings?.senderDocument ?? "",
      senderPhone: settings?.senderPhone ?? "",
      zipCode: settings?.zipCode ?? "",
      street: settings?.street ?? "",
      number: settings?.number ?? "",
      complement: settings?.complement ?? "",
      neighborhood: settings?.neighborhood ?? "",
      city: settings?.city ?? "",
      state: settings?.state ?? "",
      pricePerGramReais: settings?.pricePerGramCents ? settings.pricePerGramCents / 100 : 0,
      fixedFeeReais: settings?.fixedFeeCents ? settings.fixedFeeCents / 100 : 0,
    },
  });

  function onSubmit(values: StoreSettingsFormValues) {
    setServerError(null);
    startTransition(async () => {
      const result = await updateStoreSettings(values);
      if (result?.error) {
        setServerError(result.error);
        return;
      }
      toast.success("Endereço de remetente salvo.");
    });
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="flex max-w-xl flex-col gap-4">
      <p className="text-sm text-muted-foreground">
        Usado como remetente na emissão de etiquetas de envio pela Superfrete.
      </p>

      <div className="flex flex-col gap-2">
        <Label htmlFor="senderName">Nome do remetente</Label>
        <Input id="senderName" {...register("senderName")} />
        {errors.senderName ? <p className="text-sm text-destructive">{errors.senderName.message}</p> : null}
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="flex flex-col gap-2">
          <Label htmlFor="senderDocument">CPF ou CNPJ</Label>
          <Input id="senderDocument" {...register("senderDocument")} />
          {errors.senderDocument ? <p className="text-sm text-destructive">{errors.senderDocument.message}</p> : null}
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="senderPhone">Telefone</Label>
          <Input id="senderPhone" {...register("senderPhone")} />
          {errors.senderPhone ? <p className="text-sm text-destructive">{errors.senderPhone.message}</p> : null}
        </div>
      </div>

      <div className="flex flex-col gap-2 sm:max-w-40">
        <Label htmlFor="zipCode">CEP</Label>
        <Input id="zipCode" {...register("zipCode")} placeholder="00000-000" />
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

      <div className="mt-2 border-t pt-4">
        <h2 className="text-xs font-medium tracking-wide text-muted-foreground uppercase">Sugestão de preço</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Usados só pra sugerir um preço base ao cadastrar um produto, a partir do peso estimado do arquivo 3D — o
          admin sempre confirma antes de aplicar, nunca é automático.
        </p>
        <div className="mt-2 grid gap-4 sm:grid-cols-2">
          <div className="flex flex-col gap-2">
            <Label htmlFor="pricePerGramReais">Preço por grama (R$)</Label>
            <Input id="pricePerGramReais" type="number" step="0.01" min="0" {...register("pricePerGramReais")} />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="fixedFeeReais">Taxa fixa por peça (R$)</Label>
            <Input id="fixedFeeReais" type="number" step="0.01" min="0" {...register("fixedFeeReais")} />
          </div>
        </div>
      </div>

      {serverError ? <p className="text-sm text-destructive">{serverError}</p> : null}

      <Button type="submit" disabled={isPending} className="mt-2">
        {isPending ? "Salvando..." : "Salvar"}
      </Button>
    </form>
  );
}
