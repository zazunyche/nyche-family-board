# Hermes integration — setup record (reproducible)

Everything done to bring Hermes in alongside Zazu, so it's auditable and rebuildable.
Lives in the existing **private** family-board repo (github.com/zazunyche/nyche-family-board),
nightly-committed by `scripts/midnight-commit.sh`.

## 1. Local model (Ollama)
- `brew install ollama` → `brew services start ollama` (v0.40.2).
- `ollama pull qwen3:4b` (2.5 GB — chosen because the Mac is 8 GB RAM).

## 2. Hermes Agent
- Installed via official non-interactive installer:
  `curl -fsSL https://raw.githubusercontent.com/NousResearch/hermes-agent/main/scripts/install.sh -o /tmp/hermes-install.sh`
  then `bash /tmp/hermes-install.sh --non-interactive --verbose`.
- Binary: `~/.local/bin/hermes` (v0.21.6). Home: `~/.hermes`.

## 3. Config changes (`~/.hermes/config.yaml` — snapshot in config.snapshot.yaml)
- `model.default: "qwen3:4b"`
- `model.provider: "ollama"`
- `model.base_url: "http://127.0.0.1:11434/v1"`
- `agent.max_turns: 50` (runaway/cost guardrail, was 500)

## 4. Board bridge
- `board-tools/hermes-bridge.js` — delegate → run → review → apply hand-off lane.
- Runtime queues under `hermes-bridge/{jobs,proposals,scratch,applied}` (gitignored — may hold sensitive job content).

## 5. Guardrails
- See `docs/hermes-guardrails.md`. Summary: gateway OFF, never `--yolo`, restricted toolsets
  (`analysis→todo`, `research→safe`; never terminal/code_execution/browser), scoped cwd,
  local-only model, proposals reviewed before apply (single-writer via update.js).

## Secrets policy
- All secrets live in `~/.hermes/.env` and `~/.zazu-config` — **gitignored, never committed.**
- `config.snapshot.yaml` is sanitized (any literal secret value → `<REDACTED>`) by `snapshot-hermes-config.sh`.
- `.env.example` documents the KEY NAMES only.

## Hybrid (Nous Portal) — pending wiring
- Provide auth via EITHER `NOUS_API_KEY` in `~/.hermes/.env` OR OAuth (`hermes auth add nous`).
- Keep local (qwen3:4b) as default for private/analysis; route heavy/research to Portal per-invocation.
- Set a spend cap once the key is in.
- Install Docker before ever enabling Hermes terminal/code execution.
