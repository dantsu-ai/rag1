import { mkdir, unlink, stat } from 'fs/promises';
import { join, basename } from 'path';
import { answerQuestion } from './query-pipeline';
import { ingestFile, forgetInState } from './ingest-pipeline';
import { listSources, deleteSource } from './lib/store';
import { listGenerationModels } from './lib/models';
import { getGenerationModel, setGenerationModel } from './lib/runtime';
import { CONFIG } from './config-shim';

await mkdir(CONFIG.uploadsPath, { recursive: true });

const UI_PATH = join(import.meta.dir, 'public', 'index.html');
const ACCEPTED = new Set(['.pdf', '.txt', '.md']);

const server = Bun.serve({
  port: CONFIG.serverPort,
  hostname: CONFIG.bindAddress,
  idleTimeout: 240, // generation can take minutes on first token
  async fetch(req) {
    const url = new URL(req.url);
    const p = url.pathname;

    // ── UI ──
    if (p === '/' || p === '/index.html') {
      return new Response(Bun.file(UI_PATH), { headers: { 'Content-Type': 'text/html; charset=utf-8' } });
    }

    // ── health / sources ──
    if (p === '/health') {
      return Response.json({ status: 'ok', model: getGenerationModel(), port: CONFIG.serverPort });
    }
    if (p === '/sources') {
      return Response.json(await listSources());
    }

    // ── models: list + select (generation model, runtime-switchable) ──
    if (p === '/models' && req.method === 'GET') {
      try {
        return Response.json({ current: getGenerationModel(), models: await listGenerationModels() });
      } catch (e) {
        return Response.json({ error: String(e) }, { status: 502 });
      }
    }
    if (p === '/model' && req.method === 'POST') {
      const body = (await req.json().catch(() => ({}))) as { model?: string };
      if (!body.model) return Response.json({ error: 'body { "model": "..." } required' }, { status: 400 });
      const available = (await listGenerationModels()).map(m => m.name);
      if (!available.includes(body.model)) {
        return Response.json({ error: `unknown model "${body.model}"`, available }, { status: 400 });
      }
      setGenerationModel(body.model);
      return Response.json({ current: getGenerationModel() });
    }

    // ── query (GET ?q= or POST {question}) ──
    if (p === '/query') {
      let q = url.searchParams.get('q') ?? '';
      if (!q && req.method === 'POST') q = ((await req.json().catch(() => ({}))) as { question?: string }).question ?? '';
      if (!q) return Response.json({ error: 'missing question' }, { status: 400 });
      try {
        return Response.json(await answerQuestion(q));
      } catch (e) {
        return Response.json({ error: String(e) }, { status: 500 });
      }
    }

    // ── upload (multipart, one or many files) ──
    if (p === '/upload' && req.method === 'POST') {
      const form = await req.formData();
      const files = form.getAll('file').filter((f): f is File => f instanceof File);
      if (files.length === 0) return Response.json({ error: 'multipart field "file" required' }, { status: 400 });
      const results: Array<{ file: string; chunks?: number; error?: string }> = [];
      for (const file of files) {
        const name = basename(file.name);
        const ext = name.slice(name.lastIndexOf('.')).toLowerCase();
        if (!ACCEPTED.has(ext)) { results.push({ file: name, error: `unsupported type ${ext}` }); continue; }
        try {
          const dest = join(CONFIG.uploadsPath, name);
          await Bun.write(dest, file);
          results.push({ file: name, chunks: await ingestFile(dest) });
        } catch (e) {
          results.push({ file: name, error: String(e) });
        }
      }
      return Response.json({ results });
    }

    // ── delete one or more indexed documents (index + stored original + ingest-state) ──
    if (p === '/delete' && req.method === 'POST') {
      const body = (await req.json().catch(() => ({}))) as { files?: string[]; file?: string };
      const requested = body.files ?? (body.file ? [body.file] : []);
      if (requested.length === 0) return Response.json({ error: 'body { "files": ["..."] } required' }, { status: 400 });
      if (requested.length > 1000) return Response.json({ error: 'too many files (max 1000)' }, { status: 400 });
      const files = [...new Set(requested.map(String))]; // dedupe
      const results: Array<{ file: string; chunks_removed: number; original_purged: boolean; error?: string }> = [];
      for (const raw of files) {
        // basename() strips any directory parts; reject '', '.', '..' so we never touch a directory or escape uploadsPath.
        const name = basename(raw);
        if (!name || name === '.' || name === '..') {
          results.push({ file: raw, chunks_removed: 0, original_purged: false, error: 'invalid name' });
          continue;
        }
        try {
          const chunks_removed = await deleteSource(name);
          let original_purged = false;
          const orig = join(CONFIG.uploadsPath, name);
          try {
            if ((await stat(orig)).isFile()) { await unlink(orig); original_purged = true; }
          } catch { /* original not present — nothing to purge */ }
          await forgetInState(name);
          results.push({ file: name, chunks_removed, original_purged });
        } catch (e) {
          // one bad entry must never abort the batch or 500 the request
          results.push({ file: name, chunks_removed: 0, original_purged: false, error: String(e) });
        }
      }
      return Response.json({ results });
    }

    return Response.json(
      { error: 'not found', endpoints: ['GET /', 'GET /health', 'GET /models', 'POST /model', 'GET /query?q=', 'POST /query', 'GET /sources', 'POST /upload', 'POST /delete'] },
      { status: 404 },
    );
  },
});

console.log(`RAG server listening on http://${CONFIG.bindAddress}:${server.port} as uid ${process.getuid?.()}`);
