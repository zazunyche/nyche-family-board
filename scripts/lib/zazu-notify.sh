#!/bin/bash
# ─────────────────────────────────────────────────────────────────────────────
# scripts/lib/zazu-notify.sh
# Shared alert/notify library for all Zazu launchd scripts.
#
# Source this file at the top of any script that needs alert capability:
#   source "$(dirname "$0")/lib/zazu-notify.sh"   # from scripts/
#   source "$BOARD_DIR/scripts/lib/zazu-notify.sh" # from anywhere with BOARD_DIR set
#
# Provides:
#   alert_failure  SCRIPT_NAME MESSAGE [LOG_FILE]
#     Logs ERROR to log file (if provided) and sends iMessage to Dad.
#
#   send_imessage  PHONE_NUMBER MESSAGE
#     Sends iMessage via osascript. Returns 0 on success, 1 on failure.
#     Output: the raw osascript return string (should be "sent").
#
#   check_imessage_result  RESULT DESCRIPTION LOG_FILE
#     Validates that send_imessage returned "sent". Calls alert_failure if not.
#
#   log_ts  MESSAGE LOG_FILE
#     Writes ISO-timestamp + message to log file.
# ─────────────────────────────────────────────────────────────────────────────

# DAD_NUMBER must be defined before sourcing this library (loaded from ~/.zazu-config).
# If it is not set yet, we fall back to a sentinel so alert_failure still works.
: "${DAD_NUMBER:=UNCONFIGURED}"

# ── log_ts ────────────────────────────────────────────────────────────────────
# Usage: log_ts "message" /path/to/logfile
log_ts() {
  local msg="$1"
  local logfile="${2:-}"
  local line="[$(date -u +%Y-%m-%dT%H:%M:%SZ)] $msg"
  if [[ -n "$logfile" ]]; then
    echo "$line" >> "$logfile"
  else
    echo "$line" >&2
  fi
}

# ── send_imessage ─────────────────────────────────────────────────────────────
# Sends iMessage via osascript (Messages.app direct — works in launchd context).
# Usage: result=$(send_imessage "+16175551234" "Hello from Zazu")
# Returns 0 and echoes "sent" on success; returns 1 and echoes the error on failure.
send_imessage() {
  local phone="$1"
  local message="$2"

  # Write message to a temp file to safely handle special characters, quotes, etc.
  local tmp
  tmp=$(mktemp /tmp/zazu-msgXXXXXX)  # macOS mktemp: X's must be at end of template
  printf '%s' "$message" > "$tmp"

  local result
  result=$(osascript << OSASCRIPT 2>&1
set msgFile to "$tmp"
set fileHandle to open for access POSIX file msgFile
set msgText to (read fileHandle as «class utf8»)
close access fileHandle

tell application "Messages"
  set targetService to 1st service whose service type = iMessage
  set targetBuddy to buddy "$phone" of targetService
  send msgText to targetBuddy
end tell
return "sent"
OSASCRIPT
)
  local exit_code=$?
  rm -f "$tmp"

  # -1712 = AppleEvent timed out. This is AMBIGUOUS — Messages may have already
  # queued and sent the message before the confirmation timeout. Retrying on -1712
  # causes duplicate messages. Treat as "probably sent" and let the caller decide
  # how to log it, but do NOT signal failure (return 0).
  if [[ $exit_code -ne 0 && "$result" == *"-1712"* ]]; then
    echo "ambiguous-1712"
    return 0
  fi

  echo "$result"
  return $exit_code
}

# ── check_imessage_result ─────────────────────────────────────────────────────
# Validates that a send_imessage call succeeded ("sent" is in the result string).
# Calls alert_failure if not — but avoids infinite recursion if we're already
# inside alert_failure by checking ZAZU_ALERT_IN_PROGRESS.
# Usage: check_imessage_result "$result" "learning snippet to Dad" "$LOG"
check_imessage_result() {
  local result="$1"
  local description="$2"
  local logfile="${3:-}"

  if [[ "$result" == *"ambiguous-1712"* ]]; then
    # AppleEvent timed out — message was probably queued and sent by Messages before
    # the timeout. Log a warning but do NOT retry (retrying causes duplicates).
    log_ts "WARNING: iMessage -1712 timeout for [$description] — message likely sent, skipping retry" "$logfile"
    return 0
  fi

  if [[ "$result" != *"sent"* ]]; then
    log_ts "ERROR: iMessage delivery failed for [$description]: $result" "$logfile"
    # Only alert if we're not already inside alert_failure (prevents recursion)
    if [[ "${ZAZU_ALERT_IN_PROGRESS:-0}" != "1" ]]; then
      alert_failure "iMessage" "Delivery failed for: $description. Error: $result" "$logfile"
    fi
    return 1
  fi
  return 0
}

# ── alert_failure ─────────────────────────────────────────────────────────────
# Called when a critical step fails. Logs the error and texts Dad so the family
# knows something needs human attention — zero silent failures.
#
# Usage: alert_failure "daily-learning.sh" "iMessage to Dad failed" "$LOG"
#
# Sets ZAZU_ALERT_IN_PROGRESS=1 while running to prevent recursive calls if
# the iMessage alert itself fails (we log it but don't loop).
alert_failure() {
  local script_name="$1"
  local message="$2"
  local logfile="${3:-}"

  local ts
  ts=$(date -u +%Y-%m-%dT%H:%M:%SZ)

  # Log the error
  log_ts "ERROR: [$script_name] $message" "$logfile"

  # Guard against recursion
  if [[ "${ZAZU_ALERT_IN_PROGRESS:-0}" == "1" ]]; then
    log_ts "ERROR: alert_failure recursion guard triggered — original error: [$script_name] $message" "$logfile"
    return
  fi

  export ZAZU_ALERT_IN_PROGRESS=1

  # Build the alert message text
  local alert_msg
  alert_msg="Zazu alert — $script_name failed at $ts.
Error: $message
Check logs at: $BOARD_DIR/logs/"

  # Send iMessage alert to Dad (best-effort — log if it fails, don't crash)
  if [[ "$DAD_NUMBER" != "UNCONFIGURED" ]]; then
    local alert_result
    alert_result=$(send_imessage "$DAD_NUMBER" "$alert_msg" 2>&1) || true
    if [[ "$alert_result" != *"sent"* ]]; then
      log_ts "WARNING: Could not send failure alert via iMessage: $alert_result" "$logfile"
    else
      log_ts "Failure alert sent to Dad via iMessage" "$logfile"
    fi
  else
    log_ts "WARNING: DAD_NUMBER not configured — could not send iMessage alert" "$logfile"
  fi

  export ZAZU_ALERT_IN_PROGRESS=0
}
