import { ImageResponse } from "next/og";

// Fallback pra qualquer rota sem opengraph-image própria (home, categorias,
// etc.) — os produtos têm a versão deles em produtos/[slug]/opengraph-image.tsx.
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function OpengraphImage() {
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
          background: "linear-gradient(135deg, #0a0a0c, #12151a)",
        }}
      >
        <div style={{ display: "flex", fontSize: 104, fontWeight: 800 }}>
          <span style={{ color: "#1fa6d1" }}>3D</span>
          <span style={{ color: "#f0840c", marginLeft: 20 }}>Teu</span>
        </div>
        <div style={{ display: "flex", fontSize: 32, color: "#c9ccd1", marginTop: 28 }}>
          Peças impressas em 3D sob encomenda
        </div>
      </div>
    ),
    { ...size },
  );
}
