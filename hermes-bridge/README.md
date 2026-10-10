# hermes-bridge/

Runtime queues for the Zazu ↔ Hermes hand-off lane (see `../board-tools/hermes-bridge.js`
and `../docs/hermes-guardrails.md`).

- `jobs/` — queued job specs (delegated, awaiting run)
- `proposals/` — Hermes output awaiting review/apply
- `scratch/` — per-job scoped working dirs (Hermes `--in`)
- `applied/` — archived jobs/proposals after apply/reject

These subdirectories are **gitignored** — they can contain sensitive job content.
Only this README and the bridge code are tracked.
