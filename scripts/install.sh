#!/bin/bash
# install.sh
# Installs the FULL local RAG stack (Bun runtime + Ollama + models + app deps) into
# the current user's home directory. Everything is user-space — no sudo, nothing
# installed system-wide. Run this AS THE `rag` USER, from the repo root:
#
#   ssh rag@<MAC_MINI_IP>
#   cd ~/rag
#   bash scripts/install.sh
#
# Idempotent: safe to re-run. Skips anything already present.
set -euo pipefail

OLLAMA_VERSION="${OLLAMA_VERSION:-v0.31.1}"
EMBED_MODEL="${RAG_EMBED_MODEL:-nomic-embed-text}"
GEN_MODEL="${RAG_GENERATION_MODEL:-llama3.1:8b}"
REPO_DIR="$(cd "$(dirname "$0")/.." && pwd)"

echo "==> Installing RAG stack into ${HOME}"

# 1) Bun (user-space install to ~/.bun)
if [ ! -x "$HOME/.bun/bin/bun" ] && ! command -v bun >/dev/null 2>&1; then
  echo "==> Installing Bun"
  curl -fsSL https://bun.sh/install | bash
fi
export PATH="$HOME/.bun/bin:$HOME/bin:$PATH"
echo "    bun $(bun --version)"

# 2) Ollama — standalone tarball into ~/bin (no brew, no admin, stays in the account)
mkdir -p "$HOME/bin"
if [ ! -x "$HOME/bin/ollama" ]; then
  echo "==> Downloading Ollama ${OLLAMA_VERSION} (ollama-darwin.tgz)"
  curl -fsSL "https://github.com/ollama/ollama/releases/download/${OLLAMA_VERSION}/ollama-darwin.tgz" -o /tmp/ollama-darwin.tgz
  tar -xzf /tmp/ollama-darwin.tgz -C "$HOME/bin"
  rm -f /tmp/ollama-darwin.tgz
fi
echo "    ollama $("$HOME/bin/ollama" --version 2>/dev/null | head -1)"

# 3) Start Ollama with its cloud feature OFF, then pull the models.
#    OLLAMA_NO_CLOUD=true is REQUIRED: 0.31 ships the cloud feature ON by default,
#    which holds a persistent TLS connection to ollama.com — unacceptable for a
#    local, no-cloud RAG. See AS-BUILT.md "Post-delivery hardening".
export OLLAMA_NO_CLOUD=true
if ! pgrep -u "$(id -u)" -f "ollama serve" >/dev/null 2>&1; then
  echo "==> Starting ollama serve (localhost:11434)"
  nohup "$HOME/bin/ollama" serve > "$HOME/ollama.log" 2>&1 &
  sleep 3
fi
echo "==> Pulling models (this downloads several GB on first run)"
"$HOME/bin/ollama" pull "$EMBED_MODEL"
"$HOME/bin/ollama" pull "$GEN_MODEL"

# 4) Application dependencies
echo "==> Installing app dependencies (bun install)"
cd "$REPO_DIR"
bun install

echo ""
echo "✅ Install complete."
echo "   Start the stack:   bash scripts/start-rag.sh"
echo "   Then open:         http://<MAC_MINI_IP>:3737"
