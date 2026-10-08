#!/usr/bin/env bash
# Zip each skill for claude.ai (Settings > Capabilities > Skills) or the Claude API (/v1/skills).
# The zip's top-level folder is the skill directory, as those surfaces require.
set -euo pipefail
cd "$(dirname "$0")/.."
mkdir -p dist
for d in skills/*/; do
  name=$(basename "$d")
  rm -f "dist/$name.zip"
  (cd skills && zip -qr "../dist/$name.zip" "$name" -x '*.DS_Store' -x '*__pycache__*')
  echo "dist/$name.zip"
done
