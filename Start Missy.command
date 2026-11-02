#!/bin/bash
# Missy one-click launcher: checks requirements, installs what is missing, then starts.
set -e
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
  MAJOR="$(node -p 'process.versions.node.split(".")[0]' 2>/dev/null || echo 0)"
  [ "$MAJOR" -ge 22 ]
}

if ! node_ok; then
  echo "First-time setup: downloading Node.js (needs internet once)…"
  ARCH="$(uname -m)"; [ "$ARCH" = "arm64" ] || ARCH="x64"
  VER="v22.11.0"
  URL="https://nodejs.org/dist/$VER/node-$VER-darwin-$ARCH.tar.gz"
  mkdir -p "$ROOT/.runtime"
  if ! curl -fL --progress-bar "$URL" -o "$ROOT/.runtime/node.tgz"; then
    echo "Could not download Node.js. Connect to the internet and open this file again."
    read -r -p "Press Enter to close… "; exit 1
  fi
  rm -rf "$RUNTIME"; mkdir -p "$RUNTIME"
  tar -xzf "$ROOT/.runtime/node.tgz" -C "$RUNTIME" --strip-components=1
  rm -f "$ROOT/.runtime/node.tgz"
  xattr -dr com.apple.quarantine "$RUNTIME" 2>/dev/null || true
  export PATH="$RUNTIME/bin:$PATH"
  echo "Node.js ready."
fi

if [ ! -d "$ROOT/node_modules" ]; then
  echo "Installing app components (one time)…"
  (cd "$ROOT" && npm install --no-audit --no-fund --loglevel=error) || {
    echo "Install failed. Check the internet connection and try again."
    read -r -p "Press Enter to close… "; exit 1; }
fi

node "$ROOT/scripts/launch-mac.mjs" || { read -r -p "Press Enter to close… "; exit 1; }
