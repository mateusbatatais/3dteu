import { ConfirmDeleteButton } from "@/components/confirm-delete-button";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { addSizeOption, deleteSizeOption } from "@/features/catalog/actions";
import { formatPriceCents } from "@/lib/format";

interface SizeRow {
  id: string;
  label: string;
  scaleFactor: string | number;
  priceModifierCents: number;
  weightModifierGrams: number;
}

export function ProductSizesManager({ productId, sizes }: { productId: string; sizes: SizeRow[] }) {
  return (
    <div>
      <h2 className="text-lg font-medium">Tamanhos</h2>

      {sizes.length > 0 ? (
        <Table className="mt-3 max-w-2xl">
          <TableHeader>
            <TableRow>
              <TableHead>Label</TableHead>
              <TableHead>Escala</TableHead>
              <TableHead>Modificador</TableHead>
              <TableHead>Peso (g)</TableHead>
              <TableHead className="text-right">Ações</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {sizes.map((size) => (
              <TableRow key={size.id}>
                <TableCell className="font-medium">{size.label}</TableCell>
                <TableCell>{size.scaleFactor}x</TableCell>
                <TableCell>{formatPriceCents(size.priceModifierCents)}</TableCell>
                <TableCell>{size.weightModifierGrams >= 0 ? "+" : ""}{size.weightModifierGrams}</TableCell>
                <TableCell className="text-right">
                  <ConfirmDeleteButton
                    action={deleteSizeOption.bind(null, productId, size.id)}
                    description={`Excluir o tamanho "${size.label}"? Pedidos já feitos não são afetados.`}
                  />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      ) : (
        <p className="mt-2 text-sm text-muted-foreground">Nenhum tamanho cadastrado ainda.</p>
      )}

      <form
        action={addSizeOption.bind(null, productId)}
        className="mt-4 flex max-w-2xl flex-wrap items-end gap-3 rounded-xl bg-card ring-1 ring-foreground/10 p-4"
      >
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="label">Label</Label>
          <Input id="label" name="label" required placeholder="M" className="w-20" />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="scaleFactor">Escala</Label>
          <Input id="scaleFactor" name="scaleFactor" type="number" step="0.01" defaultValue="1" className="w-24" />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="priceModifierReais">Modificador (R$)</Label>
          <Input
            id="priceModifierReais"
            name="priceModifierReais"
            type="number"
            step="0.01"
            defaultValue="0"
            className="w-28"
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="weightModifierGrams">Peso (g)</Label>
          <Input id="weightModifierGrams" name="weightModifierGrams" type="number" defaultValue="0" className="w-24" />
        </div>
        <Button type="submit">Adicionar tamanho</Button>
      </form>
    </div>
  );
}
