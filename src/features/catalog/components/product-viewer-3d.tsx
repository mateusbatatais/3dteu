"use client";

import { Component, Suspense, useEffect, useMemo, type ReactNode } from "react";
import { Canvas, useLoader, useThree } from "@react-three/fiber";
import { Bounds, Environment, OrbitControls, RoundedBox } from "@react-three/drei";
import * as THREE from "three";
import { OBJLoader, STLLoader, ThreeMFLoader, type OrbitControls as OrbitControlsImpl } from "three-stdlib";

import { getMeshExtension } from "@/lib/supabase/storage-constants";

import { MmuPaintedThreeMFLoader } from "../mmu-3mf-loader";
import type { MaterialPrintProcess } from "../types";

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
  /** Muda o acabamento do material no preview (fosco/FDM vs liso e brilhante/resina) — undefined cai no fosco padrão. */
  printProcess?: MaterialPrintProcess;
  /** 1 (ou undefined) = opaco. Menor que 1 deixa a peça translúcida — pra resina tipo "Cristal". Regiões pintadas (MMU) não suportam isso, é recurso específico de FDM. */
  opacity?: number;
}

// Diferenciação visual por processo de impressão (Fase 2 do ROADMAP.md):
// resina sai da impressora com um acabamento liso e brilhante de verdade
// (clearcoat alto, pouca rugosidade); FDM tem um acabamento fosco, com as
// camadas visíveis (não simuladas aqui, só a rugosidade já ajuda a
// diferenciar). `MeshPhysicalMaterial` estende o shader do
// `MeshStandardMaterial` (mesmas variáveis internas), então o patch de
// dual-color abaixo funciona pra qualquer um dos dois sem duplicar código.
const RESIN_MATERIAL_PROPS = { roughness: 0.2, clearcoat: 0.9, clearcoatRoughness: 0.1 } as const;
const FDM_MATERIAL_PROPS = { roughness: 0.7 } as const;

// Material dual-color: um filamento com 2ª cor precisa aparecer como um
// degradê sobre a peça de verdade, não só como uma cor sólida (a mistura das
// duas cores não existe fisicamente até a peça ser impressa — não dá pra
// "misturar" um meshStandardMaterial comum). Faz isso remendando o shader
// padrão via onBeforeCompile: mistura as duas cores ao longo do eixo de
// maior extensão da geometria (em espaço local da própria malha), preservando
// a iluminação/PBR do material base em vez de trocar por um material sem
// sombra.
function buildPartMaterial(
  color: string,
  colorSecondary?: string | null,
  geometry?: THREE.BufferGeometry,
  printProcess?: MaterialPrintProcess,
  opacity?: number,
): THREE.MeshStandardMaterial | THREE.MeshPhysicalMaterial {
  const material =
    printProcess === "resin"
      ? new THREE.MeshPhysicalMaterial({ color, ...RESIN_MATERIAL_PROPS })
      : new THREE.MeshStandardMaterial({ color, ...FDM_MATERIAL_PROPS });

  // `transparent` precisa estar ligado pro WebGL respeitar `opacity` < 1 —
  // deixado desligado (padrão) pra peças opacas não pagarem o custo extra
  // de blending por engano.
  if (opacity !== undefined && opacity < 1) {
    material.transparent = true;
    material.opacity = opacity;
  }

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

interface PartColorProps {
  meshUrl: string;
  color: string;
  colorSecondary?: string | null;
  printProcess?: MaterialPrintProcess;
  opacity?: number;
}

// STL só descreve geometria (sem cor/material), então basta aplicar a cor
// escolhida direto no material — sem precisar clonar/percorrer uma cena.
function StlPart({ meshUrl, color, colorSecondary, printProcess, opacity }: PartColorProps) {
  const geometry = useLoader(STLLoader, meshUrl);
  const material = useMemo(
    () => buildPartMaterial(color, colorSecondary, geometry, printProcess, opacity),
    [geometry, color, colorSecondary, printProcess, opacity],
  );

  return <mesh geometry={geometry} material={material} />;
}

// OBJ e 3MF carregam como um grupo de objetos (podem ter várias sub-malhas,
// e o 3MF pode até vir com cor própria embutida) — clona e percorre a árvore
// pra forçar a cor escolhida em tudo, mantendo o mesmo comportamento do STL:
// uma cor por parte, escolhida pelo cliente na configuração do produto.
function retint(
  object: THREE.Object3D,
  color: string,
  colorSecondary?: string | null,
  printProcess?: MaterialPrintProcess,
  opacity?: number,
): THREE.Object3D {
  const clone = object.clone(true);
  clone.traverse((child) => {
    if (child instanceof THREE.Mesh) {
      child.material = buildPartMaterial(color, colorSecondary, child.geometry, printProcess, opacity);
    }
  });
  return clone;
}

function ObjPart({ meshUrl, color, colorSecondary, printProcess, opacity }: PartColorProps) {
  const object = useLoader(OBJLoader, meshUrl);
  const tinted = useMemo(
    () => retint(object, color, colorSecondary, printProcess, opacity),
    [object, color, colorSecondary, printProcess, opacity],
  );
  return <primitive object={tinted} />;
}

function ThreeMfPart({ meshUrl, color, colorSecondary, printProcess, opacity }: PartColorProps) {
  const object = useLoader(ThreeMFLoader, meshUrl);
  const tinted = useMemo(
    () => retint(object, color, colorSecondary, printProcess, opacity),
    [object, color, colorSecondary, printProcess, opacity],
  );
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
//
// Material construído via useMemo (instância nova a cada troca de cor/
// opacidade), não via <meshStandardMaterial> declarativo — descoberto na
// prática que o react-three-fiber, ao mutar `transparent`/`opacity` num
// material JÁ existente via prop-diff, não força o WebGLRenderer a recompor
// a lista de objetos transparentes (precisaria de `material.needsUpdate =
// true`, que o r3f não aplica sozinho pra essas props) — o resultado visual
// fica idêntico ao opaco, mesmo com os valores corretos já gravados no
// objeto (confirmado inspecionando o material real na cena via Playwright).
// Trocar a instância inteira a cada mudança (mesmo padrão já usado em
// `buildPartMaterial`/`StlPart` pro mesh real) evita o bug por completo.
function PlaceholderPart({
  color,
  colorSecondary,
  opacity,
}: {
  color: string;
  colorSecondary?: string | null;
  opacity?: number;
}) {
  const material = useMemo(() => {
    const mat = new THREE.MeshStandardMaterial({ color });
    if (opacity !== undefined && opacity < 1) {
      mat.transparent = true;
      mat.opacity = opacity;
    }
    return mat;
  }, [color, opacity]);

  const secondaryMaterial = useMemo(() => {
    if (!colorSecondary) return null;
    const mat = new THREE.MeshStandardMaterial({ color: colorSecondary });
    if (opacity !== undefined && opacity < 1) {
      mat.transparent = true;
      mat.opacity = opacity;
    }
    return mat;
  }, [colorSecondary, opacity]);

  return (
    <group>
      <RoundedBox args={[1, 1, 1]} radius={0.15} smoothness={4} material={material} />
      {secondaryMaterial ? (
        <RoundedBox
          args={[1.02, 0.2, 1.02]}
          radius={0.08}
          smoothness={4}
          position={[0, 0.5, 0]}
          material={secondaryMaterial}
        />
      ) : null}
    </group>
  );
}

function Part({ part }: { part: ViewerPart }) {
  const placeholder = <PlaceholderPart color={part.color} colorSecondary={part.colorSecondary} opacity={part.opacity} />;

  if (!part.meshUrl) {
    return placeholder;
  }

  const extension = getMeshExtension(part.meshUrl);
  let content;
  if (part.regions && part.regions.length > 0) {
    // Regiões pintadas (MMU) não suportam opacidade — é recurso de FDM, ver ViewerPart.opacity.
    content = <MmuPart meshUrl={part.meshUrl} regions={part.regions} />;
  } else if (extension === "obj") {
    content = (
      <ObjPart
        meshUrl={part.meshUrl}
        color={part.color}
        colorSecondary={part.colorSecondary}
        printProcess={part.printProcess}
        opacity={part.opacity}
      />
    );
  } else if (extension === "3mf") {
    content = (
      <ThreeMfPart
        meshUrl={part.meshUrl}
        color={part.color}
        colorSecondary={part.colorSecondary}
        printProcess={part.printProcess}
        opacity={part.opacity}
      />
    );
  } else {
    // STL é o padrão — também cai aqui se a extensão vier ausente/desconhecida.
    content = (
      <StlPart
        meshUrl={part.meshUrl}
        color={part.color}
        colorSecondary={part.colorSecondary}
        printProcess={part.printProcess}
        opacity={part.opacity}
      />
    );
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

// Expõe os controles de órbita já registrados (via `makeDefault`) pro
// componente pai — usado só pelo admin, pra ler a posição atual da câmera
// na hora de salvar um ângulo inicial customizado (ver
// ProductViewerAngleControl). Não precisa de ref no <OrbitControls>: o
// próprio drei já guarda a instância no estado global do r3f quando
// `makeDefault` está presente, e é isso que o Bounds também usa.
function CameraControlsBridge({ onReady }: { onReady: (controls: OrbitControlsImpl) => void }) {
  const controls = useThree((state) => state.controls) as OrbitControlsImpl | null;
  useEffect(() => {
    if (controls) onReady(controls);
  }, [controls, onReady]);
  return null;
}

const DEFAULT_CAMERA_POSITION: [number, number, number] = [2.5, 2, 2.5];

export function ProductViewer3D({
  parts,
  interactive = true,
  onCanvasReady,
  initialCameraPosition,
  onControlsReady,
}: {
  parts: ViewerPart[];
  /** false = sem controles de câmera; usado nas miniaturas do catálogo. */
  interactive?: boolean;
  /** Recebe o <canvas> real do WebGL — usado pra capturar a vista atual como foto (`canvas.toDataURL()`). */
  onCanvasReady?: (canvas: HTMLCanvasElement) => void;
  /** Ângulo inicial customizado (admin, ver ProductViewerAngleControl) — só
   * a DIREÇÃO desse ponto importa (o Bounds recalcula a distância sozinho
   * pra enquadrar o conteúdo), null/undefined usa o ângulo padrão de sempre. */
  initialCameraPosition?: { x: number; y: number; z: number } | null;
  /** Recebe os controles de órbita — usado só pelo admin pra ler a câmera atual ao salvar um ângulo. */
  onControlsReady?: (controls: OrbitControlsImpl) => void;
}) {
  const cameraPosition: [number, number, number] = initialCameraPosition
    ? [initialCameraPosition.x, initialCameraPosition.y, initialCameraPosition.z]
    : DEFAULT_CAMERA_POSITION;

  return (
    <div className="aspect-square w-full overflow-hidden rounded-xl bg-muted/30 ring-1 ring-foreground/10">
      <Canvas
        camera={{ position: cameraPosition, fov: 40 }}
        // preserveDrawingBuffer é necessário pra toDataURL() funcionar (por
        // padrão o WebGL limpa o buffer depois de cada frame) — só liga
        // quando alguém realmente vai capturar, custa um pouco de performance.
        gl={{ preserveDrawingBuffer: Boolean(onCanvasReady) }}
        // dpr mais alto quando vai capturar: sem isso, o canvas renderiza no
        // tamanho CSS em pixels "de verdade" (1x), e uma foto tirada de uma
        // prévia pequena saía visivelmente borrada ao ser exibida maior na
        // galeria/lightbox do produto. 3x é mais que suficiente mesmo pra
        // uma prévia pequena virar uma foto razoável.
        dpr={onCanvasReady ? [1, 3] : [1, 2]}
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
        {onControlsReady ? <CameraControlsBridge onReady={onControlsReady} /> : null}
        {/* makeDefault registra os controles no estado global do r3f — sem isso o
        Bounds não os enxerga e não ajusta o maxDistance, então um objeto maior
        que a distância fixa antiga (6) ficava com a câmera grudada nele. */}
        {interactive ? <OrbitControls makeDefault enablePan={false} /> : null}
      </Canvas>
    </div>
  );
}
