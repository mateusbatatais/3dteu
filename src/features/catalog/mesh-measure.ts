import * as THREE from "three";
import { OBJLoader, STLLoader, ThreeMFLoader } from "three-stdlib";

import type { MeshExtension } from "@/lib/supabase/storage-constants";

export interface MeshDimensionsMm {
  widthMm: number;
  heightMm: number;
  depthMm: number;
}

/**
 * Mede a bounding box do arquivo 3D direto no navegador, no arquivo que o
 * admin acabou de escolher — mesma técnica (ler antes de subir) já usada em
 * detectPaintedStates. STL/OBJ/3MF não têm unidade explícita; assume
 * milímetros, convenção universal de fatiadores/impressão 3D.
 */
export async function measureMeshDimensionsMm(file: File, extension: MeshExtension): Promise<MeshDimensionsMm | null> {
  try {
    const buffer = await file.arrayBuffer();
    const box = new THREE.Box3();

    if (extension === "stl") {
      const geometry = new STLLoader().parse(buffer);
      geometry.computeBoundingBox();
      if (!geometry.boundingBox) return null;
      box.copy(geometry.boundingBox);
    } else if (extension === "obj") {
      const object = new OBJLoader().parse(new TextDecoder().decode(buffer));
      box.setFromObject(object);
    } else {
      // .3mf pintado (MMU) ou não — pra medida só a geometria importa, a
      // segmentação por região não muda a bounding box.
      const object = new ThreeMFLoader().parse(buffer);
      box.setFromObject(object);
    }

    if (box.isEmpty()) return null;

    const size = new THREE.Vector3();
    box.getSize(size);
    return { widthMm: size.x, heightMm: size.y, depthMm: size.z };
  } catch {
    return null;
  }
}
