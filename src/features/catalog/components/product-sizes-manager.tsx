import { Table, TableBody, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { createSizeOption } from "@/features/catalog/actions";

import { SizeForm } from "./size-form";
import { SizeRow } from "./size-row";

interface SizeRowData {
  id: string;
  label: string;
  scaleFactor: string | number;
  priceModifierCents: number;
  weightModifierGrams: number;
}

export function ProductSizesManager({ productId, sizes }: { productId: string; sizes: SizeRowData[] }) {
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
              <SizeRow key={size.id} productId={productId} size={size} />
            ))}
          </TableBody>
        </Table>
      ) : (
        <p className="mt-2 text-sm text-muted-foreground">
          Nenhum tamanho cadastrado ainda. Dica: envie o arquivo 3D de uma parte primeiro (aba Partes) — 3 tamanhos
          (P/M/G) são sugeridos automaticamente a partir da medida do arquivo. Se precisar de mais, adicione abaixo.
        </p>
      )}

      <div className="mt-4 max-w-2xl">
        <SizeForm mode="create" onSubmit={createSizeOption.bind(null, productId)} />
      </div>
    </div>
  );
}
