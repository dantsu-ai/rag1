import * as lancedb from '@lancedb/lancedb';
import { CONFIG } from './config';

export interface ChunkRow {
  id: string;
  chunk_text: string;
  source_file: string;
  chunk_index: number;
  embedding: number[];
}

const TABLE = 'chunks';
let dbPromise: Promise<lancedb.Connection> | null = null;

function db(): Promise<lancedb.Connection> {
  dbPromise ??= lancedb.connect(CONFIG.dbPath);
  return dbPromise;
}

async function table(): Promise<lancedb.Table | null> {
  const conn = await db();
  const names = await conn.tableNames();
  return names.includes(TABLE) ? conn.openTable(TABLE) : null;
}

/** Upsert = delete existing chunks for the file, insert fresh. Idempotent re-ingest. */
export async function upsertChunks(rows: ChunkRow[]): Promise<void> {
  if (rows.length === 0) return;
  const conn = await db();
  const tbl = await table();
  if (!tbl) {
    await conn.createTable(TABLE, rows);
    return;
  }
  const src = rows[0].source_file.replace(/'/g, "''");
  await tbl.delete(`source_file = '${src}'`);
  await tbl.add(rows);
}

/** Remove every chunk for one source file. Returns how many rows were deleted. */
export async function deleteSource(source_file: string): Promise<number> {
  const tbl = await table();
  if (!tbl) return 0;
  const src = source_file.replace(/'/g, "''");
  const before = await tbl.countRows(`source_file = '${src}'`);
  if (before > 0) await tbl.delete(`source_file = '${src}'`);
  return before;
}

/** Cosine search — angle, not magnitude (L2 would be magnitude-sensitive). */
export async function queryStore(embedding: number[], topK: number): Promise<ChunkRow[]> {
  const tbl = await table();
  if (!tbl) return [];
  const rows = await tbl.vectorSearch(embedding).distanceType('cosine').limit(topK).toArray();
  return rows as unknown as ChunkRow[];
}

export async function listSources(): Promise<{ source_file: string; chunks: number }[]> {
  const tbl = await table();
  if (!tbl) return [];
  const all = (await tbl.query().select(['source_file']).toArray()) as { source_file: string }[];
  const counts = new Map<string, number>();
  for (const r of all) counts.set(r.source_file, (counts.get(r.source_file) ?? 0) + 1);
  return [...counts.entries()].map(([source_file, chunks]) => ({ source_file, chunks }));
}
