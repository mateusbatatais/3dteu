import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    serverActions: {
      // A Vercel tem um teto de 4,5MB por requisição em qualquer Function
      // (Server Actions inclusive) que NÃO dá pra configurar — por isso o
      // upload de STL (src/features/catalog/actions.ts) vai direto do
      // navegador pro Supabase Storage, sem passar pelo servidor. Esse limite
      // aqui é só pra outras Server Actions terem um erro claro do Next em
      // vez de um 413 opaco da Vercel, caso algum payload (não-arquivo)
      // cresça demais.
      bodySizeLimit: "4mb",
    },
  },
};

export default nextConfig;
