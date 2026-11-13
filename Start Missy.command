#!/bin/bash
# Missy one-click launcher: checks requirements, installs what is missing, then starts.
set -euo pipefail
export PATH="/opt/homebrew/bin:/usr/local/bin:$PATH"
SOURCE="$0"
while [ -L "$SOURCE" ]; do
  DIR="$(cd -P "$(dirname "$SOURCE")" && pwd)"
  TARGET="$(readlink "$SOURCE")"
  case "$TARGET" in /*) SOURCE="$TARGET" ;; *) SOURCE="$DIR/$TARGET" ;; esac
done
ROOT="$(cd -P "$(dirname "$SOURCE")" && pwd)"
RUNTIME="$ROOT/.runtime/node"
[ -x "$RUNTIME/bin/node" ] && export PATH="$RUNTIME/bin:$PATH"

node_ok() {
  command -v node >/dev/null 2>&1 || return 1
  node -e 'const [major, minor] = process.versions.node.split(".").map(Number); process.exit(major > 22 || (major === 22 && minor >= 13) ? 0 : 1)' >/dev/null 2>&1
}

if ! node_ok; then
  echo "First-time setup: downloading Node.js (needs internet once)…"
  ARCH="$(uname -m)"; [ "$ARCH" = "arm64" ] || ARCH="x64"
  VER="v22.23.0"
  URL="https://nodejs.org/dist/$VER/node-$VER-darwin-$ARCH.tar.gz"
  mkdir -p "$ROOT/.runtime"
  if ! curl -fL --progress-bar "$URL" -o "$ROOT/.runtime/node.tgz"; then
    echo "Could not download Node.js. Connect to the internet and open this file again."
    read -r -p "Press Enter to close… "; exit 1
  fi
  curl -fsL "https://nodejs.org/dist/$VER/SHASUMS256.txt" -o "$ROOT/.runtime/SHASUMS256.txt"
  EXPECTED="$(awk -v name="node-$VER-darwin-$ARCH.tar.gz" '$2 == name {print $1}' "$ROOT/.runtime/SHASUMS256.txt")"
  ACTUAL="$(shasum -a 256 "$ROOT/.runtime/node.tgz" | awk '{print $1}')"
  [ -n "$EXPECTED" ] && [ "$EXPECTED" = "$ACTUAL" ] || { echo "Node.js download verification failed. Retry setup with internet connected."; exit 1; }
  rm -rf "$RUNTIME"; mkdir -p "$RUNTIME"
  tar -xzf "$ROOT/.runtime/node.tgz" -C "$RUNTIME" --strip-components=1
  rm -f "$ROOT/.runtime/node.tgz"
  xattr -dr com.apple.quarantine "$RUNTIME" 2>/dev/null || true
  export PATH="$RUNTIME/bin:$PATH"
  echo "Node.js ready."
fi

if [ ! -d "$ROOT/node_modules/vite" ] || [ -f "$ROOT/.missy-install-pending" ]; then
  echo "Installing app components (one time)…"
  (cd "$ROOT" && npm install --no-audit --no-fund --loglevel=error) || {
    echo "Install failed. Check the internet connection and try again."
    read -r -p "Press Enter to close… "; exit 1; }
fi

node "$ROOT/scripts/launch-mac.mjs" || { read -r -p "Press Enter to close… "; exit 1; }
rm -f "$ROOT/.missy-install-pending"
