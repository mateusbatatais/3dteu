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
      <p className="mt-1 text-sm text-muted-foreground">
        Peso e preço de cada tamanho são calculados automaticamente a partir da escala — não dá pra digitar à mão.
        Peso muda com o cubo da escala (peça em 50% pesa só 12,5% do original); preço só aumenta em tamanhos maiores
        (tamanhos menores saem pelo mesmo preço do tamanho base).
      </p>

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
