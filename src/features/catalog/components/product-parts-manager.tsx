import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { addProductPart, deleteProductPart, setPartMaterials } from "@/features/catalog/actions";

import { MeshUploadForm } from "./mesh-upload-form";

interface PartRow {
  id: string;
  name: string;
  meshFileUrl: string | null;
  materialOptions: Array<{ filamentOptionId: string }>;
}

interface MaterialOption {
  id: string;
  name: string;
  hexColor: string | null;
  hexColorSecondary: string | null;
}

export function ProductPartsManager({
  productId,
  parts,
  allMaterials,
}: {
  productId: string;
  parts: PartRow[];
  allMaterials: MaterialOption[];
}) {
  return (
    <div>
      <h2 className="text-lg font-medium">Partes, materiais e arquivo 3D</h2>
      <p className="mt-1 text-sm text-muted-foreground">
        Um produto de peça única tem uma parte só. Produtos multi-cor têm uma parte por peça impressa
        separadamente — cada uma com seu próprio arquivo .stl.
      </p>

      <div className="mt-3 flex flex-col gap-4">
        {parts.map((part) => {
          const selectedIds = new Set(part.materialOptions.map((m) => m.filamentOptionId));
          return (
            <div key={part.id} className="max-w-2xl rounded-xl bg-card p-4 ring-1 ring-foreground/10">
              <div className="flex items-center justify-between">
                <span className="font-medium">{part.name}</span>
                <form action={deleteProductPart.bind(null, productId, part.id)}>
                  <button type="submit" className="text-sm text-muted-foreground underline-offset-2 hover:underline">
                    Excluir parte
                  </button>
                </form>
              </div>

              {allMaterials.length === 0 ? (
                <p className="mt-3 text-sm text-muted-foreground">
                  Cadastre materiais em /admin/materiais antes de atribuí-los a uma parte.
                </p>
              ) : (
                <form action={setPartMaterials.bind(null, productId, part.id)} className="mt-3">
                  <div className="flex flex-wrap gap-3">
                    {allMaterials.map((material) => (
                      <label key={material.id} className="flex items-center gap-1.5 text-sm">
                        <input
                          type="checkbox"
                          name="filamentOptionId"
                          value={material.id}
                          defaultChecked={selectedIds.has(material.id)}
                          className="size-4"
                        />
                        <span
                          className="inline-block size-3.5 rounded-full border"
                          style={{
                            background: material.hexColorSecondary
                              ? `linear-gradient(135deg, ${material.hexColor} 50%, ${material.hexColorSecondary} 50%)`
                              : (material.hexColor ?? "#a1a1aa"),
                          }}
                        />
                        {material.name}
                      </label>
                    ))}
                  </div>
                  <Button type="submit" size="sm" variant="outline" className="mt-3">
                    Salvar materiais desta parte
                  </Button>
                </form>
              )}

              <MeshUploadForm productId={productId} partId={part.id} hasMesh={Boolean(part.meshFileUrl)} />
            </div>
          );
        })}
      </div>

      <form
        action={addProductPart.bind(null, productId)}
        className="mt-4 flex max-w-2xl items-end gap-3 rounded-xl bg-card p-4 ring-1 ring-foreground/10"
      >
        <div className="flex flex-1 flex-col gap-1.5">
          <Label htmlFor="partName">Nova parte</Label>
          <Input id="partName" name="name" required placeholder="corpo" />
        </div>
        <Button type="submit">Adicionar parte</Button>
      </form>
    </div>
  );
}
