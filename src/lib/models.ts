import { CONFIG } from './config';

export interface OllamaModel { name: string; size: number; }

/** List installed Ollama models, excluding the embedding model (not valid for generation). */
export async function listGenerationModels(): Promise<OllamaModel[]> {
  const res = await fetch(`${CONFIG.ollamaUrl}/api/tags`);
  if (!res.ok) throw new Error(`Ollama tags ${res.status}`);
  const json = (await res.json()) as { models: { name: string; size: number }[] };
  return json.models
    .filter(m => !m.name.startsWith(CONFIG.embedModel))
    .map(m => ({ name: m.name, size: m.size }));
}
