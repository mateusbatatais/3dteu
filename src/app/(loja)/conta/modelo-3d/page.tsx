import Link from "next/link";
import { redirect } from "next/navigation";

import { Badge } from "@/components/ui/badge";
import { NewCustomModelRequestForm } from "@/features/custom-models/components/new-custom-model-request-form";
import { CUSTOM_MODEL_REQUEST_STATUS_BADGE_CLASSES, CUSTOM_MODEL_REQUEST_STATUS_LABELS } from "@/features/custom-models/types";
import { getCustomModelRequestsByCustomerId } from "@/features/custom-models/queries";
import { createClient } from "@/lib/supabase/server";

// Área autenticada — sempre busca dados atuais, nunca pré-renderiza.
export const dynamic = "force-dynamic";

export default async function CustomModelRequestsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/conta/entrar");

  const requests = await getCustomModelRequestsByCustomerId(user.id);

  return (
    <main className="mx-auto w-full max-w-2xl flex-1 px-6 py-16">
      <h1 className="text-3xl font-semibold tracking-tight">Pedir modelo customizado</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Descreva o que você quer e mande fotos — a IA gera um preview 3D antes de qualquer cobrança. Se gostar, você
        escolhe o material e confirma o pedido. Limite de 1 geração por dia.
      </p>

      <div className="mt-6">
        <NewCustomModelRequestForm />
      </div>

      {requests.length > 0 ? (
        <div className="mt-10">
          <h2 className="text-lg font-medium">Seus pedidos anteriores</h2>
          <div className="mt-4 flex flex-col gap-3">
            {requests.map((request) => (
              <Link
                key={request.id}
                href={`/conta/modelo-3d/${request.id}`}
                className="flex items-center justify-between rounded-xl bg-card p-4 ring-1 ring-foreground/10 transition-shadow hover:shadow-md"
              >
                <div>
                  <p className="line-clamp-1 font-medium">{request.description}</p>
                  <p className="text-sm text-muted-foreground">{request.createdAt.toLocaleDateString("pt-BR")}</p>
                </div>
                <Badge variant="outline" className={CUSTOM_MODEL_REQUEST_STATUS_BADGE_CLASSES[request.status]}>
                  {CUSTOM_MODEL_REQUEST_STATUS_LABELS[request.status]}
                </Badge>
              </Link>
            ))}
          </div>
        </div>
      ) : null}
    </main>
  );
}
