import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { createFilament, deleteFilament } from "@/features/catalog/filament-actions";
import { getAllFilamentOptions } from "@/features/catalog/queries";
import { formatPriceCents } from "@/lib/format";

const FILAMENT_TYPE_LABELS = {
  solid_color: "Cor sólida",
  dual_color: "Dual-color",
  special: "Especial",
};

export default async function AdminMateriaisPage() {
  const materials = await getAllFilamentOptions();

  return (
    <div>
      <h1 className="text-2xl font-semibold tracking-tight">Materiais</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Catálogo global de filamentos. Cada parte de um produto escolhe quais destes materiais aceita.
      </p>

      <form action={createFilament} className="mt-6 flex max-w-3xl flex-wrap items-end gap-3 rounded-lg border p-4">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="name">Nome</Label>
          <Input id="name" name="name" required placeholder="Azul" className="w-40" />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="type">Tipo</Label>
          <Select name="type" defaultValue="solid_color">
            <SelectTrigger id="type" className="w-40">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="solid_color">Cor sólida</SelectItem>
              <SelectItem value="dual_color">Dual-color</SelectItem>
              <SelectItem value="special">Especial</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="hexColor">Cor (hex)</Label>
          <Input id="hexColor" name="hexColor" type="color" defaultValue="#2563eb" className="w-16 p-1" />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="hexColorSecondary">2ª cor (dual-color)</Label>
          <Input id="hexColorSecondary" name="hexColorSecondary" type="color" defaultValue="#f97316" className="w-16 p-1" />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="priceModifierReais">Adicional (R$)</Label>
          <Input
            id="priceModifierReais"
            name="priceModifierReais"
            type="number"
            step="0.01"
            defaultValue="0"
            className="w-28"
          />
        </div>
        <Button type="submit">Adicionar</Button>
      </form>

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
              <TableRow key={material.id}>
                <TableCell>
                  <span
                    className="inline-block size-6 rounded-full border"
                    style={{
                      background: material.hexColorSecondary
                        ? `linear-gradient(135deg, ${material.hexColor} 50%, ${material.hexColorSecondary} 50%)`
                        : (material.hexColor ?? "#a1a1aa"),
                    }}
                  />
                </TableCell>
                <TableCell className="font-medium">{material.name}</TableCell>
                <TableCell>{FILAMENT_TYPE_LABELS[material.type]}</TableCell>
                <TableCell>{formatPriceCents(material.priceModifierCents)}</TableCell>
                <TableCell className="text-right">
                  <form action={deleteFilament.bind(null, material.id)}>
                    <button type="submit" className="text-sm text-muted-foreground underline-offset-2 hover:underline">
                      Excluir
                    </button>
                  </form>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </div>
  );
}
