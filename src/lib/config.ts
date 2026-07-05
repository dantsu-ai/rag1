const HOME = process.env.HOME ?? '';

export const CONFIG = {
  ollamaUrl: process.env.RAG_OLLAMA_URL ?? 'http://localhost:11434',
  embedModel: process.env.RAG_EMBED_MODEL ?? 'nomic-embed-text',
  generationModel: process.env.RAG_GENERATION_MODEL ?? 'llama3.1:8b',
  dbPath: process.env.RAG_DB_PATH ?? `${HOME}/.rag/db`,
  uploadsPath: process.env.RAG_UPLOADS_PATH ?? `${HOME}/.rag/uploads`,
  ingestStatePath: process.env.RAG_INGEST_STATE ?? `${HOME}/.rag/.ingest-state.json`,
  serverPort: Number(process.env.RAG_PORT ?? 3737),
  // 0.0.0.0 keeps the previous LAN-reachable behavior. Restricting this to
  // 127.0.0.1 is deliberately the first ModifyToLearn exercise.
  bindAddress: process.env.RAG_BIND ?? '0.0.0.0',
  chunkSize: 512,          // target tokens per chunk
  chunkOverlap: 64,        // tokens of sliding-window overlap
  topK: 5,
  modelContextLimit: 8192,
  contextBudgetRatio: 0.75, // auto-trim chunks before context overflow
  embedDim: 768,            // nomic-embed-text output dimension
};
