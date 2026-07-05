import { embedText } from './embedder';
import { queryStore, type ChunkRow } from './store';
import { CONFIG } from './config';

/** Embed the question, cosine-search the store, return top-K chunks. */
export async function retrieve(question: string, topK = CONFIG.topK): Promise<ChunkRow[]> {
  const qEmbedding = await embedText(question);
  return queryStore(qEmbedding, topK);
}
