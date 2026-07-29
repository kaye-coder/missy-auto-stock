# Missy’s Auto Wares — Local Setup

Run the app locally on your MacBook.

## Requirements

- macOS (Windows and Linux work too)
- Node.js 22 or newer

## Database

This project uses an **embedded SQLite database** — a single file at `data/missy.db`.

- Nothing to install or start: the app creates and opens the database itself.
- No Docker, no database service, no cloud connection at any point.
- Backed up automatically every 7 days into `data/backups/`, plus manual backup and restore in **Settings → Backups**.

## Run the app

```bash
# 1. Clone the repo
git clone <repo-url>
cd missys-auto-wares

# 2. Install dependencies (needs internet once)
npm install

# 3. Start everything — app + database + LAN access
npm start
```

The app opens at `http://localhost:8080`.

## Full offline Mac + LAN setup

For a complete step-by-step guide — including Docker, Supabase CLI, `.env` configuration, and connecting other computers on the same LAN — see **[SETUP_MAC.md](SETUP_MAC.md)**.

## Environment notes

- No credentials or environment variables are required.
- The server listens on `0.0.0.0:8080`, so other computers on the shop network can use
  `http://<server-ip>:8080`. Set `PORT` to use a different port.
