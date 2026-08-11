import { notFound, redirect } from "next/navigation";

import { getAllMaterialColorsForConfigurator } from "@/features/catalog/queries";
import { CustomModelRequestDetail } from "@/features/custom-models/components/custom-model-request-detail";
import { getCustomModelRequestById } from "@/features/custom-models/queries";
import { getOrderPublicToken } from "@/features/orders/queries";
import { createClient } from "@/lib/supabase/server";

// Área autenticada — sempre busca dados atuais, nunca pré-renderiza.
export const dynamic = "force-dynamic";

export default async function CustomModelRequestDetailPage({ params }: PageProps<"/conta/modelo-3d/[id]">) {
  const { id } = await params;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/conta/entrar");

  const request = await getCustomModelRequestById(id);
  if (!request || request.customerId !== user.id) notFound();

  const [colors, orderToken] = await Promise.all([
    getAllMaterialColorsForConfigurator(),
    request.orderId ? getOrderPublicToken(request.orderId) : Promise.resolve(null),
  ]);

  return (
    <main className="mx-auto w-full max-w-2xl flex-1 px-6 py-16">
      <CustomModelRequestDetail
        initialRequest={{
          id: request.id,
          description: request.description,
          status: request.status,
          meshFileUrl: request.meshFileUrl,
          thumbnailUrl: request.thumbnailUrl,
          weightGrams: request.weightGrams,
          widthMm: request.widthMm,
          heightMm: request.heightMm,
          depthMm: request.depthMm,
          errorMessage: request.errorMessage,
        }}
        colors={colors}
        initialOrderToken={orderToken}
      />
    </main>
  );
}
