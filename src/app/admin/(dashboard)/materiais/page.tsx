import { MaterialManager } from "@/features/catalog/components/material-manager";
import { getMaterialCatalog } from "@/features/catalog/queries";

export default async function AdminMateriaisPage() {
  const materials = await getMaterialCatalog();

  return (
    <div>
      <h1 className="text-2xl font-semibold tracking-tight">Materiais</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Material (Resina/Plástico) → Tipo (PLA, Cristal...) → Cor. O preço por kg e a velocidade de impressão ficam no
        Tipo; a cor é só a aparência.
      </p>

      <div className="mt-6 max-w-3xl">
        <MaterialManager materials={materials} />
      </div>
    </div>
  );
}
