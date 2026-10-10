#!/bin/bash
# Snapshot ~/.hermes/config.yaml into the repo (sanitized) so Hermes config drift
# is tracked nightly alongside the board. Secrets live in ~/.hermes/.env (gitignored),
# not config.yaml, but we redact defensively anyway.
set -euo pipefail
SRC="$HOME/.hermes/config.yaml"
DEST="/Users/zazunyche/Documents/src/family-board/infra/hermes/config.snapshot.yaml"
mkdir -p "$(dirname "$DEST")"
if [ ! -f "$SRC" ]; then echo "no config.yaml at $SRC"; exit 0; fi
# Redact any literal secret value following an api_key/token/secret/password/bearer key.
sed -E 's/((api_key|token|secret|password|bearer)[[:space:]]*:[[:space:]]*["'"'"']?)[^"'"'"'[:space:]]{8,}/\1<REDACTED>/Ig' "$SRC" > "$DEST"
echo "snapshot written: $DEST"
