#!/bin/bash
# Wrapper script for com.zazu.scheduler launchd agent.
export HOME="/Users/zazunyche"
export PATH="/Users/zazunyche/.npm-global/bin:/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin"

echo "[$(date -u +%FT%TZ)] run-scheduler.sh launched by launchd (pid=$$)" \
  >> /Users/zazunyche/Documents/src/family-board/logs/scheduler-launchd.log 2>&1

exec /opt/homebrew/Cellar/node/26.0.0/bin/node \
  /Users/zazunyche/Documents/src/family-board/scripts/zazu-scheduler.js
