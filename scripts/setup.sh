#!/bin/bash
# ─────────────────────────────────────────────────────────────────────────────
# scripts/setup.sh
# One-time setup for the Nyche Family Board on zazunyche Mac Mini.
# Follows Zazu's launchd pattern — no cron, no npm scheduling.
#
# Run: bash ~/family-board/scripts/setup.sh
# ─────────────────────────────────────────────────────────────────────────────

set -euo pipefail

BOARD_DIR="$(cd "$(dirname "$0")/.." && pwd)"
LAUNCH_AGENTS="$HOME/Library/LaunchAgents"

echo ""
echo "🏠 Nyche Family Board — Setup"
echo "   Board directory: $BOARD_DIR"
echo "   User: $(whoami)"
echo ""

# ── 1. Verify we're on zazunyche ──────────────────────────────────────────────
if [ "$(whoami)" != "zazunyche" ]; then
  echo "⚠️  Warning: expected user zazunyche, got $(whoami)"
  echo "   Plists reference /Users/zazunyche — paths may be wrong if different."
  read -p "   Continue anyway? [y/N] " confirm
  [[ "$confirm" =~ ^[Yy]$ ]] || exit 1
fi

# ── 2. Check Node.js ──────────────────────────────────────────────────────────
if ! command -v node &>/dev/null; then
  echo "❌ Node.js not found. Install from https://nodejs.org (LTS) then re-run."
  exit 1
fi
echo "✓ Node.js $(node --version)"

# ── 3. Check claude CLI ───────────────────────────────────────────────────────
if ! command -v claude &>/dev/null; then
  echo "❌ claude CLI not found. Zazu should already have this — check PATH."
  exit 1
fi
echo "✓ claude CLI found"

# ── 4. Verify board-data.json ─────────────────────────────────────────────────
if [ ! -f "$BOARD_DIR/board-data.json" ]; then
  echo "❌ board-data.json not found at $BOARD_DIR"
  exit 1
fi
echo "✓ board-data.json present"

# ── 5. Init git repo ──────────────────────────────────────────────────────────
cd "$BOARD_DIR"
if [ ! -d ".git" ]; then
  git init
  git add .
  git commit -m "Initial Nyche family board setup $(date +%Y-%m-%d)"
  echo "✓ Git repository initialised"
else
  echo "✓ Git repository already exists ($(git log --oneline -1 2>/dev/null || echo 'no commits yet'))"
fi

# ── 6. Make scripts executable ────────────────────────────────────────────────
chmod +x "$BOARD_DIR/scripts/"*.sh
chmod +x "$BOARD_DIR/board-tools/"*.js
echo "✓ Scripts marked executable"

# ── 7. Create logs directory ──────────────────────────────────────────────────
mkdir -p "$BOARD_DIR/logs" "$BOARD_DIR/snapshots"
echo "✓ logs/ and snapshots/ directories ready"

# ── 8. Start local web server via pm2 ────────────────────────────────────────
if command -v pm2 &>/dev/null; then
  pm2 delete nyche-family-board 2>/dev/null || true
  pm2 start "$BOARD_DIR/server.js" \
    --name "nyche-family-board" \
    --log "$BOARD_DIR/logs/server.log" \
    --error "$BOARD_DIR/logs/server-error.log" \
    --time \
    --restart-delay 3000
  pm2 save
  echo "✓ Web server started via pm2 (port 3000)"
else
  echo "  pm2 not found — starting server directly (not persistent across reboots)"
  echo "  Install pm2: npm install -g pm2"
  nohup node "$BOARD_DIR/server.js" >> "$BOARD_DIR/logs/server.log" 2>&1 &
  echo "✓ Web server started (PID $!)"
fi

# ── 9. Install launchd plists ─────────────────────────────────────────────────
mkdir -p "$LAUNCH_AGENTS"
PLISTS=(
  "com.zazu.board-briefing"
  "com.zazu.gmail-scan"
  "com.zazu.board-reminders"
  "com.zazu.board-midnight-commit"
)

echo ""
echo "Installing launchd jobs..."
for plist in "${PLISTS[@]}"; do
  SRC="$BOARD_DIR/launchd/${plist}.plist"
  DST="$LAUNCH_AGENTS/${plist}.plist"

  if [ ! -f "$SRC" ]; then
    echo "  ⚠ $SRC not found — skipping"
    continue
  fi

  # Unload existing version if present
  launchctl unload "$DST" 2>/dev/null || true

  cp "$SRC" "$DST"
  launchctl load "$DST"
  echo "  ✓ $plist loaded"
done

# ── 10. Smoke test board tools ────────────────────────────────────────────────
echo ""
echo "Running smoke tests..."
node "$BOARD_DIR/board-tools/zazu-context.js" --brief > /dev/null && echo "  ✓ zazu-context.js --brief"
node "$BOARD_DIR/board-tools/read.js" --text > /dev/null          && echo "  ✓ board-tools/read.js --text"
node "$BOARD_DIR/scripts/generate-snapshot.js" > /dev/null        && echo "  ✓ generate-snapshot.js"

# ── 11. Final summary ─────────────────────────────────────────────────────────
echo ""
echo "════════════════════════════════════════════════════════"
echo "✅ Nyche Family Board setup complete!"
echo ""
echo "  Board UI:   http://localhost:3000"
echo "  Network:    http://$(hostname -s).local:3000"
echo "  Data file:  $BOARD_DIR/board-data.json"
echo ""
echo "  Scheduled jobs (launchd):"
echo "    7:00am  — board-briefing   (iMessage to Dad + Mom)"
echo "    8:00am  — board-reminders  (event reminders)"
echo "    Every 2h (7:30am–9pm) — gmail-scan"
echo "    12:00am — midnight git commit"
echo ""
echo "  Test a job now:"
echo "    launchctl start com.zazu.board-briefing"
echo "    launchctl start com.zazu.gmail-scan"
echo ""
echo "  View logs:"
echo "    tail -f /tmp/zazu-board-briefing.stdout.log"
echo "    tail -f /tmp/zazu-gmail-scan.stdout.log"
echo "    tail -f $BOARD_DIR/logs/board-briefing.log"
echo ""
echo "  Board tools (Zazu uses these):"
echo "    node board-tools/zazu-context.js       ← board state for prompts"
echo "    node board-tools/read.js --text        ← human-readable briefing"
echo "    node board-tools/add.js --title '...'  ← add a task"
echo "    node board-tools/move.js --task t_001 --to done"
echo "    node board-tools/update.js --task t_001 --owner MOM"
echo "════════════════════════════════════════════════════════"
echo ""
echo "  ⚠️  Next: add this to Zazu's system-prompt.md"
echo "  See: scripts/patch-system-prompt.md for the exact text"
echo ""
