# Missy — Local Setup on Mac (Offline LAN)

Complete step-by-step guide to run this project locally on macOS with your own offline database. No internet is required after the initial setup.

---

## What this guide covers

- Installing everything needed on the server Mac
- Installing the project
- Starting the local database and app
- Connecting other computers on the same Wi-Fi / LAN
- Fixing the most common error: missing `SUPABASE_SERVICE_ROLE_KEY`
- Daily use, backup, and reset commands

---

## What you'll install

1. **Homebrew** — Mac package manager (installs everything else)
2. **Git** — to download the project
3. **Bun** — to run the app
4. **Docker Desktop** — runs the local database
5. **Supabase CLI** — manages the local database (Postgres + Auth + Storage + Realtime)

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

1. Download from https://www.docker.com/products/docker-desktop/
2. Pick the **Apple Silicon** version for M1/M2/M3/M4 Macs, or **Intel** for older Macs.
3. Open the `.dmg` file and drag Docker to Applications.
4. Launch **Docker Desktop** from Applications.
5. Wait until the whale icon in the menu bar stops animating (it says "Docker Desktop is running").

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

Replace `<YOUR_GIT_URL_HERE>` with the URL from your Lovable project's GitHub.

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

**Copy all three values: `API URL`, `anon key`, and `service_role key` — you need them next.**

---

## Step 7 — Create your local `.env` file

Create a file named `.env` in the project folder (`~/Desktop/missy/.env`) and paste this, replacing the placeholder values with the ones from Step 6:

```env
VITE_SUPABASE_URL=http://127.0.0.1:54321
VITE_SUPABASE_PUBLISHABLE_KEY=<paste anon key here>
VITE_SUPABASE_PROJECT_ID=local

SUPABASE_URL=http://127.0.0.1:54321
SUPABASE_PUBLISHABLE_KEY=<paste anon key here>
SUPABASE_SERVICE_ROLE_KEY=<paste service_role key here>
```

Important notes:

- On the **server Mac**, use `127.0.0.1` for everything. The app backend runs on the same machine, so it talks directly to the local database.
- Do **not** omit `SUPABASE_SERVICE_ROLE_KEY`. The app needs it to run server-side tasks even in local mode.
- If other computers on the same LAN will use the app, see **Step 10** for the client-side URL change.

Save the file.

---

## Step 8 — Apply the database schema

This creates all the tables (products, sales, customers, users, accounts, etc.) in your local database:

```bash
supabase db reset
```

This runs every migration file in `supabase/migrations/` and seeds your chart of accounts.

---

## Step 9 — Run the app

```bash
bun dev --host 0.0.0.0
```

Open http://localhost:8080 on the server Mac, or `http://YOUR-MAC-IP:8080` from another computer.

---

## Step 10 — Use the app from other computers on the same LAN

### On the server Mac

1. Find your Mac's local IP address:

```bash
ifconfig | grep "inet " | grep -v 127.0.0.1
```

Or go to **System Settings → Network → Wi-Fi → Details → IP Address**.  
Example: `192.168.1.42`

2. Make sure the `.env` file has the server IP in `VITE_SUPABASE_URL`. This is the URL the browser on other computers will use to reach the database. The server Mac backend can still use `127.0.0.1`:

```env
VITE_SUPABASE_URL=http://192.168.1.42:54321
SUPABASE_URL=http://127.0.0.1:54321
SUPABASE_SERVICE_ROLE_KEY=<paste service_role key here>
```

> Replace `192.168.1.42` with your actual Mac IP address.

3. Restart the app after changing `.env`:

```bash
# Press Ctrl+C in the terminal running bun dev, then:
bun dev --host 0.0.0.0
```

### On each client computer

Open a browser and go to:

```
http://<server-mac-ip>:8080
```

Example: `http://192.168.1.42:8080`

No `.env` file is needed on client computers. They only need the browser.

> Make sure both computers are on the same Wi-Fi network or LAN. If you use a firewall or router, ports `8080` and `54321` must be allowed between devices.

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

- Press `Ctrl + C` in the terminal running `bun dev`.
- Run `supabase stop` to shut the database down.

---

## Troubleshooting

### Error: "Missing Supabase environment variable: SUPABASE_SERVICE_ROLE_KEY"

This means the `.env` file is missing `SUPABASE_SERVICE_ROLE_KEY` or the value is wrong.

Fix:

1. Get the correct service role key:

```bash
supabase status
```

2. Copy the value shown after `service_role key:`.
3. Open `~/Desktop/missy/.env` and make sure this line exists and is filled in:

```env
SUPABASE_SERVICE_ROLE_KEY=<paste service_role key here>
```

4. Restart the app:

```bash
# Press Ctrl+C, then:
bun dev --host 0.0.0.0
```

### Error: "Cannot connect to Docker daemon"

Open Docker Desktop and wait for it to fully start.

### Error: "Port 54321 already in use"

Another Supabase project is running. Run `supabase stop` in that project's folder first.

### App loads but login fails / blank screen

Check `.env` values match `supabase status` output exactly, then restart `bun dev`.

### Slow first `supabase start`

Normal — it's downloading Docker images. Later starts take ~10 seconds.

### Changes to `.env` not taking effect

Stop `bun dev` with `Ctrl + C` and start it again. The app reads `.env` only at startup.

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
| `bun dev --host 0.0.0.0` | Run the app and allow LAN access |
| `bun run build` | Build for production |

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

## Resetting everything from scratch

If you want to start fresh:

```bash
supabase db reset
```

This deletes all data and re-creates the database with the original migrations. The chart of accounts will be re-seeded.

---

## Important notes

- This setup is **completely offline**. No internet is needed after the initial install.
- No Supabase Cloud account is required.
- No Lovable Cloud credentials are required.
- All data is stored on the server Mac in the local Postgres database.
- The `SUPABASE_SERVICE_ROLE_KEY` is a local key only. It is created by your local Supabase instance and never leaves your machine.
- Keep your `.env` file private. Do not share it or commit it to GitHub.

---

That's it — you are fully offline and ready to use the app on your local network.