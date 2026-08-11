"use client";

import { Bounds, Environment, OrbitControls, useAnimations, useGLTF } from "@react-three/drei";
import { Canvas } from "@react-three/fiber";
import { Printer } from "lucide-react";
import { Component, Suspense, useEffect, useRef, type ReactNode } from "react";
import type { Group } from "three";

// Fase 5 do ROADMAP.md: reserva o espaço na home pra 2 modelos 3D animados
// (impressora FDM + resina) antes de o usuário conseguir os arquivos de
// verdade. Mesmo princípio do MeshErrorBoundary em
// catalog/components/product-viewer-3d.tsx: um arquivo ausente/corrompido
// não pode derrubar a seção inteira — aqui isso é usado de propósito
// enquanto o arquivo ainda nem existe (ver public/animatedfile1|2/LEIA-ME.txt).
class ModelErrorBoundary extends Component<{ fallback: ReactNode; children: ReactNode }, { hasError: boolean }> {
  state = { hasError: false };

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error: unknown) {
    console.error("[AnimatedModelViewer] falha ao carregar modelo animado:", error);
  }

  render() {
    return this.state.hasError ? this.props.fallback : this.props.children;
  }
}

function AnimatedGltf({ src }: { src: string }) {
  const group = useRef<Group>(null);
  const { scene, animations } = useGLTF(src);
  const { actions, names } = useAnimations(animations, group);

  useEffect(() => {
    const firstClipName = names[0];
    if (!firstClipName) return;
    const action = actions[firstClipName];
    action?.reset().play();
    return () => {
      action?.stop();
    };
  }, [actions, names]);

  return <primitive ref={group} object={scene} />;
}

function Placeholder({ label }: { label: string }) {
  return (
    <div className="flex h-full w-full flex-col items-center justify-center gap-2 text-center">
      <Printer className="size-8 text-muted-foreground" />
      <p className="text-sm font-medium">{label}</p>
      <p className="text-xs text-muted-foreground">Em breve</p>
    </div>
  );
}

/**
 * Modelo GLB animado (clip embutido, tocado em loop) — diferente de
 * `ProductViewer3D` (STL/OBJ/3MF estáticos, tingidos por cor escolhida),
 * este só reproduz a animação e os materiais originais do arquivo, sem
 * nenhuma customização. Não-interativo de propósito (decorativo, não é um
 * produto configurável).
 */
export function AnimatedModelViewer({ src, label }: { src: string; label: string }) {
  return (
    <div className="aspect-square w-full overflow-hidden rounded-xl bg-muted/30 ring-1 ring-foreground/10">
      <ModelErrorBoundary fallback={<Placeholder label={label} />}>
        <Canvas camera={{ position: [2.5, 2, 2.5], fov: 40 }}>
          <ambientLight intensity={0.7} />
          <directionalLight position={[3, 5, 2]} intensity={1.2} />
          {/* Suspense precisa ficar DENTRO do Canvas (mesmo padrão de
          ProductViewer3D) — colocado por fora, envolvendo o <Canvas>
          inteiro, o carregamento assíncrono (useGLTF/Environment) deixava o
          contexto WebGL instável (confirmado travando de verdade num teste
          local: "THREE.WebGLRenderer: Context Lost"). O ModelErrorBoundary
          continua por fora — ele só entra em ação quando o carregamento
          REJEITA (arquivo ausente/corrompido), não durante o carregamento
          em si, então funciona normalmente independente de onde o Suspense
          está. */}
          <Suspense fallback={null}>
            {/* Bounds enquadra a câmera pro tamanho real do modelo — sem
            isso, um arquivo exportado numa escala diferente do esperado
            (metros vs milímetros, por exemplo) pode ficar cortado ou
            minúsculo. makeDefault é necessário nos controles pro Bounds
            enxergá-los e ajustar maxDistance (mesma lição da rodada 9 do
            CLAUDE.md, documentada em ProductViewer3D) — mas SEM `observe`
            aqui: o modelo tem partes se movendo o tempo todo (é uma
            animação), então `observe` ficaria re-enquadrando a câmera a
            cada frame (a bounding box muda com o movimento). `fit clip`
            sem `observe` enquadra uma vez, no carregamento, e não mexe
            mais depois. */}
            <Bounds fit clip margin={1.4}>
              <AnimatedGltf src={src} />
            </Bounds>
            <Environment preset="city" />
          </Suspense>
          <OrbitControls makeDefault enablePan={false} enableZoom={false} autoRotate autoRotateSpeed={1.2} />
        </Canvas>
      </ModelErrorBoundary>
    </div>
  );
}
