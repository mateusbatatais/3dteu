import * as THREE from "three";
import { OBJLoader, STLLoader, ThreeMFLoader } from "three-stdlib";

import type { MeshExtension } from "@/lib/supabase/storage-constants";

export interface MeshMeasurements {
  widthMm: number;
  heightMm: number;
  depthMm: number;
  /** Volume real do sólido (não da bounding box) — usado pra estimar peso. */
  volumeMm3: number;
  /** Área da superfície externa — usada pra estimar o volume das paredes. */
  surfaceAreaMm2: number;
}

// Soma o volume assinado de cada triângulo (tetraedro formado com a origem)
// — fórmula padrão pra volume de malha fechada — e a área de cada
// triângulo, em espaço de mundo (aplica matrixWorld, importante pro OBJ/3MF
// que podem ter transformações em sub-objetos). Só funciona direito em
// malhas fechadas/manifold, mas é exatamente o que um arquivo pronto pra
// impressão 3D precisa ser — se não for, o resultado ainda serve como
// aproximação razoável.
function accumulateVolumeAndArea(object: THREE.Object3D, acc: { volume: number; area: number }) {
  object.updateMatrixWorld(true);

  const pA = new THREE.Vector3();
  const pB = new THREE.Vector3();
  const pC = new THREE.Vector3();
  const edge1 = new THREE.Vector3();
  const edge2 = new THREE.Vector3();
  const cross = new THREE.Vector3();

  object.traverse((child) => {
    if (!(child instanceof THREE.Mesh)) return;
    const position = child.geometry.attributes.position;
    if (!position) return;
    const index = child.geometry.index;
    const triangleCount = index ? index.count / 3 : position.count / 3;

    for (let i = 0; i < triangleCount; i++) {
      const ia = index ? index.getX(i * 3) : i * 3;
      const ib = index ? index.getX(i * 3 + 1) : i * 3 + 1;
      const ic = index ? index.getX(i * 3 + 2) : i * 3 + 2;

      pA.fromBufferAttribute(position, ia).applyMatrix4(child.matrixWorld);
      pB.fromBufferAttribute(position, ib).applyMatrix4(child.matrixWorld);
      pC.fromBufferAttribute(position, ic).applyMatrix4(child.matrixWorld);

      acc.volume += pA.dot(cross.copy(pB).cross(pC)) / 6;

      edge1.copy(pB).sub(pA);
      edge2.copy(pC).sub(pA);
      acc.area += 0.5 * cross.copy(edge1).cross(edge2).length();
    }
  });
}

/**
 * Mede a bounding box + volume + área de superfície do arquivo 3D direto no
 * navegador, no arquivo que o admin acabou de escolher — mesma técnica (ler
 * antes de subir) já usada em detectPaintedStates. STL/OBJ/3MF não têm
 * unidade explícita; assume milímetros, convenção universal de fatiadores.
 */
export async function measureMesh(file: File, extension: MeshExtension): Promise<MeshMeasurements | null> {
  try {
    const buffer = await file.arrayBuffer();
    const box = new THREE.Box3();
    const acc = { volume: 0, area: 0 };

    if (extension === "stl") {
      const geometry = new STLLoader().parse(buffer);
      geometry.computeBoundingBox();
      if (!geometry.boundingBox) return null;
      box.copy(geometry.boundingBox);
      accumulateVolumeAndArea(new THREE.Mesh(geometry), acc);
    } else if (extension === "obj") {
      const object = new OBJLoader().parse(new TextDecoder().decode(buffer));
      box.setFromObject(object);
      accumulateVolumeAndArea(object, acc);
    } else {
      // .3mf pintado (MMU) ou não — pra medida só a geometria importa, a
      // segmentação por região não muda o volume.
      const object = new ThreeMFLoader().parse(buffer);
      box.setFromObject(object);
      accumulateVolumeAndArea(object, acc);
    }

    if (box.isEmpty()) return null;

    const size = new THREE.Vector3();
    box.getSize(size);
    return {
      widthMm: size.x,
      heightMm: size.y,
      depthMm: size.z,
      volumeMm3: Math.abs(acc.volume),
      surfaceAreaMm2: acc.area,
    };
  } catch {
    return null;
  }
}
