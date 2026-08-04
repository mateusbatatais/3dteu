import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    serverActions: {
      // Server Actions limitam o corpo da requisição a 1MB por padrão — um
      // arquivo .stl real passa disso facilmente. Sem isso, o upload de
      // malha 3D no admin falha silenciosamente antes do nosso código rodar.
      bodySizeLimit: "50mb",
    },
  },
};

export default nextConfig;
