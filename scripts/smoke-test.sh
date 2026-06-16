#!/bin/bash
# ─────────────────────────────────────────────────────────────────────────────
# scripts/smoke-test.sh
# Manual or scheduled smoke test for the Zazu family-board system.
# Run: bash scripts/smoke-test.sh
# Exits 0 if all checks pass, 1 if any FAIL.
#
# Each check prints:  PASS  <description>
#                 or: FAIL  <description> — <detail>
# ─────────────────────────────────────────────────────────────────────────────

set -uo pipefail
# Note: no -e here — we want all checks to run even if one fails.

BOARD_DIR="/Users/zazunyche/Documents/src/family-board"
LOG_DIR="$BOARD_DIR/logs"
PASS=0
FAIL=0

# ── Helpers ───────────────────────────────────────────────────────────────────
pass() { echo "PASS  $1"; PASS=$((PASS+1)); }
fail() { echo "FAIL  $1 — $2"; FAIL=$((FAIL+1)); }

echo "────────────────────────────────────────────────────"
echo "Zazu smoke-test  $(date -u +%Y-%m-%dT%H:%M:%SZ)"
echo "────────────────────────────────────────────────────"

# ── 1. Node.js server responding on localhost:3000 ────────────────────────────
if curl -sf --max-time 5 http://localhost:3000/ > /dev/null 2>&1; then
  pass "Node.js server responding on localhost:3000"
else
  fail "Node.js server" "curl to localhost:3000 failed — is server.js running?"
fi

# ── 2. board-data.json readable and valid JSON ────────────────────────────────
BOARD_JSON="$BOARD_DIR/board-data.json"
if [ ! -f "$BOARD_JSON" ]; then
  fail "board-data.json" "file not found at $BOARD_JSON"
elif node -e "JSON.parse(require('fs').readFileSync('$BOARD_JSON'))" 2>/dev/null; then
  pass "board-data.json readable and valid JSON"
else
  fail "board-data.json" "file exists but is not valid JSON"
fi

# ── 3. curriculum.json readable and valid JSON ────────────────────────────────
CURRICULUM_JSON="$BOARD_DIR/learning/curriculum.json"
if [ ! -f "$CURRICULUM_JSON" ]; then
  fail "curriculum.json" "file not found at $CURRICULUM_JSON"
elif node -e "JSON.parse(require('fs').readFileSync('$CURRICULUM_JSON'))" 2>/dev/null; then
  pass "curriculum.json readable and valid JSON"
else
  fail "curriculum.json" "file exists but is not valid JSON"
fi

# ── 4. ~/.zazu-config exists and has required keys ────────────────────────────
ZAZU_CONFIG="$HOME/.zazu-config"
if [ ! -f "$ZAZU_CONFIG" ]; then
  fail "~/.zazu-config" "file not found — contact config missing"
else
  MISSING_KEYS=()
  for key in DAD_NUMBER MOM_NUMBER DAD_EMAIL_WORK CHILD_1_NAME; do
    if ! grep -q "^${key}=" "$ZAZU_CONFIG" 2>/dev/null; then
      MISSING_KEYS+=("$key")
    fi
  done
  if [ ${#MISSING_KEYS[@]} -eq 0 ]; then
    pass "~/.zazu-config exists with required keys (DAD_NUMBER, MOM_NUMBER, DAD_EMAIL_WORK, CHILD_1_NAME)"
  else
    fail "~/.zazu-config" "missing keys: ${MISSING_KEYS[*]}"
  fi
fi

# ── 5. ~/.zazu-email-config.json exists ───────────────────────────────────────
EMAIL_CONFIG="$HOME/.zazu-email-config.json"
if [ ! -f "$EMAIL_CONFIG" ]; then
  fail "~/.zazu-email-config.json" "file not found — email config missing"
elif node -e "JSON.parse(require('fs').readFileSync('$EMAIL_CONFIG'))" 2>/dev/null; then
  pass "~/.zazu-email-config.json exists and is valid JSON"
else
  fail "~/.zazu-email-config.json" "file exists but is not valid JSON"
fi

# ── 6. All required scripts exist and are executable ─────────────────────────
REQUIRED_SCRIPTS=(
  "$BOARD_DIR/scripts/daily-learning.sh"
  "$BOARD_DIR/scripts/board-briefing.sh"
  "$BOARD_DIR/scripts/board-reminders.sh"
  "$BOARD_DIR/scripts/gmail-scan.sh"
  "$BOARD_DIR/scripts/midnight-commit.sh"
  "$BOARD_DIR/scripts/send-email.js"
  "$BOARD_DIR/scripts/lib/zazu-notify.sh"
  "$BOARD_DIR/setup/daily-briefing.sh"
  "$BOARD_DIR/board-tools/add.js"
  "$BOARD_DIR/board-tools/move.js"
  "$BOARD_DIR/board-tools/update.js"
  "$BOARD_DIR/board-tools/zazu-context.js"
  "$BOARD_DIR/board-tools/mark-reminded.js"
  "$BOARD_DIR/board-tools/read.js"
)

MISSING_SCRIPTS=()
NON_EXEC_SCRIPTS=()
for s in "${REQUIRED_SCRIPTS[@]}"; do
  if [ ! -f "$s" ]; then
    MISSING_SCRIPTS+=("$(basename "$s")")
  elif [ ! -x "$s" ] && [[ "$s" == *.sh ]]; then
    NON_EXEC_SCRIPTS+=("$(basename "$s")")
  fi
done

if [ ${#MISSING_SCRIPTS[@]} -eq 0 ] && [ ${#NON_EXEC_SCRIPTS[@]} -eq 0 ]; then
  pass "All required scripts exist and .sh files are executable"
else
  [ ${#MISSING_SCRIPTS[@]} -gt 0 ] && fail "Required scripts missing" "${MISSING_SCRIPTS[*]}"
  [ ${#NON_EXEC_SCRIPTS[@]} -gt 0 ] && fail "Scripts not executable" "${NON_EXEC_SCRIPTS[*]}"
fi

# ── 7. Log directory is writable ──────────────────────────────────────────────
mkdir -p "$LOG_DIR" 2>/dev/null || true
TEST_LOG="$LOG_DIR/.smoke-write-test-$$"
if touch "$TEST_LOG" 2>/dev/null && rm -f "$TEST_LOG"; then
  pass "Log directory is writable ($LOG_DIR)"
else
  fail "Log directory" "$LOG_DIR is not writable"
fi

# ── 8. osascript can reach Messages.app ───────────────────────────────────────
OSASCRIPT_RESULT=$(osascript -e 'tell application "Messages" to return name' 2>&1)
if [[ "$OSASCRIPT_RESULT" == "Messages" ]]; then
  pass "osascript can reach Messages.app"
else
  fail "Messages.app" "osascript returned: $OSASCRIPT_RESULT"
fi

# ── 9. node binary available and correct version ──────────────────────────────
NODE_BIN=$(which node 2>/dev/null || echo "")
if [ -z "$NODE_BIN" ]; then
  fail "node binary" "not found in PATH"
else
  NODE_VER=$(node --version 2>/dev/null || echo "unknown")
  pass "node binary available ($NODE_VER at $NODE_BIN)"
fi

# ── 10. nodemailer module available ───────────────────────────────────────────
NODEMAILER_PATH="/Users/zazunyche/.npm-global/node_modules/nodemailer"
if [ -d "$NODEMAILER_PATH" ]; then
  pass "nodemailer module available at $NODEMAILER_PATH"
else
  fail "nodemailer" "module not found at $NODEMAILER_PATH — run: npm install -g nodemailer"
fi

# ── 11. send-email.js parses without error (syntax check) ────────────────────
if node --check "$BOARD_DIR/scripts/send-email.js" 2>/dev/null; then
  pass "send-email.js passes node syntax check"
else
  fail "send-email.js" "node --check failed — syntax error in script"
fi

# ── 12. claude CLI available ──────────────────────────────────────────────────
CLAUDE_BIN="/opt/homebrew/bin/claude"
if [ -x "$CLAUDE_BIN" ]; then
  pass "claude CLI available at $CLAUDE_BIN"
else
  fail "claude CLI" "not found at $CLAUDE_BIN — launchd jobs will fail"
fi

# ── 13. Launchd plists installed ─────────────────────────────────────────────
LAUNCHD_DIR="$HOME/Library/LaunchAgents"
EXPECTED_PLISTS=(
  "com.zazu.board-briefing.plist"
  "com.zazu.board-reminders.plist"
  "com.zazu.daily-learning.plist"
  "com.zazu.gmail-scan.plist"
  "com.zazu.board-midnight-commit.plist"
)
MISSING_PLISTS=()
for p in "${EXPECTED_PLISTS[@]}"; do
  [ ! -f "$LAUNCHD_DIR/$p" ] && MISSING_PLISTS+=("$p")
done
if [ ${#MISSING_PLISTS[@]} -eq 0 ]; then
  pass "All launchd plists installed in ~/Library/LaunchAgents/"
else
  fail "Launchd plists not installed" "${MISSING_PLISTS[*]} — run: cp launchd/*.plist ~/Library/LaunchAgents/ && launchctl load ..."
fi

# ── Summary ───────────────────────────────────────────────────────────────────
echo "────────────────────────────────────────────────────"
TOTAL=$((PASS+FAIL))
echo "Results: $PASS/$TOTAL passed, $FAIL failed"
if [ "$FAIL" -gt 0 ]; then
  echo "STATUS: FAIL — $FAIL check(s) need attention"
  exit 1
else
  echo "STATUS: PASS — all systems go"
  exit 0
fi
