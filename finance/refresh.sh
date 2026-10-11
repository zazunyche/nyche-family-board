#!/bin/bash
# finance/refresh.sh — one command to rebuild the whole finance pipeline after
# dropping in new statements. Deterministic + idempotent. Everything stays local.
#   extract+reconcile -> tag transfers -> categorize -> summary JSON (dashboard) -> HTML snapshot
set -euo pipefail
cd "$(dirname "$0")/.."
echo "[1/5] extract + reconcile";   python3 finance/build_db.py 2>&1 | grep -E "reconciled OK" || true
echo "[2/5] tag internal transfers"; python3 finance/phase2_transfers.py 2>&1 | grep -E "Tagged" || true
echo "[3/5] categorize spending";    python3 finance/phase2_categorize.py 2>&1 | grep -E "categorized" || true
echo "[4/5] build dashboard summary"; python3 finance/gen_summary_json.py
echo "[5/5] build HTML snapshot";     python3 finance/gen_snapshot.py
echo "Done. Dashboard: http://100.90.94.15:3000/finance.html (refresh the page)."
