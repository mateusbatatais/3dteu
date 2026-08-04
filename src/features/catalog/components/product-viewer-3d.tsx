"use client";

import { Component, Suspense, useMemo, type ReactNode } from "react";
import { Canvas, useLoader } from "@react-three/fiber";
import { Bounds, Environment, OrbitControls, RoundedBox } from "@react-three/drei";
import * as THREE from "three";
import { OBJLoader, STLLoader, ThreeMFLoader } from "three-stdlib";

import { getMeshExtension } from "@/lib/supabase/storage-constants";

// Um arquivo que falha ao carregar/parsear (corrompido, extensão errada por
// dentro, etc.) não pode derrubar o preview inteiro — sem isso, o erro sobe
// até a raiz da árvore do react-three-fiber e some TODAS as partes, não só a
// que falhou. Error Boundary é a única forma de capturar isso (Suspense só
// cobre o estado "carregando", não erro).
class MeshErrorBoundary extends Component<{ fallback: ReactNode; children: ReactNode }, { hasError: boolean }> {
  state = { hasError: false };

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error: unknown) {
    console.error("[ProductViewer3D] falha ao carregar arquivo 3D:", error);
  }

  render() {
    return this.state.hasError ? this.props.fallback : this.props.children;
  }
}

export interface ViewerPart {
  id: string;
  /** URL do arquivo 3D (.stl, .obj ou .3mf) enviado no admin. Null renderiza uma peça placeholder. */
  meshUrl: string | null;
  color: string;
  colorSecondary?: string | null;
}

// STL só descreve geometria (sem cor/material), então basta aplicar a cor
// escolhida direto no material — sem precisar clonar/percorrer uma cena.
function StlPart({ meshUrl, color }: { meshUrl: string; color: string }) {
  const geometry = useLoader(STLLoader, meshUrl);

  return (
    <mesh geometry={geometry}>
      <meshStandardMaterial color={color} />
    </mesh>
  );
}

// OBJ e 3MF carregam como um grupo de objetos (podem ter várias sub-malhas,
// e o 3MF pode até vir com cor própria embutida) — clona e percorre a árvore
// pra forçar a cor escolhida em tudo, mantendo o mesmo comportamento do STL:
// uma cor por parte, escolhida pelo cliente na configuração do produto.
function retint(object: THREE.Object3D, color: string): THREE.Object3D {
  const clone = object.clone(true);
  clone.traverse((child) => {
    if (child instanceof THREE.Mesh) {
      child.material = new THREE.MeshStandardMaterial({ color });
    }
  });
  return clone;
}

function ObjPart({ meshUrl, color }: { meshUrl: string; color: string }) {
  const object = useLoader(OBJLoader, meshUrl);
  const tinted = useMemo(() => retint(object, color), [object, color]);
  return <primitive object={tinted} />;
}

function ThreeMfPart({ meshUrl, color }: { meshUrl: string; color: string }) {
  const object = useLoader(ThreeMFLoader, meshUrl);
  const tinted = useMemo(() => retint(object, color), [object, color]);
  return <primitive object={tinted} />;
}

// Usado enquanto a parte ainda não tem um arquivo 3D cadastrado no admin.
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
  const placeholder = <PlaceholderPart color={part.color} colorSecondary={part.colorSecondary} />;

  if (!part.meshUrl) {
    return placeholder;
  }

  const extension = getMeshExtension(part.meshUrl);
  let content;
  if (extension === "obj") {
    content = <ObjPart meshUrl={part.meshUrl} color={part.color} />;
  } else if (extension === "3mf") {
    content = <ThreeMfPart meshUrl={part.meshUrl} color={part.color} />;
  } else {
    // STL é o padrão — também cai aqui se a extensão vier ausente/desconhecida.
    content = <StlPart meshUrl={part.meshUrl} color={part.color} />;
  }

  // Se o arquivo falhar ao carregar, cai pro placeholder em vez de derrubar
  // as outras partes do mesmo produto.
  return <MeshErrorBoundary fallback={placeholder}>{content}</MeshErrorBoundary>;
}

export function ProductViewer3D({
  parts,
  interactive = true,
}: {
  parts: ViewerPart[];
  /** false = sem controles de câmera; usado nas miniaturas do catálogo. */
  interactive?: boolean;
}) {
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
        {interactive ? <OrbitControls enablePan={false} minDistance={1.5} maxDistance={6} /> : null}
      </Canvas>
    </div>
  );
}
