#!/bin/bash
# scripts/get-latest-attachment.sh
# The iMessage plugin only surfaces image attachments through the normal
# channel (filters out everything else by mime type — see plugin source).
# This queries chat.db directly (same DB the plugin reads, read-only) to
# find the most recent attachment of any type, so Zazu can pick up videos
# (or other files) the plugin won't pass through automatically.
#
# Usage: bash scripts/get-latest-attachment.sh [mime_prefix]
#   e.g. bash scripts/get-latest-attachment.sh video/
sqlite3 ~/Library/Messages/chat.db "
SELECT a.filename, a.mime_type, datetime(m.date/1000000000 + 978307200, 'unixepoch', 'localtime')
FROM attachment a
JOIN message_attachment_join maj ON maj.attachment_id = a.ROWID
JOIN message m ON m.ROWID = maj.message_id
WHERE a.mime_type LIKE '${1:-}%'
ORDER BY m.date DESC
LIMIT 5;
"
