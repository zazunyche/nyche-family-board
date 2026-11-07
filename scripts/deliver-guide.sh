#!/bin/bash
# ─────────────────────────────────────────────────────────────────────────────
# scripts/deliver-guide.sh
#
# Closes the "write-only guides" gap: prior heartbeats wrote detailed
# friction-removal guides into docs/guides/ (gitignored, local-only) and
# referenced them in each task's zazuNotes by file path — but NOTHING ever
# delivers them. compose-brief.js (the 7am brief) renders a numbered task list
# and never surfaces zazuNotes or the guide, so the family only ever sees a
# dead `docs/guides/X.md` path they can't open from a phone. The guides are
# effectively write-only.
#
# This tool converts a prepared guide into an on-demand email to the task
# owner, inlining the guide markdown as the body (reads fine as plain text on
# mobile). It is DRY-RUN by default — it prints exactly what it would send and
# exits without sending. Pass --send to actually email.
#
#   Usage:
#     scripts/deliver-guide.sh <task-id>           # dry run (safe; default)
#     scripts/deliver-guide.sh <task-id> --send    # actually email the owner
#
# Owner → recipient mapping (from ~/.zazu-config, never committed):
#     DAD  -> $DAD_EMAIL_WORK
#     MOM  -> $MOM_EMAIL
#     BOTH -> both of the above
# ─────────────────────────────────────────────────────────────────────────────

set -euo pipefail

BOARD_DIR="/Users/zazunyche/Documents/src/family-board"
LOG_DIR="$BOARD_DIR/logs"
mkdir -p "$LOG_DIR"
LOG="$LOG_DIR/deliver-guide.log"

# shellcheck source=scripts/lib/zazu-notify.sh
source "$BOARD_DIR/scripts/lib/zazu-notify.sh" 2>/dev/null || true

# ── Args ──────────────────────────────────────────────────────────────────────
TASK_ID="${1:-}"
SEND=false
for a in "$@"; do
  [ "$a" = "--send" ] && SEND=true
done

if [ -z "$TASK_ID" ] || [[ "$TASK_ID" == --* ]]; then
  echo "Usage: $0 <task-id> [--send]" >&2
  echo "  (dry run by default — prints what it would send and exits)" >&2
  exit 2
fi

# ── Load contact config ────────────────────────────────────────────────────────
# shellcheck source=/dev/null
if ! source ~/.zazu-config 2>/dev/null; then
  echo "ERROR: ~/.zazu-config not found or not sourceable" >&2
  exit 1
fi

# ── Pull task fields + guide path from board-data.json (via node) ──────────────
# Emits one tab-separated line: owner<TAB>title<TAB>guidePath (guidePath
# relative to BOARD_DIR, or empty). Captured via $() so node's real exit code
# is checked — a trailing-newline-less `read` would otherwise report EOF as
# failure even on success.
RAW=$(node -e '
  const fs = require("fs");
  const id = process.argv[1];
  const board = JSON.parse(fs.readFileSync(process.argv[2], "utf8"));
  const tasks = Array.isArray(board) ? board : (board.tasks || []);
  const t = tasks.find(x => x.id === id);
  if (!t) { console.error("Task not found: " + id); process.exit(3); }
  const notes = (t.zazuNotes || "") + " " + (t.notes || "");
  const m = notes.match(/docs\/guides\/[A-Za-z0-9._-]+\.md/);
  const owner = (t.owner || "").toUpperCase() || "DAD";
  const title = (t.title || "(untitled)").replace(/[\t\n]/g, " ");
  console.log([owner, title, m ? m[0] : ""].join("\t"));
' "$TASK_ID" "$BOARD_DIR/board-data.json" 2>>"$LOG") || {
  echo "ERROR: could not read task $TASK_ID from board-data.json — $(tail -1 "$LOG")" >&2
  exit 3
}
IFS=$'\t' read -r OWNER TITLE GUIDE_REL <<< "$RAW"

if [ -z "${GUIDE_REL:-}" ]; then
  echo "No guide prepared for task $TASK_ID (\"$TITLE\") — zazuNotes references no docs/guides/*.md file. Nothing to deliver." >&2
  exit 4
fi

GUIDE_PATH="$BOARD_DIR/$GUIDE_REL"
if [ ! -f "$GUIDE_PATH" ]; then
  echo "ERROR: guide referenced but file missing on disk: $GUIDE_REL" >&2
  exit 5
fi

# ── Resolve recipient(s) from owner ────────────────────────────────────────────
RECIPIENTS=()
case "$OWNER" in
  DAD)  RECIPIENTS=("${DAD_EMAIL_WORK:-}") ;;
  MOM)  RECIPIENTS=("${MOM_EMAIL:-}") ;;
  BOTH) RECIPIENTS=("${DAD_EMAIL_WORK:-}" "${MOM_EMAIL:-}") ;;
  *)    RECIPIENTS=("${DAD_EMAIL_WORK:-}") ;;
esac
# drop any empties
TO_ARGS=()
for r in "${RECIPIENTS[@]}"; do
  [ -n "$r" ] && TO_ARGS+=(--to "$r")
done
if [ "${#TO_ARGS[@]}" -eq 0 ]; then
  echo "ERROR: no recipient email resolved for owner '$OWNER' (check ~/.zazu-config)" >&2
  exit 6
fi

SUBJECT="Zazu — step-by-step for: $TITLE"

# ── Dry run (default) ───────────────────────────────────────────────────────────
if [ "$SEND" != true ]; then
  echo "── DRY RUN (no email sent) ──────────────────────────────────"
  echo "Task:      $TASK_ID — $TITLE"
  echo "Owner:     $OWNER"
  printf 'To:        %s\n' "${RECIPIENTS[*]}"
  echo "Subject:   $SUBJECT"
  echo "Guide:     $GUIDE_REL ($(wc -l < "$GUIDE_PATH" | tr -d ' ') lines)"
  echo "Body:      <guide markdown inlined via --body-file>"
  echo "─────────────────────────────────────────────────────────────"
  echo "To actually send:  $0 $TASK_ID --send"
  exit 0
fi

# ── Send ─────────────────────────────────────────────────────────────────────
if node "$BOARD_DIR/scripts/send-email.js" \
  "${TO_ARGS[@]}" \
  --subject "$SUBJECT" \
  --body-file "$GUIDE_PATH" >> "$LOG" 2>&1; then
  log_ts "Delivered guide $GUIDE_REL for $TASK_ID to ${RECIPIENTS[*]}" "$LOG" 2>/dev/null \
    || echo "[$(date -u +%FT%TZ)] Delivered guide $GUIDE_REL for $TASK_ID to ${RECIPIENTS[*]}" >> "$LOG"
  echo "Sent: guide for $TASK_ID (\"$TITLE\") emailed to ${RECIPIENTS[*]}"
else
  echo "ERROR: send-email.js failed (see $LOG)" >&2
  exit 7
fi
