#!/bin/bash
# ─────────────────────────────────────────────────────────────────────────────
# scripts/install-hooks.sh
# Installs committed hook templates from scripts/hooks/ into .git/hooks/.
# Run this once after every fresh clone.
# ─────────────────────────────────────────────────────────────────────────────

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
HOOKS_SRC="$REPO_ROOT/scripts/hooks"
HOOKS_DEST="$REPO_ROOT/.git/hooks"

if [[ ! -d "$HOOKS_SRC" ]]; then
  echo "ERROR: Hook templates not found at $HOOKS_SRC" >&2
  exit 1
fi

if [[ ! -d "$HOOKS_DEST" ]]; then
  echo "ERROR: .git/hooks directory not found — are you in a git repo?" >&2
  exit 1
fi

echo "Installing git hooks from $HOOKS_SRC → $HOOKS_DEST"

for HOOK in "$HOOKS_SRC"/*; do
  HOOK_NAME=$(basename "$HOOK")
  DEST="$HOOKS_DEST/$HOOK_NAME"

  cp "$HOOK" "$DEST"
  chmod +x "$DEST"
  echo "  Installed: $HOOK_NAME"
done

echo ""
echo "Done. Hooks installed:"
ls -1 "$HOOKS_DEST" | grep -v '\.sample$' | sed 's/^/  /'
