import { readdir, stat, readFile, writeFile, mkdir } from 'fs/promises';
import { existsSync } from 'fs';
import { join, extname, basename } from 'path';
import { extractText } from './lib/extractor';
import { chunkText } from './lib/chunker';
import { embedText } from './lib/embedder';
import { upsertChunks, type ChunkRow } from './lib/store';
import { CONFIG } from './config-shim';

const SUPPORTED = new Set(['.pdf', '.md', '.txt']);

type IngestState = Record<string, number>; // path -> mtimeMs at last ingest

async function loadState(): Promise<IngestState> {
  if (!existsSync(CONFIG.ingestStatePath)) return {};
  try { return JSON.parse(await readFile(CONFIG.ingestStatePath, 'utf-8')); } catch { return {}; }
}

async function saveState(state: IngestState): Promise<void> {
  await writeFile(CONFIG.ingestStatePath, JSON.stringify(state, null, 1), 'utf-8');
}

export async function ingestFile(filePath: string): Promise<number> {
  const text = await extractText(filePath);
  const chunks = chunkText(text);
  const source = basename(filePath);
  const rows: ChunkRow[] = [];
  for (let i = 0; i < chunks.length; i++) {
    rows.push({
      id: `${source}#${i}`,
      chunk_text: chunks[i],
      source_file: source,
      chunk_index: i,
      embedding: await embedText(chunks[i]),
    });
  }
  await upsertChunks(rows);
  return rows.length;
}

/** Incremental directory ingest — skips files whose mtime is unchanged. */
export async function ingestDir(dir: string): Promise<void> {
  const state = await loadState();
  const entries = await readdir(dir);
  for (const name of entries) {
    const p = join(dir, name);
    if (!SUPPORTED.has(extname(name).toLowerCase())) continue;
    const s = await stat(p);
    if (state[p] === s.mtimeMs) { console.log(`skip (unchanged): ${name}`); continue; }
    console.log(`ingesting: ${name} ...`);
    const n = await ingestFile(p);
    state[p] = s.mtimeMs;
    console.log(`  ${n} chunks indexed`);
    await saveState(state);
  }
}

if (import.meta.main) {
  const dirFlag = process.argv.indexOf('--dir');
  const target = dirFlag >= 0 ? process.argv[dirFlag + 1] : CONFIG.uploadsPath;
  if (!existsSync(target)) await mkdir(target, { recursive: true });
  await ingestDir(target);
  console.log('ingest complete');
}
