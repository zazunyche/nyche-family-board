#!/bin/bash
# ─────────────────────────────────────────────────────────────────────────────
# scripts/run-tests.sh
# Single entry point that runs EVERY unit-test suite in scripts/tests/.
# Run: bash scripts/run-tests.sh
# Exits 0 if all suites pass, 1 if any suite fails.
#
# WHY THIS EXISTS
# ---------------
# The suites under scripts/tests/ (test_*.js, test_*.py) were each run once by
# hand at authoring time, then never again — nothing in the launchd schedule or
# the commit pipeline executed them. That makes them write-only: a future edit
# to stage-funnel.js / wait-ratio.js / auto-close-events.js / mark-briefed.js /
# email-scan.py could silently break behaviour and no test would ever catch it
# (false safety — the same "write-only gap" that once hid delivery guides from
# everyone). This runner gives a one-command way to run them all, and is wired
# into midnight-commit.sh as a nightly regression gate so a broken suite surfaces
# (alerts Dad) within a day instead of rotting undetected.
#
# Convention every suite already follows: exit 0 on pass, exit 1 on failure.
# Add a new test by dropping test_<name>.{js,py} into scripts/tests/ — it is
# auto-discovered here, no edit to this file needed.
# ─────────────────────────────────────────────────────────────────────────────

set -uo pipefail
# Note: no -e — we want every suite to run even if an earlier one fails.

BOARD_DIR="/Users/zazunyche/Documents/src/family-board"
TESTS_DIR="$BOARD_DIR/scripts/tests"

PASS=0
FAIL=0
FAILED_SUITES=()

echo "────────────────────────────────────────────────────"
echo "Zazu test-runner  $(date -u +%Y-%m-%dT%H:%M:%SZ)"
echo "────────────────────────────────────────────────────"

if [ ! -d "$TESTS_DIR" ]; then
  echo "FAIL  tests directory not found at $TESTS_DIR"
  exit 1
fi

run_suite() {
  local runner="$1" file="$2"
  local name
  name=$(basename "$file")
  if "$runner" "$file" > /dev/null 2>&1; then
    echo "PASS  $name"
    PASS=$((PASS+1))
  else
    echo "FAIL  $name  (re-run: $runner $file)"
    FAIL=$((FAIL+1))
    FAILED_SUITES+=("$name")
  fi
}

shopt -s nullglob
JS_TESTS=("$TESTS_DIR"/test_*.js)
PY_TESTS=("$TESTS_DIR"/test_*.py)
shopt -u nullglob

if [ ${#JS_TESTS[@]} -eq 0 ] && [ ${#PY_TESTS[@]} -eq 0 ]; then
  echo "FAIL  no test_*.js or test_*.py suites found in $TESTS_DIR"
  exit 1
fi

for f in "${JS_TESTS[@]}"; do
  run_suite "node" "$f"
done
for f in "${PY_TESTS[@]}"; do
  run_suite "python3" "$f"
done

echo "────────────────────────────────────────────────────"
TOTAL=$((PASS+FAIL))
echo "Results: $PASS/$TOTAL suites passed, $FAIL failed"
if [ "$FAIL" -gt 0 ]; then
  echo "STATUS: FAIL — ${FAILED_SUITES[*]}"
  exit 1
else
  echo "STATUS: PASS — all suites green"
  exit 0
fi
