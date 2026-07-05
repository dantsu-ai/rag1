# rag — Local RAG on a Mac (Bun · LanceDB · Ollama)

A fully local Retrieval-Augmented Generation system with a browser UI. It ingests your
documents (`.pdf`, `.txt`, `.md`), embeds them locally, stores the vectors in an embedded
database, and answers questions with cited sources — **entirely on your machine, no cloud
API calls**.

- **Runtime:** Bun + TypeScript
- **Embeddings & generation:** [Ollama](https://ollama.com) (`nomic-embed-text` + `llama3.1:8b`), running locally
- **Vector store:** [LanceDB](https://lancedb.com) (embedded, file-based — no separate server)
- **PDF parsing:** `pdfjs-dist`
- **Web UI:** one self-contained HTML file (model switcher, drag-drop upload, chat with citations) — zero external assets

### Security model (why it runs as its own user)

The whole stack runs under a dedicated, **non-privileged `rag` account** with **no sudo**.
The HTTP server is reachable on your LAN, so if it were ever compromised the blast radius
is one plain user — not your admin account. Ollama binds to `127.0.0.1` only, and its
cloud feature is force-disabled (`OLLAMA_NO_CLOUD=true`). See [Security notes](#security-notes).

---

## Placeholders used in this README

| Placeholder | Replace with |
|-------------|--------------|
| `<MAC_MINI_IP>` | The LAN IP of the Mac running the stack, e.g. `192.168.1.50` |
| `admin` | The macOS administrator account you use to create the `rag` user |

Tip: set the host once in your shell so you can paste the rest verbatim:

```bash
export RAG_HOST=<MAC_MINI_IP>     # e.g. export RAG_HOST=192.168.1.50
```

---

## Prerequisites

- A Mac (Apple Silicon or Intel) with **Remote Login (SSH) enabled**
  (`System Settings → General → Sharing → Remote Login`).
- Administrator access on that Mac **for one step only** (creating the `rag` user).
- Your SSH public key already in your admin account's `~/.ssh/authorized_keys`
  (so it can be copied to the `rag` account).
- ~10 GB free disk for the models.

---

## Step 1 — Create the `rag` service account (once, as admin)

On the Mac, as an administrator, clone the repo and run the account-creation script.
It creates a standard (non-admin) `rag` user and copies your admin SSH key so you can
log in as `rag` with the same key.

```bash
# On the Mac, logged in as your admin user:
git clone https://github.com/dantsu-ai/rag1.git /Users/admin/rag-setup
sudo bash /Users/admin/rag-setup/scripts/00-create-rag-user.sh
```

The script prints a verification block. You should see
`rag is NOT a member of admin` — that confirms the privilege isolation.

> If your admin account is not named `admin`, the script auto-detects it from `sudo`.
> To force a specific one: `sudo ADMIN_USER=<name> bash .../00-create-rag-user.sh`

---

## Step 2 — Log in as `rag` and clone the repo

From your laptop:

```bash
ssh rag@$RAG_HOST
```

Then, on the Mac as the `rag` user, clone the repo into `~/rag`:

```bash
git clone https://github.com/dantsu-ai/rag1.git ~/rag
cd ~/rag
```

---

## Step 3 — Install the stack

Still as the `rag` user, in `~/rag`:

```bash
bash scripts/install.sh
```

This is user-space only (no sudo). It:

1. installs **Bun** into `~/.bun`,
2. downloads the **Ollama** standalone binary into `~/bin`,
3. starts Ollama and **pulls the models** (`nomic-embed-text`, `llama3.1:8b` — several GB, first run only),
4. installs the app dependencies (`bun install`).

Re-running it is safe — it skips anything already installed.

---

## Step 4 — Start the server

```bash
bash scripts/start-rag.sh
```

This starts Ollama (cloud disabled) and the RAG server on port **3737**, and prints the
listening sockets. Leave the SSH session running, or see
[Keeping it running](#keeping-it-running) below.

---

## Step 5 — Verify it's up

From your **laptop**:

```bash
curl http://$RAG_HOST:3737/health
# -> {"status":"ok","model":"llama3.1:8b","port":3737}
```

Then open the Web UI in a browser:

```
http://<MAC_MINI_IP>:3737
```

---

## Using it

### Web UI

Open `http://<MAC_MINI_IP>:3737`. You get:

- a **model dropdown** (switch the generation model at runtime — no restart),
- **drag-and-drop upload** for `.pdf` / `.txt` / `.md` files,
- a **chat box** that answers from your documents with source-citation chips.
- a **document list** — every indexed file with its chunk count, with checkboxes to select one or many and a **Delete selected** button (with a confirmation prompt) that removes them completely.

Upload a few documents, then ask a question. Answers cite the source file they came from.

### From the command line (curl)

```bash
# Upload one or more documents
curl -F "file=@/path/to/doc1.pdf" -F "file=@/path/to/doc2.md" \
  http://$RAG_HOST:3737/upload

# List what's indexed
curl http://$RAG_HOST:3737/sources

# Delete one or more documents (removes index rows, the stored original, and ingest-state)
curl -X POST http://$RAG_HOST:3737/delete \
  -H "Content-Type: application/json" \
  -d '{"files":["old-doc.pdf","stale-notes.md"]}'

# Ask a question (GET)
curl "http://$RAG_HOST:3737/query?q=What%20is%20IEC%2062443%20SL-2%3F"

# Ask a question (POST)
curl -X POST http://$RAG_HOST:3737/query \
  -H "Content-Type: application/json" \
  -d '{"question":"What is IEC 62443 SL-2?"}'
```

### CLI ingest / query (on the Mac, as `rag`)

```bash
cd ~/rag
bun run ingest --dir ~/documents     # batch-ingest a folder
bun run query "your question here"    # one-off query
```

---

## HTTP endpoints

| Method | Path | Purpose |
|--------|------|---------|
| `GET`  | `/` | Web UI (self-contained HTML) |
| `GET`  | `/health` | Liveness + current model |
| `GET`  | `/sources` | List indexed source files |
| `GET`  | `/models` | List installed generation models |
| `POST` | `/model` | Switch generation model (`{"model":"..."}`) |
| `GET`  | `/query?q=...` | Ask a question |
| `POST` | `/query` | Ask a question (`{"question":"..."}`) |
| `POST` | `/upload` | Upload `.pdf`/`.txt`/`.md` (multipart field `file`, one or many) |
| `POST` | `/delete` | Remove one or more documents — index rows + stored original + ingest-state (`{"files":["..."]}`) |

---

## Configuration

All settings are environment variables (defaults in `src/lib/config.ts`):

| Variable | Default | Description |
|----------|---------|-------------|
| `RAG_OLLAMA_URL` | `http://localhost:11434` | Ollama API endpoint |
| `RAG_EMBED_MODEL` | `nomic-embed-text` | Embedding model (768-dim; do not change after ingesting) |
| `RAG_GENERATION_MODEL` | `llama3.1:8b` | Generation model |
| `RAG_DB_PATH` | `~/.rag/db` | LanceDB vector store path |
| `RAG_UPLOADS_PATH` | `~/.rag/uploads` | Uploaded originals |
| `RAG_PORT` | `3737` | HTTP server port |
| `RAG_BIND` | `0.0.0.0` | Bind address (see Security below) |

Chunking (512-token chunks, 64-token overlap), top-K (5), and the context budget are set
in `config.ts`.

---

## Security notes

- **Bind address.** The server binds `0.0.0.0` (LAN-reachable) by default. To restrict it
  to the machine only and reach it over an SSH tunnel instead:

  ```bash
  # on the Mac, as rag:
  RAG_BIND=127.0.0.1 bash scripts/start-rag.sh
  # from your laptop:
  ssh -L 3737:localhost:3737 rag@<MAC_MINI_IP>
  # then browse http://localhost:3737
  ```

- **No cloud.** `OLLAMA_NO_CLOUD=true` is set by `start-rag.sh` and `install.sh`. Ollama
  0.31 ships its cloud feature **on** by default; this keeps it off. Verify with:
  `grep -i "cloud disabled" ~/ollama.log`.

- **Data at rest.** Everything ingested lives under `~/.rag/` on the Mac and is never
  committed (see `.gitignore`). Treat `~/.rag/db` as sensitive as the documents themselves.

---

## Keeping it running

`start-rag.sh` launches the processes with `nohup` so they survive your SSH session
closing. To restart after a reboot, SSH back in and run `bash scripts/start-rag.sh` again.
(Auto-start on boot via `launchd` needs sudo and is intentionally left out — add a
LaunchDaemon plist if you want it.)

---

## Troubleshooting

| Symptom | Check |
|---------|-------|
| `/health` refused from laptop | Server running? `ssh rag@<MAC_MINI_IP> 'lsof -iTCP:3737 -sTCP:LISTEN'`. Firewall allowing 3737? |
| Query hangs / very slow | First token on a cold model can take a while; a large model may exceed comfort on a small Mac — switch to a smaller one via the model dropdown. |
| `ollama pull` fails | Network to `registry.ollama.ai`; re-run `scripts/install.sh` (idempotent). |
| Ollama reaching the internet | Confirm `OLLAMA_NO_CLOUD=true` took: `grep -i "cloud disabled" ~/ollama.log` should say `true`. |
| Upload rejected | Only `.pdf`, `.txt`, `.md` are accepted. |

---

## Project layout

```
rag/
├── README.md              # this file
├── package.json
├── scripts/
│   ├── 00-create-rag-user.sh   # (sudo, once) create the non-privileged rag account
│   ├── install.sh              # (rag user) install bun + ollama + models + deps
│   └── start-rag.sh            # (rag user) start ollama + the RAG server
├── src/
│   ├── server.ts               # HTTP server + Web UI routes
│   ├── ingest-pipeline.ts      # discover → chunk → embed → store
│   ├── query-pipeline.ts       # embed query → retrieve → prompt → generate
│   ├── public/index.html       # the Web UI
    └── lib/                    # config, extractor, chunker, embedder, store, retriever, generator, models, runtime
```
