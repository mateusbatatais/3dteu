import { NewProductForm } from "@/features/catalog/components/new-product-form";
import { getAllFilamentOptions, getCategories } from "@/features/catalog/queries";
import { getStoreSettings } from "@/features/shipping/queries";

export default async function NovoProdutoPage() {
  // Sugestão de preço (a partir do peso estimado) é um extra — se essa query
  // falhar (ex.: migração de store_settings ainda não aplicada em produção),
  // a tela de cadastro não pode quebrar por causa disso. Mesmo princípio já
  // usado em /admin/produtos/[id].
  const storeSettingsPromise = getStoreSettings().catch((error: unknown) => {
    console.error("[admin] falha ao buscar configurações da loja (sugestão de preço)", error);
    return null;
  });

  const [categories, allMaterials, storeSettings] = await Promise.all([
    getCategories(),
    getAllFilamentOptions(),
    storeSettingsPromise,
  ]);

  const pricingSettings = {
    pricePerGramCents: storeSettings?.pricePerGramCents ?? null,
    fixedFeeCents: storeSettings?.fixedFeeCents ?? null,
  };

  return (
    <div>
      <h1 className="text-2xl font-semibold tracking-tight">Novo produto</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Envie o arquivo 3D de cada peça pra já preencher tamanhos, peso e dimensões automaticamente.
      </p>
      <div className="mt-6">
        <NewProductForm categories={categories} allMaterials={allMaterials} pricingSettings={pricingSettings} />
      </div>
    </div>
  );
}
