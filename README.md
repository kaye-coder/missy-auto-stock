# Missy — Offline Shop Management

Missy is a fully offline point-of-sale and shop management app: products and stock,
sales and receipts, customers, expenses, accounting journals, users, and reporting.

Everything runs on one machine (an iMac works great) with an embedded SQLite
database file — **no Docker, no PostgreSQL, no cloud, no internet required**.
Other computers on the same local network use the app through the browser.

---

## Requirements

- **macOS** 12 Monterey or newer (Windows/Linux also work, but the setup below targets Mac)
- **Node.js 22.13+** (Node 22 LTS or newer) — <https://nodejs.org> (includes SQLite fallback when the optional native driver is unavailable)
- **npm 10+** (installed with Node.js)
- **Git** (comes with Xcode Command Line Tools: `xcode-select --install`)
- ~500 MB free disk space
- A modern browser (Chrome recommended for receipt printing)

Nothing else. No Docker, no database server, no external services or API keys.

Check your versions:

```bash
node -v   # v20.19+ or v22.12+
npm -v    # 10+
git --version
```

---

## Installation

```bash
# 1. Clone the repository
git clone <YOUR_REPO_URL> missy
cd missy

# 2. Install dependencies
npm install
```

That's it. The SQLite database is created automatically at `data/missy.db` the
first time the app starts, including the schema and the default chart of accounts.

---

## One-click launch on a Mac

**For an existing client installation:** back up first, stop the old server, and update the
app files **in the same existing folder**. Keep `data/`, `uploads/`, and browser settings.
Do not launch a new empty app copy: it would use a different database.

1. Open **Start Missy.command** in the app folder (right-click → Open if macOS asks).
   If downloading removed its executable permission, run `chmod +x "Start Missy.command"` once.
2. Choose a **database backup folder** or type its full path. Existing shop data stays in place.
   This choice is stored in `data/launcher.json` (or your existing `MISSY_DATA_DIR`).
3. First launch installs missing dependencies (internet needed if missing), then prepares a
   minified, compressed offline app. This one-time preparation can take several minutes.
4. A **Missy.command** Desktop shortcut appears. Future launches start the server in the
   background and open the browser when ready. You can close the launcher window safely.
   Clicking again reopens the running app rather than intentionally starting another server.

Keep the app folder in place so the shortcut works. No daily install, compilation, Docker,
cloud connection, or internet is needed after preparation. Offline fonts use installed system
fonts instead of Google Fonts. LAN access and live updates continue as before.

If another app/folder occupies port 8080, stop that server before retrying. Errors are written
to `data/missy-server.log`. macOS dialogs and launch speed must be tested on the actual Mac.

**Change backup location:** stop Missy, edit the absolute `backupDirectory` in `data/launcher.json`,
then reopen; or remove **only** `launcher.json` to show the chooser again. Never remove `missy.db`.
`MISSY_BACKUP_DIR`, if set, takes precedence. Old backups stay in their previous folder: copy the
old `.db` snapshots to the chosen folder if you want them in the restore list. Keep any external
backup drive connected and writable. Database snapshots exclude photos: copy `uploads/` separately.
Keep the same browser on `http://localhost:8080` to retain browser-local checkout settings.

**Speed:** prebuilt Brotli/gzip assets avoid daily compiler startup. Additive SQLite indexes speed
common reads; embedded reads reuse statements. Historical records, backup policy and live-update
functions are preserved. Instant speed at unlimited data sizes cannot be guaranteed: full-history
screens and synchronous database backups still slow as records grow. First index creation may take time.

## Running the app manually / development

```bash
npm start
```

The app starts on port **8080** and binds to `0.0.0.0`, so it is reachable from
any device on the same local network.

- On the iMac itself: <http://localhost:8080>
- From other computers/tablets on the network: `http://<IMAC-IP>:8080`

Find the iMac's IP address:

```bash
ipconfig getifaddr en0   # Wi-Fi
ipconfig getifaddr en1   # Ethernet
```

Example: if it prints `192.168.1.50`, others open `http://192.168.1.50:8080`.

Notes for the development command above:
- Keep the terminal window running — closing it stops the app for everyone.
- If other machines can't connect, allow incoming connections for Node in
  **System Settings → Network → Firewall → Options**.
- Multiple users can be logged in at the same time from different computers;
  each browser session is independent.

---

## Backup & Restore

All data lives in a single file: `data/missy.db`. Backups are copies of that file
stored in the chosen backup folder, or `data/backups/` before one-click setup.

**Automatic backups** — the app creates a backup automatically every 7 days while
The ten newest automatic/manual `missy-` snapshots are kept in the selected folder.

**Backup Now (manual)** — go to **Manage → Settings → Backups** and click
**Backup Now**. A timestamped snapshot is written to `data/backups/` immediately.
Do this before any risky change or before updating the app.

**Restore** — in the same **Backups** card, pick a backup from the list and click
**Restore**. The current database is replaced with the selected snapshot; the app
takes a safety copy of the current state first. Refresh the browser afterwards.

**Off-machine copies** — periodically copy the whole `data/` folder to an external
drive or another computer. That folder is the complete business data.

---

## Updating

Keep the existing update workflow below. For one-click launch, regenerate the offline files
**once after source updates**, not every day: `npm run prepare:offline`.
Stop the running server before reopening the Desktop shortcut so new server code takes effect.
To stop a launcher-started server, find its PID with `lsof -nP -iTCP:8080 -sTCP:LISTEN`, verify
it is the Missy Node process, and run `kill <PID>`. Do not stop another application's process.

```bash
# 1. Back up first (Settings → Backups → Backup Now), then:
cd missy
git pull

# 2. Reinstall dependencies if package.json changed
npm install

# 3. Start again
npm start
```

Your `data/` folder is never touched by updates — products, sales and users are
preserved. If `git pull` reports local changes, keep your data folder and reset
only source files.

---

## Project layout

```
server/     Offline API, SQLite adapter, auth, backups
src/        React front-end (TanStack Start + Vite)
data/       SQLite database + automatic backups (not committed)
uploads/    Product images stored on disk (not committed)
scripts/    One-off maintenance scripts
```

A plain-text list of every dependency is kept in `requirements.txt` for quick
reference; `package.json` remains the source of truth for installs.
