import { ImageResponse } from "next/og";

import { getProductBySlug } from "@/features/catalog/queries";
import { formatPriceCents } from "@/lib/format";

export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

// Produtos com foto/gif real cadastrado (ProductImagesManager) usam a
// própria foto como imagem de compartilhamento; sem nenhuma, cai num card
// gerado na hora com nome + preço + marca — não dá pra "fotografar" o
// preview 3D no servidor sem um esforço bem maior (renderizar three.js
// fora do navegador), então esse card é o fallback pragmático.
export default async function ProductOpenGraphImage({ params }: PageProps<"/produtos/[slug]">) {
  const { slug } = await params;
  const product = await getProductBySlug(slug);

  if (product?.images[0]) {
    const response = await fetch(product.images[0]);
    if (response.ok) {
      const buffer = await response.arrayBuffer();
      return new Response(buffer, {
        headers: { "Content-Type": response.headers.get("content-type") ?? "image/jpeg" },
      });
    }
  }

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          background: "linear-gradient(135deg, #007cb6, #004a6e)",
          color: "white",
          padding: 80,
        }}
      >
        <div style={{ display: "flex", fontSize: 28, opacity: 0.85 }}>3D Teu — peças sob encomenda</div>
        <div style={{ display: "flex", fontSize: 64, fontWeight: 700, marginTop: 20, textAlign: "center" }}>
          {product?.name ?? "3D Teu"}
        </div>
        {product ? (
          <div style={{ display: "flex", fontSize: 36, marginTop: 24, opacity: 0.95 }}>
            {formatPriceCents(product.basePriceCents)}
          </div>
        ) : null}
      </div>
    ),
    { ...size },
  );
}
