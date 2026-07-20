# Missy — Local Setup on Mac (Offline)

Complete step-by-step guide to run this project locally on macOS with your own offline database.

---

## What you'll install

1. **Homebrew** — Mac package manager (installs everything else)
2. **Node.js** (via Bun) — to run the app
3. **Docker Desktop** — runs the local database
4. **Supabase CLI** — manages the local database (Postgres + Auth + Storage)
5. **Git** — to download the project

Total install size: ~4 GB. Time: ~30 minutes first time, then `supabase start` + `bun dev` after that.

---

## Step 1 — Install Homebrew

Open **Terminal** (press `Cmd + Space`, type "Terminal", hit Enter) and paste:

```bash
/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
```

Follow the prompts (it will ask for your Mac password). When it finishes, close Terminal and reopen it.

Verify:
```bash
brew --version
```

---

## Step 2 — Install Git, Bun, and Supabase CLI

```bash
brew install git oven-sh/bun/bun supabase/tap/supabase
```

Verify:
```bash
git --version
bun --version
supabase --version
```

---

## Step 3 — Install Docker Desktop

Docker runs the local Postgres database.

1. Download from https://www.docker.com/products/docker-desktop/ (pick the **Apple Silicon** version for M1/M2/M3/M4 Macs, or **Intel** for older Macs).
2. Open the `.dmg` file and drag Docker to Applications.
3. Launch **Docker Desktop** from Applications. Wait until the whale icon in the menu bar stops animating (it says "Docker Desktop is running").

Verify:
```bash
docker --version
```

> Keep Docker Desktop running whenever you want to use the app.

---

## Step 4 — Download the project

In Terminal:

```bash
cd ~/Desktop
git clone <YOUR_GIT_URL_HERE> missy
cd missy
```

Replace `<YOUR_GIT_URL_HERE>` with the URL from your Lovable project's GitHub (click **GitHub** in the top right of Lovable to connect/get the URL).

---

## Step 5 — Install project dependencies

```bash
bun install
```

---

## Step 6 — Start the local database

```bash
supabase start
```

First run downloads Docker images (~2 GB, takes 5–10 min). When done, you'll see output like:

```
API URL: http://127.0.0.1:54321
DB URL: postgresql://postgres:postgres@127.0.0.1:54322/postgres
Studio URL: http://127.0.0.1:54323
anon key: eyJhbGciOi...
service_role key: eyJhbGciOi...
```

**Copy the `API URL` and `anon key`** — you need them next.

---

## Step 7 — Create your local `.env` file

In the project folder, create a file named `.env` with this content (paste the values from Step 6).

For **only this Mac**, `127.0.0.1` works:

```env
VITE_SUPABASE_URL=http://127.0.0.1:54321
VITE_SUPABASE_PUBLISHABLE_KEY=<paste anon key here>
VITE_SUPABASE_PROJECT_ID=local

SUPABASE_URL=http://127.0.0.1:54321
SUPABASE_PUBLISHABLE_KEY=<paste anon key here>
SUPABASE_SERVICE_ROLE_KEY=<paste service_role key here>
```

For **other computers on the same Wi‑Fi/LAN**, replace only the `VITE_SUPABASE_URL` value with your server Mac IP address:

```env
VITE_SUPABASE_URL=http://YOUR-MAC-IP:54321
```

Keep `SUPABASE_URL=http://127.0.0.1:54321` on the server Mac because the app backend runs on that same Mac.

Save the file.

---

## Step 8 — Apply the database schema

This creates all the tables (products, sales, customers, etc.) in your local database:

```bash
supabase db reset
```

This runs every migration file in `supabase/migrations/` and seeds your chart of accounts.

---

## Step 9 — Run the app

```bash
bun dev --host 0.0.0.0
```

Open http://localhost:8080 on the server Mac, or `http://YOUR-MAC-IP:8080` from another computer. 🎉

---

## Daily use (after setup is done)

Every time you want to use the app:

1. Open **Docker Desktop** (wait for the whale to be steady).
2. In Terminal:
   ```bash
   cd ~/Desktop/missy
   supabase start
    bun dev --host 0.0.0.0
   ```
3. Open http://localhost:8080 on the server Mac, or `http://YOUR-MAC-IP:8080` from another computer.

To stop:
- Press `Ctrl + C` in the terminal running `bun dev`
- Run `supabase stop` to shut the database down

---

## Useful commands

| Command | What it does |
| --- | --- |
| `supabase start` | Start local database |
| `supabase stop` | Stop local database |
| `supabase status` | Show URLs + keys again |
| `supabase db reset` | Wipe DB and re-apply all migrations (⚠️ deletes all data) |
| `open http://127.0.0.1:54323` | Open Supabase Studio (visual DB browser) |
| `bun dev` | Run the app |
| `bun run build` | Build for production |

---

## Troubleshooting

**"Cannot connect to Docker daemon"** → Open Docker Desktop and wait for it to fully start.

**"Port 54321 already in use"** → Another Supabase project is running. Run `supabase stop` in that project's folder first.

**App loads but login fails / blank screen** → Check `.env` values match `supabase status` output exactly, then restart `bun dev`.

**Slow first `supabase start`** → Normal, it's downloading Docker images. Later starts take ~10 seconds.

**Want to reset everything from scratch** → `supabase db reset` (wipes DB, re-runs migrations).

---

## Backing up your data

Your local data lives inside Docker. To back it up:

```bash
supabase db dump --local -f backup.sql
```

To restore:

```bash
psql postgresql://postgres:postgres@127.0.0.1:54322/postgres < backup.sql
```

---

That's it — you're fully offline. No internet needed after Step 6.
