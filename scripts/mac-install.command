#!/bin/bash
# Runs on the customer's Mac, never in the hosted application.
set -euo pipefail
RESOURCES="$(cd "$(dirname "$0")" && pwd)"
STAGE=""
cleanup() { [ -z "$STAGE" ] || rm -rf "$STAGE"; }
failed() { echo "Setup stopped. Existing shop data has not been deleted. Open Missy again to retry."; read -r -p "Press Enter to close… " || true; }
trap cleanup EXIT
trap failed ERR

CHOICE="$(osascript -e 'button returned of (display dialog "Install Missy. If this Mac already has shop records, choose Update existing and select the folder containing Start Missy.command, data and uploads. Never choose a new installation for an existing shop." buttons {"Cancel", "New installation", "Update existing"} default button "Update existing" cancel button "Cancel")')"
if [ "$CHOICE" = "Update existing" ]; then
  ROOT="$(osascript -e 'POSIX path of (choose folder with prompt "Select the EXISTING Missy app folder (containing Start Missy.command and data)")')"
  ROOT="${ROOT%/}"
  [ -f "$ROOT/server/index.mjs" ] && [ -f "$ROOT/package.json" ] || { echo "This is not a Missy app folder. No files were changed."; exit 1; }
else
  ROOT="$HOME/Documents/Missy"
  if [ -e "$ROOT" ]; then
    echo "Documents/Missy already exists. Choose Update existing instead. Nothing was changed."
    exit 1
  fi
fi

# Refuse updates while the shop is running; never terminate another process.
if /usr/sbin/lsof -nP -iTCP:8080 -sTCP:LISTEN >/dev/null 2>&1; then
  echo "Port 8080 is in use. Close the running Missy server before installing. No files were changed."
  exit 1
fi
STAGE="$(mktemp -d "${TMPDIR:-/tmp}/missy-install.XXXXXX")"
tar -xzf "$RESOURCES/application.tar.gz" -C "$STAGE"
mkdir -p "$ROOT"
# No --delete: preserve the live database, photos, settings and runtime.
rsync -a --exclude=data --exclude=uploads --exclude=.env --exclude=.runtime --exclude=node_modules --exclude=.git "$STAGE/" "$ROOT/"
chmod +x "$ROOT/Start Missy.command"

# New source must be prepared once; only generated assets are invalidated.
rm -rf "$ROOT/dist-offline"
touch "$ROOT/.missy-install-pending"
echo "Missy app files installed. Preparing requirements and offline files…"
bash "$ROOT/Start Missy.command"
CONFIG="$HOME/Library/Application Support/Missy Launcher"
mkdir -p "$CONFIG"
ln -sfn "$ROOT" "$CONFIG/installed-root"
APP="$(cd "$RESOURCES/../.." && pwd)"
if [ ! -e "$HOME/Desktop/Missy.app" ] && [ ! -L "$HOME/Desktop/Missy.app" ]; then
  ln -s "$APP" "$HOME/Desktop/Missy.app"
fi