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

## Hybrid (Nous Portal) — WIRED 2026-10-10
- `NOUS_API_KEY` stored in `~/.hermes/.env` (gitignored, outside repo). Free pay-as-you-go, $10 credit.
- The built-in `nous` provider wants OAuth even with a key, so we define a **custom OpenAI-compatible
  provider** in config.yaml:
  ```
  providers:
    nousportal:
      base_url: "https://inference-api.nousresearch.com/v1"
      key_env: "NOUS_API_KEY"
  ```
- Bridge routing (board-tools/hermes-bridge.js ROUTES):
  - `analysis` → provider `ollama`, model `qwen3:4b` (LOCAL, free, private — sensitive data).
  - `research` → provider `nousportal`, model `qwen/qwen3.8-flash` (economical cloud + web).
- **Model policy (Dad, 2026-10-10):** only leave the local free model when a job needs web/Tool-Gateway,
  heavy reasoning beyond the local 4B, or a diverse perspective. When Zazu (Claude) directs Hermes, route to a
  NON-Claude family (Qwen/Llama) — a second Claude adds little value.
- **Spend cap:** the $10 PAYG credit is the hard ceiling (Portal stops at $0). Kept low by using an
  economical model, `agent.max_turns: 50`, and restricted toolsets. Rotate the key eventually (it was sent over iMessage).
- Still TODO: install Docker before ever enabling Hermes terminal/code execution.
