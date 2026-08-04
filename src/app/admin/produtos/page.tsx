import Link from "next/link";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { getAllProductsForAdmin } from "@/features/catalog/queries";
import { formatPriceCents } from "@/lib/format";

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
              <TableRow key={product.id}>
                <TableCell className="font-medium">{product.name}</TableCell>
                <TableCell>{product.category?.name ?? "—"}</TableCell>
                <TableCell>
                  <Badge variant={product.status === "published" ? "default" : "secondary"}>
                    {product.status === "published" ? "Publicado" : "Rascunho"}
                  </Badge>
                </TableCell>
                <TableCell>{formatPriceCents(product.basePriceCents)}</TableCell>
                <TableCell className="text-right">
                  <Link href={`/admin/produtos/${product.id}`} className="text-sm underline-offset-2 hover:underline">
                    Editar
                  </Link>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </div>
  );
}
