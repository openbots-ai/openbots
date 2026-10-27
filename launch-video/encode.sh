#!/usr/bin/env bash
# Frames + mixed audio -> out/openbots-launch.mp4 (H.264, AAC, X-friendly)
set -euo pipefail
cd "$(dirname "$0")"
ffmpeg -y -loglevel error -framerate 30 -i out/frames/f_%05d.jpg -i out/audio.wav \
  -vf "tpad=stop_mode=clone:stop_duration=0.5,format=yuv420p" \
  -c:v libx264 -preset slow -crf 16 -profile:v high -level 4.2 -r 30 \
  -af "loudnorm=I=-15:TP=-1.5:LRA=9" -c:a aac -b:a 192k -ar 44100 -shortest -movflags +faststart out/openbots-launch.mp4
