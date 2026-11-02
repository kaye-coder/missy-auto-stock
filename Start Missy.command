#!/bin/bash
set -e
export PATH="/opt/homebrew/bin:/usr/local/bin:$PATH"
SOURCE="$0"
while [ -L "$SOURCE" ]; do
  DIR="$(cd -P "$(dirname "$SOURCE")" && pwd)"
  TARGET="$(readlink "$SOURCE")"
  case "$TARGET" in /*) SOURCE="$TARGET" ;; *) SOURCE="$DIR/$TARGET" ;; esac
done
ROOT="$(cd -P "$(dirname "$SOURCE")" && pwd)"
if ! command -v node >/dev/null 2>&1; then
  echo "Install Node.js 22 LTS or newer from nodejs.org, then open this file again."
  read -r -p "Press Enter to close… "
  exit 1
fi
node "$ROOT/scripts/launch-mac.mjs" || { read -r -p "Press Enter to close… "; exit 1; }