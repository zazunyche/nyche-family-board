#!/bin/bash
# ─────────────────────────────────────────────────────────────────────────────
# scripts/video-to-guide.sh
# Turns an iPhone video into raw material for a step-by-step guide:
#   - Transcribes the audio (whisper.cpp, fully local — nothing leaves the Mac)
#   - Extracts a frame every N seconds so Zazu can see the visual steps
# Run interactively; Zazu reads the transcript + frames afterward and writes
# the actual guide.
#
# Usage: bash scripts/video-to-guide.sh /path/to/video.mov [frame_interval_sec]
# ─────────────────────────────────────────────────────────────────────────────

set -euo pipefail

VIDEO="$1"
INTERVAL="${2:-5}"   # seconds between extracted frames, default every 5s

if [ -z "$VIDEO" ] || [ ! -f "$VIDEO" ]; then
  echo "Usage: $0 /path/to/video.mov [frame_interval_sec]" >&2
  exit 1
fi

BOARD_DIR="/Users/zazunyche/Documents/src/family-board"
MODEL="$BOARD_DIR/scripts/whisper-models/ggml-base.en.bin"
STAMP=$(date "+%Y%m%d-%H%M%S")
OUTDIR="/tmp/zazu-video-guide-$STAMP"
mkdir -p "$OUTDIR"

echo "Output dir: $OUTDIR"

echo "→ Extracting audio..."
ffmpeg -y -i "$VIDEO" -ar 16000 -ac 1 -c:a pcm_s16le "$OUTDIR/audio.wav" -loglevel error

echo "→ Transcribing (whisper.cpp, local)..."
whisper-cli -m "$MODEL" -f "$OUTDIR/audio.wav" -of "$OUTDIR/transcript" -otxt -ml 1 2>/dev/null
echo "  Transcript: $OUTDIR/transcript.txt"

echo "→ Extracting frames every ${INTERVAL}s..."
ffmpeg -y -i "$VIDEO" -vf "fps=1/${INTERVAL}" "$OUTDIR/frame-%03d.png" -loglevel error
echo "  Frames: $OUTDIR/frame-*.png ($(ls "$OUTDIR"/frame-*.png 2>/dev/null | wc -l | tr -d ' ') extracted)"

echo ""
echo "Done. Zazu: read $OUTDIR/transcript.txt and the frame-*.png files to compose the guide."
