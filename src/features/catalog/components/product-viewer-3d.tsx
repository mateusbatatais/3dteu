"use client";

import { Component, Suspense, useEffect, useMemo, type ReactNode } from "react";
import { Canvas, useLoader, useThree } from "@react-three/fiber";
import { Bounds, Environment, OrbitControls, RoundedBox } from "@react-three/drei";
import * as THREE from "three";
import { OBJLoader, STLLoader, ThreeMFLoader } from "three-stdlib";

import { getMeshExtension } from "@/lib/supabase/storage-constants";

import { MmuPaintedThreeMFLoader } from "../mmu-3mf-loader";

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
  /** Presente só quando o .3mf tem regiões pintadas (MMU) — uma cor por região, em vez de uma cor pra peça inteira. */
  regions?: Array<{ paintState: number; color: string }>;
}

// Material dual-color: um filamento com 2ª cor precisa aparecer como um
// degradê sobre a peça de verdade, não só como uma cor sólida (a mistura das
// duas cores não existe fisicamente até a peça ser impressa — não dá pra
// "misturar" um meshStandardMaterial comum). Faz isso remendando o shader
// padrão via onBeforeCompile: mistura as duas cores ao longo do eixo de
// maior extensão da geometria (em espaço local da própria malha), preservando
// a iluminação/PBR do MeshStandardMaterial em vez de trocar por um material
// sem sombra.
function buildPartMaterial(color: string, colorSecondary?: string | null, geometry?: THREE.BufferGeometry): THREE.MeshStandardMaterial {
  const material = new THREE.MeshStandardMaterial({ color });
  if (!colorSecondary || !geometry) return material;

  geometry.computeBoundingBox();
  const box = geometry.boundingBox;
  if (!box) return material;

  const size = new THREE.Vector3();
  box.getSize(size);
  const axis = size.x >= size.y && size.x >= size.z ? "x" : size.y >= size.z ? "y" : "z";
  const gradMin = box.min[axis];
  const gradMax = Math.max(box.max[axis], gradMin + 0.0001);

  material.onBeforeCompile = (shader) => {
    shader.uniforms.colorA = { value: new THREE.Color(color) };
    shader.uniforms.colorB = { value: new THREE.Color(colorSecondary) };
    shader.uniforms.gradMin = { value: gradMin };
    shader.uniforms.gradMax = { value: gradMax };

    shader.vertexShader = shader.vertexShader
      .replace("#include <common>", "#include <common>\nvarying vec3 vGradPosition;")
      .replace("#include <begin_vertex>", "#include <begin_vertex>\nvGradPosition = position;");

    shader.fragmentShader = shader.fragmentShader
      .replace(
        "#include <common>",
        "#include <common>\nvarying vec3 vGradPosition;\nuniform vec3 colorA;\nuniform vec3 colorB;\nuniform float gradMin;\nuniform float gradMax;",
      )
      .replace(
        "vec4 diffuseColor = vec4( diffuse, opacity );",
        `float gradT = clamp((vGradPosition.${axis} - gradMin) / (gradMax - gradMin), 0.0, 1.0);
        vec4 diffuseColor = vec4( mix( colorA, colorB, gradT ), opacity );`,
      );
  };
  material.needsUpdate = true;

  return material;
}

// STL só descreve geometria (sem cor/material), então basta aplicar a cor
// escolhida direto no material — sem precisar clonar/percorrer uma cena.
function StlPart({ meshUrl, color, colorSecondary }: { meshUrl: string; color: string; colorSecondary?: string | null }) {
  const geometry = useLoader(STLLoader, meshUrl);
  const material = useMemo(() => buildPartMaterial(color, colorSecondary, geometry), [geometry, color, colorSecondary]);

  return <mesh geometry={geometry} material={material} />;
}

// OBJ e 3MF carregam como um grupo de objetos (podem ter várias sub-malhas,
// e o 3MF pode até vir com cor própria embutida) — clona e percorre a árvore
// pra forçar a cor escolhida em tudo, mantendo o mesmo comportamento do STL:
// uma cor por parte, escolhida pelo cliente na configuração do produto.
function retint(object: THREE.Object3D, color: string, colorSecondary?: string | null): THREE.Object3D {
  const clone = object.clone(true);
  clone.traverse((child) => {
    if (child instanceof THREE.Mesh) {
      child.material = buildPartMaterial(color, colorSecondary, child.geometry);
    }
  });
  return clone;
}

function ObjPart({ meshUrl, color, colorSecondary }: { meshUrl: string; color: string; colorSecondary?: string | null }) {
  const object = useLoader(OBJLoader, meshUrl);
  const tinted = useMemo(() => retint(object, color, colorSecondary), [object, color, colorSecondary]);
  return <primitive object={tinted} />;
}

function ThreeMfPart({ meshUrl, color, colorSecondary }: { meshUrl: string; color: string; colorSecondary?: string | null }) {
  const object = useLoader(ThreeMFLoader, meshUrl);
  const tinted = useMemo(() => retint(object, color, colorSecondary), [object, color, colorSecondary]);
  return <primitive object={tinted} />;
}

// .3mf com regiões pintadas (MMU) — cada região é sua própria BufferGeometry
// (ver mmu-3mf.ts/mmu-3mf-loader.ts), tingida com a cor escolhida pra ela.
function MmuPart({ meshUrl, regions }: { meshUrl: string; regions: NonNullable<ViewerPart["regions"]> }) {
  const { regions: loadedRegions } = useLoader(MmuPaintedThreeMFLoader, meshUrl);
  const colorByState = useMemo(() => new Map(regions.map((r) => [r.paintState, r.color])), [regions]);

  return (
    <group>
      {loadedRegions.map((region) => (
        <mesh key={region.state} geometry={region.geometry}>
          <meshStandardMaterial color={colorByState.get(region.state) ?? "#a1a1aa"} />
        </mesh>
      ))}
    </group>
  );
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
  if (part.regions && part.regions.length > 0) {
    content = <MmuPart meshUrl={part.meshUrl} regions={part.regions} />;
  } else if (extension === "obj") {
    content = <ObjPart meshUrl={part.meshUrl} color={part.color} colorSecondary={part.colorSecondary} />;
  } else if (extension === "3mf") {
    content = <ThreeMfPart meshUrl={part.meshUrl} color={part.color} colorSecondary={part.colorSecondary} />;
  } else {
    // STL é o padrão — também cai aqui se a extensão vier ausente/desconhecida.
    content = <StlPart meshUrl={part.meshUrl} color={part.color} colorSecondary={part.colorSecondary} />;
  }

  // Se o arquivo falhar ao carregar, cai pro placeholder em vez de derrubar
  // as outras partes do mesmo produto.
  return <MeshErrorBoundary fallback={placeholder}>{content}</MeshErrorBoundary>;
}

// Expõe o <canvas> de verdade do WebGL pro componente pai (via callback) —
// usado só quando o admin quer capturar a vista atual como foto (ver
// PartThumbnailCapture). `useThree` só funciona dentro do <Canvas>, por
// isso precisa ser um filho dele, não algo que o pai consiga pegar direto.
function CanvasCaptureBridge({ onReady }: { onReady: (canvas: HTMLCanvasElement) => void }) {
  const { gl } = useThree();
  useEffect(() => {
    onReady(gl.domElement);
  }, [gl, onReady]);
  return null;
}

export function ProductViewer3D({
  parts,
  interactive = true,
  onCanvasReady,
}: {
  parts: ViewerPart[];
  /** false = sem controles de câmera; usado nas miniaturas do catálogo. */
  interactive?: boolean;
  /** Recebe o <canvas> real do WebGL — usado pra capturar a vista atual como foto (`canvas.toDataURL()`). */
  onCanvasReady?: (canvas: HTMLCanvasElement) => void;
}) {
  return (
    <div className="aspect-square w-full overflow-hidden rounded-xl bg-muted/30 ring-1 ring-foreground/10">
      <Canvas
        camera={{ position: [2.5, 2, 2.5], fov: 40 }}
        // preserveDrawingBuffer é necessário pra toDataURL() funcionar (por
        // padrão o WebGL limpa o buffer depois de cada frame) — só liga
        // quando alguém realmente vai capturar, custa um pouco de performance.
        gl={{ preserveDrawingBuffer: Boolean(onCanvasReady) }}
      >
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
        {onCanvasReady ? <CanvasCaptureBridge onReady={onCanvasReady} /> : null}
        {/* makeDefault registra os controles no estado global do r3f — sem isso o
        Bounds não os enxerga e não ajusta o maxDistance, então um objeto maior
        que a distância fixa antiga (6) ficava com a câmera grudada nele. */}
        {interactive ? <OrbitControls makeDefault enablePan={false} /> : null}
      </Canvas>
    </div>
  );
}
