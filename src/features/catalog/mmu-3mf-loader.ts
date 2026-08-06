import * as THREE from "three";

import { parsePaintedThreeMf } from "./mmu-3mf";

export interface MmuPaintedRegionMesh {
  state: number;
  geometry: THREE.BufferGeometry;
}

export interface MmuPaintedResult {
  regions: MmuPaintedRegionMesh[];
}

/**
 * Loader compatível com `useLoader` do react-three-fiber, no mesmo padrão do
 * STLLoader/OBJLoader/ThreeMFLoader do three-stdlib (extends THREE.Loader,
 * usa FileLoader internamente) — mas em vez de devolver uma única geometria,
 * devolve uma malha por região pintada (ver mmu-3mf.ts). Só usado quando a
 * parte tem regiões detectadas no upload; um .3mf "normal" continua pelo
 * ThreeMfPart existente.
 */
export class MmuPaintedThreeMFLoader extends THREE.Loader<MmuPaintedResult, string> {
  load(
    url: string,
    onLoad: (result: MmuPaintedResult) => void,
    onProgress?: (event: ProgressEvent) => void,
    onError?: (error: unknown) => void,
  ): void {
    const fileLoader = new THREE.FileLoader(this.manager);
    fileLoader.setPath(this.path);
    fileLoader.setResponseType("arraybuffer");
    fileLoader.setRequestHeader(this.requestHeader);
    fileLoader.setWithCredentials(this.withCredentials);

    fileLoader.load(
      url,
      (data) => {
        if (typeof data === "string") {
          onError?.(new Error("Resposta inesperada (texto) ao buscar o .3mf pintado."));
          return;
        }
        parsePaintedThreeMf(data)
          .then((parsed) => {
            const regions: MmuPaintedRegionMesh[] = parsed.groups.map((group) => {
              const geometry = new THREE.BufferGeometry();
              geometry.setAttribute("position", new THREE.BufferAttribute(group.positions, 3));
              geometry.computeVertexNormals();
              return { state: group.state, geometry };
            });
            onLoad({ regions });
          })
          .catch((error: unknown) => {
            if (onError) onError(error);
            else console.error(error);
          });
      },
      onProgress,
      onError,
    );
  }
}
