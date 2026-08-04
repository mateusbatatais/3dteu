import { StoreSettingsForm } from "@/features/shipping/components/store-settings-form";
import { getStoreSettings } from "@/features/shipping/queries";

export default async function AdminConfiguracoesPage() {
  const settings = (await getStoreSettings()) ?? null;

  return (
    <div>
      <h1 className="text-2xl font-semibold tracking-tight">Configurações da loja</h1>
      <p className="mt-1 text-sm text-muted-foreground">Endereço de remetente usado para emitir etiquetas de envio.</p>

      <div className="mt-6">
        <StoreSettingsForm settings={settings} />
      </div>
    </div>
  );
}
