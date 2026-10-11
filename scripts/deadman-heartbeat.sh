#!/bin/bash
# ─────────────────────────────────────────────────────────────────────────────
# scripts/deadman-heartbeat.sh
# Dead-man's switch: the Mac pings OUT to Healthchecks.io every few minutes.
# If a ping stops arriving, Healthchecks alerts Dad (loud, via Pushover/ntfy).
# Silence becomes an alarm. Outbound-only → nothing exposed, Tailscale stays private.
#
# TWO independent pings (see docs/hermes-guardrails.md / health email):
#   MINI  = "the machine + network are alive" (this script running + able to reach the net)
#   ZAZU  = "the assistant is actually healthy" (board server answers + channel process alive)
# If only ZAZU goes red → machine up, Zazu broken (the Oct-11 failure mode).
#
# Config lives in ~/.zazu-config (gitignored). SAFE NO-OP until set:
#   HEALTHCHECKS_MINI_URL="https://hc-ping.com/<uuid-1>"
#   HEALTHCHECKS_ZAZU_URL="https://hc-ping.com/<uuid-2>"
# Install: loaded by LaunchAgent com.zazu.deadman-heartbeat (StartInterval 300).
# ─────────────────────────────────────────────────────────────────────────────
set -uo pipefail
source ~/.zazu-config 2>/dev/null || true
MINI="${HEALTHCHECKS_MINI_URL:-}"
ZAZU="${HEALTHCHECKS_ZAZU_URL:-}"
PING(){ curl -fsS -m 10 --retry 3 -o /dev/null "$1" 2>/dev/null || true; }

# If not configured yet, do nothing (safe to install ahead of signup).
[ -z "$MINI" ] && [ -z "$ZAZU" ] && exit 0

# 1) MINI heartbeat — simply running + reaching the internet proves machine+network alive.
[ -n "$MINI" ] && PING "$MINI"

# 2) ZAZU health — board server answers AND the iMessage channel process is alive.
if [ -n "$ZAZU" ]; then
  HEALTHY=1
  curl -fsS -m 8 -o /dev/null "http://127.0.0.1:3000/healthz" 2>/dev/null || HEALTHY=0
  pgrep -f "run-imessage-channel" >/dev/null 2>&1 || HEALTHY=0
  if [ "$HEALTHY" = "1" ]; then PING "$ZAZU"; else PING "${ZAZU%/}/fail"; fi
fi
exit 0
