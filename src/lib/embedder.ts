import { CONFIG } from './config';

/** Embed text via Ollama. Guards against zero vectors (empty-input corruption). */
export async function embedText(text: string): Promise<number[]> {
  const res = await fetch(`${CONFIG.ollamaUrl}/api/embeddings`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: CONFIG.embedModel, prompt: text }),
  });
  if (!res.ok) throw new Error(`Ollama embeddings ${res.status}: ${await res.text()}`);
  const json = (await res.json()) as { embedding: number[] };
  const emb = json.embedding;
  if (!emb || emb.length !== CONFIG.embedDim) {
    throw new Error(`Bad embedding: got ${emb?.length ?? 0} dims, expected ${CONFIG.embedDim}`);
  }
  if (emb.every(v => v === 0)) {
    throw new Error('Zero-vector embedding — input was empty or model failed; refusing to index');
  }
  return emb;
}
