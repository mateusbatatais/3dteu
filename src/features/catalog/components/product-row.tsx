"use client";

import Link from "next/link";

import { ConfirmDeleteButton } from "@/components/confirm-delete-button";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { TableCell, TableRow } from "@/components/ui/table";
import { formatPriceCents } from "@/lib/format";

import { deleteProduct } from "../actions";

interface ProductRowData {
  id: string;
  name: string;
  status: "draft" | "published";
  basePriceCents: number;
  category: { name: string } | null;
}

export function ProductRow({ product }: { product: ProductRowData }) {
  return (
    <TableRow>
      <TableCell className="font-medium">{product.name}</TableCell>
      <TableCell>{product.category?.name ?? "—"}</TableCell>
      <TableCell>
        <Badge variant={product.status === "published" ? "default" : "secondary"}>
          {product.status === "published" ? "Publicado" : "Rascunho"}
        </Badge>
      </TableCell>
      <TableCell>{formatPriceCents(product.basePriceCents)}</TableCell>
      <TableCell className="text-right">
        <div className="flex justify-end gap-2">
          <Button
            size="sm"
            variant="outline"
            render={<Link href={`/admin/produtos/${product.id}`} />}
            nativeButton={false}
          >
            Editar
          </Button>
          <ConfirmDeleteButton
            action={deleteProduct.bind(null, product.id)}
            description={`Excluir o produto "${product.name}"? Partes, materiais, tamanhos, imagens e avaliações dele também somem. Não é possível excluir produtos que já têm pedidos.`}
          />
        </div>
      </TableCell>
    </TableRow>
  );
}
