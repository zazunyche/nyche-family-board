#!/bin/bash
# ─────────────────────────────────────────────────────────────────────────────
# scripts/connectivity-watchdog.sh  — "is Zazu reachable?" outage detector
#
# WHY: On 2026-10-16..18 the Mac had an intermittent outbound-network outage and
# could not reach the Anthropic API. The automated shell alerts kept firing (they
# don't need the API), but Zazu's CONVERSATIONAL replies do — so Dad got a flood of
# error texts and ZERO answers when he asked what was wrong ("one-way traffic").
# Nothing told him plainly "Zazu can't reach the API right now, don't expect replies."
#
# This watchdog fixes exactly that. It is DELIBERATELY independent of:
#   - the Anthropic API (so it still works while the API is down), and
#   - zazu-scheduler.js (runs from its own launchd job, StartInterval 600s),
# so it keeps working even when the things it watches are broken.
#
# It probes api.anthropic.com. It messages Dad ONLY on a state TRANSITION
# (UP->DOWN or DOWN->UP), never on every run, so there is no flood. Two consecutive
# failures are required before declaring an outage, to ignore momentary blips.
# ─────────────────────────────────────────────────────────────────────────────
set -uo pipefail
BOARD_DIR="/Users/zazunyche/Documents/src/family-board"
LOG="$BOARD_DIR/logs/connectivity-watchdog.log"; mkdir -p "$BOARD_DIR/logs"
STATE_FILE="$BOARD_DIR/logs/.connectivity-state"
# shellcheck source=/dev/null
source "$BOARD_DIR/scripts/lib/zazu-notify.sh" 2>/dev/null || true
source ~/.zazu-config 2>/dev/null || true

now_iso() { date -u +%Y-%m-%dT%H:%M:%SZ; }
logline() { echo "[$(now_iso)] $*" >> "$LOG"; }

# ── Probe: any HTTP response (even 401) means the socket opened = reachable ──────
api_code=$(curl -s -o /dev/null -w '%{http_code}' --max-time 8 -X POST https://api.anthropic.com/v1/messages 2>/dev/null || echo 000)
gh_code=$(curl -s -o /dev/null -w '%{http_code}' --max-time 8 https://github.com 2>/dev/null || echo 000)
reachable=0
[[ "$api_code" != "000" ]] && reachable=1

# ── Load prior state: "STATE FAILS SINCE" ───────────────────────────────────────
prev_state="UP"; fails=0; since="$(now_iso)"
if [[ -f "$STATE_FILE" ]]; then
  read -r prev_state fails since < "$STATE_FILE" 2>/dev/null || true
  [[ -z "${prev_state:-}" ]] && prev_state="UP"
  [[ -z "${fails:-}" ]] && fails=0
  [[ -z "${since:-}" ]] && since="$(now_iso)"
fi

send_plain() {  # best-effort; never depends on the API
  [[ "${DAD_NUMBER:-UNCONFIGURED}" == "UNCONFIGURED" || -z "${DAD_NUMBER:-}" ]] && { logline "DAD_NUMBER unset — cannot send"; return; }
  if declare -f send_imessage >/dev/null 2>&1; then
    send_imessage "$DAD_NUMBER" "$1" >> "$LOG" 2>&1 || logline "WARNING: watchdog iMessage failed"
  fi
}

if (( reachable == 1 )); then
  if [[ "$prev_state" == "DOWN" ]]; then
    send_plain "✅ Zazu back online — I can reach the API again (was unreachable since ${since}). Replies work now. If you messaged during the outage, resend and I'll pick it up."
    logline "RECOVERED (api=$api_code gh=$gh_code) — was down since $since"
  else
    logline "ok (api=$api_code gh=$gh_code)"
  fi
  printf 'UP 0 %s\n' "$(now_iso)" > "$STATE_FILE"
else
  fails=$(( fails + 1 ))
  if (( fails >= 2 )) && [[ "$prev_state" != "DOWN" ]]; then
    send_plain "⚠️ Zazu is offline — I can't reach the Anthropic API from the Mac (api=$api_code, github=$gh_code). I WON'T be able to reply to messages until this clears. Automated alerts may still fire. I'll message you the moment I'm back. (Likely a network/Wi-Fi issue on the Mac.)"
    logline "DECLARED DOWN after $fails consecutive fails (api=$api_code gh=$gh_code)"
    printf 'DOWN %s %s\n' "$fails" "$(now_iso)" > "$STATE_FILE"
  else
    logline "unreachable (api=$api_code gh=$gh_code) fails=$fails prev=$prev_state"
    # keep existing 'since' if already down; else start counting from now
    if [[ "$prev_state" == "DOWN" ]]; then
      printf 'DOWN %s %s\n' "$fails" "$since" > "$STATE_FILE"
    else
      printf '%s %s %s\n' "$prev_state" "$fails" "$since" > "$STATE_FILE"
    fi
  fi
fi
