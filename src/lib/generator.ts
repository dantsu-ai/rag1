import { CONFIG } from './config';
import { getGenerationModel } from './runtime';

const SYSTEM_PROMPT = `Answer the question based only on the provided context.
Cite the source file for each claim using [filename] notation.
If the context does not contain enough information to answer, say so explicitly.`;

/** Call the generation model with retrieved context. "Only from context" + "say if unknown" is what makes RAG trustworthy for compliance work. */
export async function generate(question: string, context: string): Promise<string> {
  const res = await fetch(`${CONFIG.ollamaUrl}/api/generate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: getGenerationModel(),
      system: SYSTEM_PROMPT,
      prompt: `CONTEXT:\n${context}\n\nQUESTION: ${question}`,
      stream: false,
    }),
  });
  if (!res.ok) throw new Error(`Ollama generate ${res.status}: ${await res.text()}`);
  const json = (await res.json()) as { response: string };
  return json.response.trim();
}
