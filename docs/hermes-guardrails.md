# Hermes ↔ Zazu — bridge & guardrails

Set up 2026-10-10. Hermes (Nous Research agent) runs locally on the Mac and works
alongside Zazu (Claude Code) via a reviewed hand-off lane on the family board.

## The hand-off lane (board-tools/hermes-bridge.js)
Zazu delegates work; Hermes produces a **proposal**; Zazu reviews and applies it.

```
node board-tools/hermes-bridge.js delegate --task <id> [--mode analysis|research] [--instructions "..."] [--input /abs/file]
node board-tools/hermes-bridge.js run      [--task <id> | --all]
node board-tools/hermes-bridge.js review   [--task <id>]
node board-tools/hermes-bridge.js apply    --task <id> [--done] [--reject]
```

- `delegate` writes a job to `hermes-bridge/jobs/<id>.json` and leaves a note on the task.
- `run` invokes Hermes one-shot and writes `hermes-bridge/proposals/<id>.json`.
- `review` prints the proposal for a human to read.
- `apply` writes the proposal back to the board **via update.js** (single-writer) as a
  `zazuNotes` entry, optionally moving the task to DONE. `--reject` archives it instead.
- Applied jobs/proposals are moved to `hermes-bridge/applied/`.

## Guardrails (enforced)
1. **On-demand only.** Hermes is invoked one-shot by the bridge. The messaging **gateway stays OFF**
   (`hermes gateway status` → not running), so Hermes cannot contact anyone.
2. **No `--yolo`, ever.** Approval-gated/destructive tools are blocked (no TTY to approve).
3. **Restricted toolsets.** `analysis → todo` (in-session only; no web/terminal/file),
   `research → safe` (web/vision/image, explicitly NO terminal). We NEVER load
   `terminal` / `code_execution` / `browser` / `computer_use`.
4. **Scoped cwd.** Each job runs with `--in hermes-bridge/scratch/<id>` — file access is limited
   to that job's directory.
5. **Proposal, not action.** The bridge never lets Hermes mutate `board-data.json`; only `apply`
   (a human step) writes, and only through update.js.
6. **Local & private.** Model is `qwen3:4b` via Ollama (`127.0.0.1:11434`). Raw sensitive data
   (statements, email) never leaves the Mac. `agent.max_turns` capped at 50.

## Still TODO before expanding Hermes's powers
- **Docker** is NOT installed. Before ever enabling the `terminal`/`code_execution` toolsets,
  install Docker and switch `terminal.backend` to `docker` (config.yaml has the template).
- **Spend cap**: set when the hybrid (cloud) tier is added (Nous Portal / OpenRouter).
