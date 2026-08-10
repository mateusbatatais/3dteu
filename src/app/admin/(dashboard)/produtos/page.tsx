import Link from "next/link";

import { Button } from "@/components/ui/button";
import { Table, TableBody, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ProductRow } from "@/features/catalog/components/product-row";
import { getAllProductsForAdmin } from "@/features/catalog/queries";

export default async function AdminProdutosPage() {
  const productList = await getAllProductsForAdmin();

  return (
    <div>
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold tracking-tight">Produtos</h1>
        <Button render={<Link href="/admin/produtos/novo" />} nativeButton={false}>
          Novo produto
        </Button>
      </div>

      {productList.length === 0 ? (
        <p className="mt-6 text-muted-foreground">Nenhum produto cadastrado ainda.</p>
      ) : (
        <Table className="mt-6">
          <TableHeader>
            <TableRow>
              <TableHead>Nome</TableHead>
              <TableHead>Categoria</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Preço base</TableHead>
              <TableHead className="text-right">Ações</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {productList.map((product) => (
              <ProductRow key={product.id} product={product} />
            ))}
          </TableBody>
        </Table>
      )}
    </div>
  );
}
