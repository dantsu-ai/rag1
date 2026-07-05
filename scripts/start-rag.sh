#!/bin/bash
# Canonical start for the RAG stack (rag user). AS-BUILT.md documents why.
export PATH="$HOME/.bun/bin:$HOME/bin:$PATH"
export OLLAMA_NO_CLOUD=true          # cloud feature is ON by default in 0.31 — keep it dead
pkill -u rag -f "ollama serve" 2>/dev/null; pkill -u rag -f "bun run src/server.ts" 2>/dev/null; sleep 2
nohup ollama serve > ~/ollama.log 2>&1 &
sleep 3
cd ~/rag && nohup bun run src/server.ts > ~/server.log 2>&1 &
sleep 2
echo "cloud line:"; grep -io "cloud disabled: [a-z]*" ~/ollama.log | head -1
echo "ollama bind:"; lsof -iTCP:11434 -sTCP:LISTEN -P | tail -1
echo "rag server:"; lsof -iTCP:3737 -sTCP:LISTEN -P | tail -1
