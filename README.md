# Missy — Offline Shop Management

Missy is a fully offline point-of-sale and shop management app: products and stock,
sales and receipts, customers, expenses, accounting journals, users, and reporting.

Everything runs on one machine (an iMac works great) with an embedded SQLite
database file — **no Docker, no PostgreSQL, no cloud, no internet required**.
Other computers on the same local network use the app through the browser.

---

## Requirements

- **macOS** 12 Monterey or newer (Windows/Linux also work, but the setup below targets Mac)
- **Node.js 20.19+ or 22.12+** (Node 22 LTS recommended) — <https://nodejs.org>
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

## Running the app

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

Notes:
- Keep the terminal window running — closing it stops the app for everyone.
- If other machines can't connect, allow incoming connections for Node in
  **System Settings → Network → Firewall → Options**.
- Multiple users can be logged in at the same time from different computers;
  each browser session is independent.

---

## Backup & Restore

All data lives in a single file: `data/missy.db`. Backups are copies of that file
stored in `data/backups/`.

**Automatic backups** — the app creates a backup automatically every 7 days while
it is running. Old backups are kept in `data/backups/` so you can roll back.

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
