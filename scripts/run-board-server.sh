#!/bin/bash
# Wrapper script for com.zazu.board-server launchd agent.
export HOME="/Users/zazunyche"
export PATH="/Users/zazunyche/.npm-global/bin:/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin"

echo "[$(date -u +%FT%TZ)] run-board-server.sh launched by launchd (pid=$$)" \
  >> /Users/zazunyche/Documents/src/family-board/logs/server.log 2>&1

exec /opt/homebrew/Cellar/node/26.0.0/bin/node \
  /Users/zazunyche/Documents/src/family-board/server.js
