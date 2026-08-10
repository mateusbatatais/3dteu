import type { MetadataRoute } from "next";

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      // /admin e /conta são áreas autenticadas; /checkout e /carrinho não têm
      // conteúdo indexável; /pedido/[token] tem dado de cliente na própria URL.
      disallow: ["/admin", "/conta", "/checkout", "/carrinho", "/pedido"],
    },
    sitemap: `${SITE_URL}/sitemap.xml`,
  };
}
