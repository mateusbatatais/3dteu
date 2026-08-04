"use client";

import { Suspense, useMemo } from "react";
import { Canvas } from "@react-three/fiber";
import { Bounds, Environment, OrbitControls, RoundedBox, useGLTF } from "@react-three/drei";
import * as THREE from "three";

export interface ViewerPart {
  id: string;
  /** URL do .glb (convertido do STL no upload). Null renderiza uma peça placeholder. */
  meshUrl: string | null;
  color: string;
  colorSecondary?: string | null;
}

function GltfPart({ meshUrl, color }: { meshUrl: string; color: string }) {
  const { scene } = useGLTF(meshUrl);

  const tinted = useMemo(() => {
    const clone = scene.clone(true);
    clone.traverse((child) => {
      if (child instanceof THREE.Mesh) {
        child.material = new THREE.MeshStandardMaterial({ color });
      }
    });
    return clone;
  }, [scene, color]);

  return <primitive object={tinted} />;
}

// Usado enquanto o produto ainda não tem uma malha real cadastrada no admin.
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

  return <GltfPart meshUrl={part.meshUrl} color={part.color} />;
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
