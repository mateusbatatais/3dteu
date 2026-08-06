import { Table, TableBody, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { FilamentForm } from "@/features/catalog/components/filament-form";
import { FilamentRow } from "@/features/catalog/components/filament-row";
import { createFilament } from "@/features/catalog/filament-actions";
import { getAllFilamentOptions } from "@/features/catalog/queries";

export default async function AdminMateriaisPage() {
  const materials = await getAllFilamentOptions();

  return (
    <div>
      <h1 className="text-2xl font-semibold tracking-tight">Materiais</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Catálogo global de filamentos. Cada parte de um produto escolhe quais destes materiais aceita.
      </p>

      <h2 className="mt-6 text-xs font-medium tracking-wide text-muted-foreground uppercase">Novo material</h2>
      <div className="mt-2">
        <FilamentForm mode="create" onSubmit={createFilament} />
      </div>

      {materials.length === 0 ? (
        <p className="mt-6 text-muted-foreground">Nenhum material cadastrado ainda.</p>
      ) : (
        <Table className="mt-6 max-w-3xl">
          <TableHeader>
            <TableRow>
              <TableHead>Cor</TableHead>
              <TableHead>Nome</TableHead>
              <TableHead>Tipo</TableHead>
              <TableHead>Adicional</TableHead>
              <TableHead className="text-right">Ações</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {materials.map((material) => (
              <FilamentRow key={material.id} material={material} />
            ))}
          </TableBody>
        </Table>
      )}
    </div>
  );
}
