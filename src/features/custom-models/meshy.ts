// Cliente da API da Meshy (https://docs.meshy.ai) — Fase 4 do ROADMAP.md.
// Mesmo espírito de src/features/payments/woovi.ts: lança erro se a env var
// não estiver configurada, quem chama decide o que fazer (aqui, sempre
// try/catch + gravar status "failed", nunca deixar subir cru). Sem
// abstração de "Provider" genérica — só Woovi/Superfrete têm mais de uma
// implementação possível, a Meshy não.
//
// NUNCA TESTADO CONTRA A API REAL nesta sessão (sem MESHY_API_KEY
// disponível) — implementado contra a documentação oficial
// (docs.meshy.ai/en/api/multi-image-to-3d), mesma ressalva já registrada
// pra Woovi/Superfrete: o formato exato de request/response só se confirma
// no primeiro uso real.

const MESHY_API_URL = "https://api.meshy.ai/openapi/v1";

function meshyApiKey(): string {
  const key = process.env.MESHY_API_KEY;
  if (!key) {
    throw new Error("MESHY_API_KEY não configurada — gere uma em meshy.ai > API Settings.");
  }
  return key;
}

interface MeshyCreateTaskResponse {
  result: string;
}

/**
 * Sempre usa o endpoint multi-image (aceita 1 a 4 fotos) mesmo quando o
 * cliente manda só uma — evita ter dois caminhos (image-to-3d vs
 * multi-image-to-3d) pra manter.
 */
export async function createImageTo3DTask(imageUrls: string[]): Promise<string> {
  if (imageUrls.length === 0 || imageUrls.length > 4) {
    throw new Error("Envie de 1 a 4 fotos.");
  }

  const response = await fetch(`${MESHY_API_URL}/multi-image-to-3d`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${meshyApiKey()}`,
    },
    body: JSON.stringify({
      image_urls: imageUrls,
      target_formats: ["stl"],
      // Textura não importa aqui — a peça é pintada depois com o material
      // físico escolhido pelo cliente, não com a textura gerada pela IA.
      should_texture: false,
    }),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Falha ao criar task na Meshy (${response.status}): ${body}`);
  }

  const data = (await response.json()) as MeshyCreateTaskResponse;
  return data.result;
}

export type MeshyTaskState = "PENDING" | "IN_PROGRESS" | "SUCCEEDED" | "FAILED" | "CANCELED";

export interface MeshyTaskStatus {
  status: MeshyTaskState;
  progress: number;
  modelUrls: {
    stl?: string;
    glb?: string;
  } | null;
  thumbnailUrl: string | null;
  consumedCredits: number | null;
  taskError: string | null;
}

interface MeshyTaskResponse {
  status: MeshyTaskState;
  progress: number;
  model_urls?: { stl?: string; glb?: string };
  thumbnail_url?: string;
  consumed_credits?: number;
  task_error?: { message?: string } | null;
}

export async function getImageTo3DTask(taskId: string): Promise<MeshyTaskStatus> {
  const response = await fetch(`${MESHY_API_URL}/multi-image-to-3d/${taskId}`, {
    headers: { Authorization: `Bearer ${meshyApiKey()}` },
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Falha ao consultar task na Meshy (${response.status}): ${body}`);
  }

  const data = (await response.json()) as MeshyTaskResponse;

  return {
    status: data.status,
    progress: data.progress,
    modelUrls: data.model_urls ?? null,
    thumbnailUrl: data.thumbnail_url ?? null,
    consumedCredits: data.consumed_credits ?? null,
    taskError: data.task_error?.message ?? null,
  };
}
