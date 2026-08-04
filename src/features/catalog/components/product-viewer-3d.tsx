"use client";

import { Suspense } from "react";
import { Canvas, useLoader } from "@react-three/fiber";
import { Bounds, Environment, OrbitControls, RoundedBox } from "@react-three/drei";
import { STLLoader } from "three-stdlib";

export interface ViewerPart {
  id: string;
  /** URL do arquivo .stl enviado no admin. Null renderiza uma peça placeholder. */
  meshUrl: string | null;
  color: string;
  colorSecondary?: string | null;
}

// STL só descreve geometria (sem cor/material), então basta aplicar a cor
// escolhida direto no material — sem precisar clonar/percorrer uma cena como
// seria necessário com glTF.
function StlPart({ meshUrl, color }: { meshUrl: string; color: string }) {
  const geometry = useLoader(STLLoader, meshUrl);

  return (
    <mesh geometry={geometry}>
      <meshStandardMaterial color={color} />
    </mesh>
  );
}

// Usado enquanto a parte ainda não tem um STL cadastrado no admin.
function PlaceholderPart({ color, colorSecondary }: { color: string; colorSecondary?: string | null }) {
  return (
    <group>
      <RoundedBox args={[1, 1, 1]} radius={0.15} smoothness={4}>
        <meshStandardMaterial color={color} />
      </RoundedBox>
      {colorSecondary ? (
        <RoundedBox args={[1.02, 0.2, 1.02]} radius={0.08} smoothness={4} position={[0, 0.5, 0]}>
          <meshStandardMaterial color={colorSecondary} />
        </RoundedBox>
      ) : null}
    </group>
  );
}

function Part({ part }: { part: ViewerPart }) {
  if (!part.meshUrl) {
    return <PlaceholderPart color={part.color} colorSecondary={part.colorSecondary} />;
  }

  return <StlPart meshUrl={part.meshUrl} color={part.color} />;
}

export function ProductViewer3D({ parts }: { parts: ViewerPart[] }) {
  return (
    <div className="aspect-square w-full overflow-hidden rounded-xl bg-muted/30 ring-1 ring-foreground/10">
      <Canvas camera={{ position: [2.5, 2, 2.5], fov: 40 }}>
        <ambientLight intensity={0.7} />
        <directionalLight position={[3, 5, 2]} intensity={1} />
        <Suspense fallback={null}>
          <Bounds fit clip observe margin={1.4}>
            <group>
              {parts.map((part) => (
                <Part key={part.id} part={part} />
              ))}
            </group>
          </Bounds>
          <Environment preset="city" />
        </Suspense>
        <OrbitControls enablePan={false} minDistance={1.5} maxDistance={6} />
      </Canvas>
    </div>
  );
}
