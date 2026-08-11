"use client";

import { Bounds, Environment, OrbitControls, useAnimations, useGLTF } from "@react-three/drei";
import { Canvas } from "@react-three/fiber";
import { Component, Suspense, useEffect, useRef, type ReactNode } from "react";
import type { Group } from "three";

// Fase 5 do ROADMAP.md: modelo 3D animado só como um toque visual — sem
// legenda, sem explicar o que é (o usuário foi explícito: "não era pra
// falar nada, só deixa o modelo lá rodando"). Mesmo princípio do
// MeshErrorBoundary em catalog/components/product-viewer-3d.tsx: um
// arquivo ausente/corrompido não pode derrubar a seção inteira — aqui cai
// pra um espaço em branco discreto (ver Placeholder abaixo), nunca um erro
// visível nem um texto tipo "em breve".
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

// Sem ícone/texto de propósito — é só um espaço vazio discreto enquanto
// carrega ou se o arquivo falhar, nunca chama atenção pra si mesmo.
function Placeholder() {
  return <div className="size-full" />;
}

/**
 * Modelo GLB animado (clip embutido, tocado em loop) — diferente de
 * `ProductViewer3D` (STL/OBJ/3MF estáticos, tingidos por cor escolhida),
 * este só reproduz a animação e os materiais originais do arquivo, sem
 * nenhuma customização. Não-interativo de propósito (decorativo, não é um
 * produto configurável) — flutua direto no fundo da página, sem card/caixa
 * ao redor.
 */
export function AnimatedModelViewer({
  src,
  className = "",
  margin = 1.4,
}: {
  src: string;
  className?: string;
  /**
   * `Bounds` (drei) calcula a distância da câmera a partir da MAIOR
   * dimensão alinhada aos eixos da caixa do objeto (`max(size.x, size.y,
   * size.z)`) — não da esfera nem da silhueta real vista de um ângulo
   * corner (nossa câmera fica em [2.5, 2, 2.5], um ângulo de canto). Pra um
   * objeto próximo de um cubo (todas as dimensões parecidas), a silhueta
   * vista desse ângulo é bem maior que essa maior dimensão isolada — até
   * ~1.7x (raiz de 3), o pior caso geométrico de um cubo visto na
   * diagonal — e um margin baixo corta o objeto (confirmado cortando de
   * verdade em produção com um cubo mágico e margin 1.1). Já um objeto bem
   * alongado (ex.: um carro, comprido demais num eixo) já tem folga de
   * sobra mesmo com margin baixo, porque a maior dimensão sozinha já é bem
   * maior que a silhueta em qualquer ângulo. Não dá pra acertar as duas
   * formas com um valor só — por isso é uma prop, com um default seguro
   * (não corta objetos compactos/cúbicos); ajuste por instância pra
   * objetos alongados que ficam pequenos demais com o default.
   */
  margin?: number;
}) {
  return (
    <div className={`aspect-square w-full ${className}`}>
      <ModelErrorBoundary fallback={<Placeholder />}>
        <Canvas camera={{ position: [2.5, 2, 2.5], fov: 40 }} gl={{ alpha: true }}>
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
            <Bounds fit clip margin={margin}>
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
