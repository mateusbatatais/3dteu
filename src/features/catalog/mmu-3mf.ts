import { unzipSync } from "fflate";

// Decodifica a extensão de "pintura MMU" da PrusaSlicer/BambuStudio dentro
// de um .3mf — um atributo por triângulo (`slic3rpe:mmu_segmentation`, ou
// `paint_color` no BambuStudio, mesmo fork) que NÃO faz parte do 3MF core
// spec e não é documentado oficialmente pela Prusa (há uma issue aberta no
// GitHub deles pedindo documentação: prusa3d/PrusaSlicer#13900). O algoritmo
// abaixo foi extraído do código-fonte real deles
// (TriangleSelector.cpp/Model.cpp) e validado rodando contra um arquivo
// pintado real (Bulbasaur.3mf, ~1M triângulos, decodificação 100% sem erros).
//
// Resumo do formato (ver TriangleSelector::serialize/deserialize):
// - O atributo é uma string hex. Invertida caractere por caractere, cada
//   caractere hex É um "nibble" (4 bits) na ordem que o decodificador espera.
// - Cada nibble: os 2 bits baixos dizem quantos lados do triângulo estão
//   divididos (0 = folha, 1/2/3 = nó dividido). Se dividido, os 2 bits altos
//   guardam o "lado especial"; senão, os 2 bits altos começam a codificar o
//   estado (prefixo: 2 bits pra estados 0-2, mais 4 bits pra 3-16, mais 8
//   bits pra 17+).
// - Estado decodificado = "extrusora": 0 = região padrão (sem pintura),
//   1-16 = Extrusora 1-16.
// - Nó dividido gera 2, 3 ou 4 filhos com fórmulas fixas de ponto médio
//   (perform_split), lidos do bitstream em ordem decrescente de índice.

export interface PaintedTriangleGroup {
  /** Estado decodificado (0 = padrão, 1-16 = Extrusora N). */
  state: number;
  /** Índices em `positions` (grupos de 3 = 1 triângulo), já não-indexado. */
  positions: Float32Array;
}

export interface ParsedMmu3mf {
  /** Uma entrada por estado distinto encontrado no arquivo. */
  groups: PaintedTriangleGroup[];
}

interface RawTriangle {
  v1: number;
  v2: number;
  v3: number;
  paint: string;
}

const MM_SEGMENTATION_ATTR = "slic3rpe:mmu_segmentation";
const MM_SEGMENTATION_ATTR_ALT = "paint_color"; // BambuStudio (fork da PrusaSlicer)

function decodeHexToNibbles(hex: string): number[] {
  const nibbles: number[] = [];
  for (let i = hex.length - 1; i >= 0; i--) {
    nibbles.push(parseInt(hex[i], 16));
  }
  return nibbles;
}

function decodeLeafState(code: number, nextNibble: () => number): number {
  if ((code & 0b1100) !== 0b1100) {
    return code >> 2;
  }
  const second = nextNibble();
  if (second !== 0b1110) {
    return second + 3;
  }
  const lo = nextNibble();
  const hi = nextNibble();
  return (lo | (hi << 4)) + 17;
}

type TriangleNode =
  | { split: false; state: number }
  | { split: true; specialSide: number; numSplitSides: number; children: TriangleNode[] };

function decodeTriangleTree(nibbles: number[]): TriangleNode {
  let i = 0;
  const nextNibble = () => nibbles[i++];

  function decodeNode(): TriangleNode {
    const code = nextNibble();
    const numSplitSides = code & 0b11;
    if (numSplitSides === 0) {
      return { split: false, state: decodeLeafState(code, nextNibble) };
    }
    const specialSide = code >> 2;
    const numChildren = numSplitSides + 1;
    const children: TriangleNode[] = new Array(numChildren);
    // Lidos em ordem decrescente de índice — mesma ordem em que o
    // serializer da PrusaSlicer escreve (reverse order, comentado no
    // código-fonte deles como "for compatibility with PrusaSlicer 2.3.1").
    for (let c = numChildren - 1; c >= 0; c--) {
      children[c] = decodeNode();
    }
    return { split: true, specialSide, numSplitSides, children };
  }

  return decodeNode();
}

type Vec3 = readonly [number, number, number];

function midpoint(a: Vec3, b: Vec3): Vec3 {
  return [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2];
}

/**
 * Reproduz TriangleSelector::perform_split: dado um triângulo (A,B,C, já
 * rotacionado a partir do special_side) e o número de lados divididos,
 * retorna os triângulos filhos (cada um como 3 vértices), na mesma ordem
 * de índice usada por push_triangle() no código-fonte original.
 */
function splitTriangleGeometry(rotated: Vec3[], numSplitSides: number): Vec3[][] {
  const [a, b, c] = rotated;
  if (numSplitSides === 1) {
    const m = midpoint(c, b);
    return [
      [a, b, m],
      [m, c, a],
    ];
  }
  if (numSplitSides === 2) {
    const m1 = midpoint(b, a);
    const m2 = midpoint(a, c);
    return [
      [a, m1, m2],
      [m1, b, m2],
      [b, c, m2],
    ];
  }
  // 3 lados divididos — special_side é sempre 0 nesse caso (garantido por quem chama).
  const m1 = midpoint(b, a);
  const m2 = midpoint(c, b);
  const m3 = midpoint(a, c);
  return [
    [a, m1, m3],
    [m1, b, m2],
    [m2, c, m3],
    [m1, m2, m3],
  ];
}

function collectLeafTriangles(
  node: TriangleNode,
  verts: Vec3[],
  out: Array<{ state: number; verts: Vec3[] }>,
): void {
  if (!node.split) {
    out.push({ state: node.state, verts });
    return;
  }

  // Rotaciona os vértices originais a partir do special_side, igual ao
  // perform_split real (`for j=0,idx=special_side; j<3; ...`).
  const rotated: Vec3[] = [0, 1, 2].map((j) => verts[(node.specialSide + j) % 3]);
  const children = splitTriangleGeometry(rotated, node.numSplitSides);

  for (let i = 0; i < node.children.length; i++) {
    collectLeafTriangles(node.children[i], children[i], out);
  }
}

function parseTrianglesFromXml(xml: string): { vertices: Vec3[]; triangles: RawTriangle[] } {
  const vertices: Vec3[] = [];
  const vertexRe = /<vertex x="([^"]+)" y="([^"]+)" z="([^"]+)"\s*\/>/g;
  let m: RegExpExecArray | null;
  while ((m = vertexRe.exec(xml))) {
    vertices.push([parseFloat(m[1]), parseFloat(m[2]), parseFloat(m[3])]);
  }

  const triangles: RawTriangle[] = [];
  const triangleRe = /<triangle\s+([^/]*)\/>/g;
  const v1Re = /\bv1="(\d+)"/;
  const v2Re = /\bv2="(\d+)"/;
  const v3Re = /\bv3="(\d+)"/;
  const paintRe = new RegExp(`(?:${MM_SEGMENTATION_ATTR}|${MM_SEGMENTATION_ATTR_ALT})="([0-9A-Fa-f]*)"`);
  while ((m = triangleRe.exec(xml))) {
    const attrs = m[1];
    const v1 = v1Re.exec(attrs);
    const v2 = v2Re.exec(attrs);
    const v3 = v3Re.exec(attrs);
    if (!v1 || !v2 || !v3) continue;
    const paint = paintRe.exec(attrs);
    triangles.push({ v1: +v1[1], v2: +v2[1], v3: +v3[1], paint: paint ? paint[1].toUpperCase() : "" });
  }

  return { vertices, triangles };
}

async function extractModelXml(file: File | ArrayBuffer): Promise<string> {
  const buffer = file instanceof File ? await file.arrayBuffer() : file;
  const zip = unzipSync(new Uint8Array(buffer), {
    filter: (entry) => entry.name === "3D/3dmodel.model",
  });
  const modelBytes = zip["3D/3dmodel.model"];
  if (!modelBytes) {
    throw new Error("Arquivo .3mf sem 3D/3dmodel.model — não é um 3MF válido.");
  }
  return new TextDecoder("utf-8").decode(modelBytes);
}

/**
 * Passagem rápida: só descobre quais estados (extrusoras) aparecem no
 * arquivo, sem construir geometria. Usado no upload pra popular
 * `product_part_regions` e mostrar "detectamos N regiões" pro admin.
 */
export async function detectPaintedStates(file: File | ArrayBuffer): Promise<number[]> {
  const xml = await extractModelXml(file);
  const { triangles } = parseTrianglesFromXml(xml);

  const states = new Set<number>();
  let anyPainted = false;
  for (const t of triangles) {
    if (t.paint === "") {
      states.add(0);
      continue;
    }
    anyPainted = true;
    const tree = decodeTriangleTree(decodeHexToNibbles(t.paint));
    collectStatesFromTree(tree, states);
  }

  // Sem nenhum triângulo com atributo de pintura: não é um 3MF pintado —
  // trata como arquivo normal (0 regiões), mesmo que todo mundo esteja "state 0".
  return anyPainted ? [...states].sort((a, b) => a - b) : [];
}

function collectStatesFromTree(node: TriangleNode, out: Set<number>): void {
  if (!node.split) {
    out.add(node.state);
  } else {
    node.children.forEach((c) => collectStatesFromTree(c, out));
  }
}

/**
 * Parse completo: decodifica todos os triângulos e agrupa por estado,
 * pronto pra virar uma BufferGeometry por região no viewer.
 */
export async function parsePaintedThreeMf(file: File | ArrayBuffer): Promise<ParsedMmu3mf> {
  const xml = await extractModelXml(file);
  const { vertices, triangles } = parseTrianglesFromXml(xml);

  const byState = new Map<number, number[]>();
  const pushTriangle = (state: number, verts: Vec3[]) => {
    let arr = byState.get(state);
    if (!arr) {
      arr = [];
      byState.set(state, arr);
    }
    for (const v of verts) arr.push(v[0], v[1], v[2]);
  };

  for (const t of triangles) {
    const verts: Vec3[] = [vertices[t.v1], vertices[t.v2], vertices[t.v3]];
    if (t.paint === "") {
      pushTriangle(0, verts);
      continue;
    }
    const tree = decodeTriangleTree(decodeHexToNibbles(t.paint));
    const leaves: Array<{ state: number; verts: Vec3[] }> = [];
    collectLeafTriangles(tree, verts, leaves);
    for (const leaf of leaves) pushTriangle(leaf.state, leaf.verts);
  }

  const groups: PaintedTriangleGroup[] = [...byState.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([state, positions]) => ({ state, positions: Float32Array.from(positions) }));

  return { groups };
}
