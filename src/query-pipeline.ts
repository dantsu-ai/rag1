import { retrieve } from './lib/retriever';
import { generate } from './lib/generator';
import { CONFIG } from './config-shim';

export interface QueryResult {
  answer: string;
  sources: { source_file: string; chunk_index: number }[];
}

const estimateTokens = (s: string) => Math.ceil(s.length / 4);

/** Trim retrieved chunks to the context budget — a request must never fail at runtime on token overflow. */
function fitChunksToContext<T extends { chunk_text: string }>(chunks: T[]): T[] {
  const budget = CONFIG.modelContextLimit * CONFIG.contextBudgetRatio;
  const kept: T[] = [];
  let used = 0;
  for (const c of chunks) {
    const t = estimateTokens(c.chunk_text);
    if (used + t > budget) break;
    kept.push(c);
    used += t;
  }
  return kept;
}

export async function answerQuestion(question: string): Promise<QueryResult> {
  const hits = fitChunksToContext(await retrieve(question));
  if (hits.length === 0) {
    return { answer: 'No documents have been ingested yet — the index is empty.', sources: [] };
  }
  const context = hits
    .map(h => `[${h.source_file}#${h.chunk_index}]\n${h.chunk_text}`)
    .join('\n\n---\n\n');
  const answer = await generate(question, context);
  return { answer, sources: hits.map(h => ({ source_file: h.source_file, chunk_index: h.chunk_index })) };
}

// CLI: bun run query "What are the security levels in IEC 62443-3-3?"
if (import.meta.main) {
  const q = process.argv.slice(2).join(' ').trim();
  if (!q) { console.error('usage: bun run query "<question>"'); process.exit(1); }
  const r = await answerQuestion(q);
  console.log(r.answer);
  console.log('\nSOURCES:');
  for (const s of r.sources) console.log(`  ${s.source_file}#${s.chunk_index}`);
}
