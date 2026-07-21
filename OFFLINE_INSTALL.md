# Missy — Fully Offline Install (Self-Hosted Supabase)

This guide runs the whole app on one machine with **no internet required after setup**. Primary target: **Windows 10/11**. Shorter notes for **macOS** and **Linux** at the bottom.

Backend = self-hosted Supabase (Postgres + Auth + Storage + Realtime + PostgREST) running in Docker. App = this React/TanStack Start project built to a static bundle you run locally.

The app already reads all Supabase connection info from environment variables — nothing is hardcoded — so the same source can point at the cloud project OR a local self-hosted stack just by changing `.env`.

---

## What needs internet, and when

| Step | Internet? |
| --- | --- |
| Download Docker Desktop installer | **Yes (once)** |
| Download Node/Bun installer | **Yes (once)** |
| First `docker compose pull` of Supabase images (~2 GB) | **Yes (once)** |
| First `bun install` (npm packages) | **Yes (once)** |
| Everything after that (start, use, LAN access) | **No — fully offline** |

You can do all "Yes (once)" steps on a connected computer, then copy the whole folder (project + `~/.docker` image cache exported via `docker save`) to an air-gapped machine. See **Appendix A** for offline transfer.

---

## Cloud-only features to be aware of

Everything in this app maps cleanly to self-hosted Supabase. The only pieces that behave differently offline:

- **Product image storage** — uses Supabase Storage. Self-hosted Storage is included in the docker-compose stack and works identically; the `product-images` bucket is created automatically by the migrations.
- **No edge functions or cron jobs are used.** All server logic runs inside the app itself via TanStack server functions.
- **Realtime updates** (dashboard, statistics) — work offline; they use the self-hosted Realtime service in the same compose stack.
- **Email/SMS auth providers** — not used. Login is a custom `app_users` table, so no SMTP/SMS provider is required offline.

Nothing else depends on the cloud.

---

## 1. Install Docker Desktop (Windows)

1. Download from <https://www.docker.com/products/docker-desktop/> (WSL2 backend is fine and recommended).
2. Run the installer, accept defaults, reboot if asked.
3. Launch **Docker Desktop** and wait until the whale icon says *"Docker Desktop is running"*.
4. Verify in PowerShell:
   ```powershell
   docker --version
   docker compose version
   ```

---

## 2. Install Bun (to build and run the app)

In PowerShell:
```powershell
powershell -c "irm bun.sh/install.ps1 | iex"
```
Close and reopen PowerShell, then:
```powershell
bun --version
```

(Node.js 20+ also works with `npm`/`pnpm` if you prefer.)

---

## 3. Set up the self-hosted Supabase stack

Supabase publishes an official docker-compose. We'll put it next to the project.

```powershell
cd $HOME\Desktop
git clone --depth 1 https://github.com/supabase/supabase.git supabase-selfhost
cd supabase-selfhost\docker
copy .env.example .env
```

Open `supabase-selfhost\docker\.env` in a text editor and change **at minimum** these values (any strong random strings — a password manager works):

```
POSTGRES_PASSWORD=<strong-random-password>
JWT_SECRET=<random 40+ char string>
ANON_KEY=<generate below>
SERVICE_ROLE_KEY=<generate below>
DASHBOARD_USERNAME=admin
DASHBOARD_PASSWORD=<strong-random-password>
SITE_URL=http://localhost:8080
API_EXTERNAL_URL=http://localhost:8000
```

Generate `ANON_KEY` and `SERVICE_ROLE_KEY` from the `JWT_SECRET` here: <https://supabase.com/docs/guides/self-hosting/docker#generate-api-keys> (do this step while online; the keys never expire). Keep the three values (`JWT_SECRET`, `ANON_KEY`, `SERVICE_ROLE_KEY`) — you'll paste them into the app's `.env` in step 5.

Pull and start the stack (first pull needs internet):
```powershell
docker compose pull
docker compose up -d
```

Wait ~60 seconds. Check everything is up:
```powershell
docker compose ps
```

You should see `db`, `auth`, `rest`, `realtime`, `storage`, `kong`, and `studio` all `running` or `healthy`.

The API is now reachable at `http://localhost:8000` and Studio at `http://localhost:8000` (login with the dashboard credentials above).

---

## 4. Apply the database schema (migrations)

The full schema — every table, RLS policy, function, trigger, and the storage bucket — lives in `supabase/migrations/` in this project. They are ordered by filename and safe to replay in order against a fresh empty database.

Get a shell to Postgres inside the compose stack:
```powershell
cd $HOME\Desktop\missy
```

Then, in PowerShell, apply every migration in order:
```powershell
Get-ChildItem supabase\migrations\*.sql | Sort-Object Name | ForEach-Object {
  Write-Host "Applying $($_.Name)"
  Get-Content $_.FullName -Raw | docker exec -i supabase-db psql -U postgres -d postgres
}
```

If any file errors, note which one and see **Troubleshooting** below. A clean run ends with no `ERROR:` lines.

Then apply the offline bootstrap (creates the `product-images` storage bucket that lives outside the migrations folder on cloud Supabase):
```powershell
Get-Content supabase\offline_bootstrap.sql -Raw | docker exec -i supabase-db psql -U postgres -d postgres
```

You can verify by opening Studio at <http://localhost:8000> → Table Editor → you should see `accounts`, `products`, `sales`, `app_users`, etc.

---

## 5. Point the app at the local Supabase

In the project root (`$HOME\Desktop\missy`), create a file named `.env` with these lines (paste the keys you generated in step 3):

```
VITE_SUPABASE_URL=http://localhost:8000
VITE_SUPABASE_PUBLISHABLE_KEY=<ANON_KEY from step 3>
VITE_SUPABASE_PROJECT_ID=local

SUPABASE_URL=http://localhost:8000
SUPABASE_PUBLISHABLE_KEY=<ANON_KEY from step 3>
SUPABASE_SERVICE_ROLE_KEY=<SERVICE_ROLE_KEY from step 3>
```

**All three keys are required** — the app's server-side code uses the service role key for privileged operations (user management, session validation).

For LAN access from other computers, replace `localhost` in `VITE_SUPABASE_URL` with the server PC's LAN IP (find it with `ipconfig`), e.g. `http://192.168.1.42:8000`. Leave `SUPABASE_URL` as `localhost` (that one is used only by the server process itself).

---

## 6. Install dependencies and run the app

Still in `$HOME\Desktop\missy`:
```powershell
bun install
bun run build
bun run start -- --host 0.0.0.0
```

Open <http://localhost:8080> on the server, or `http://<server-ip>:8080` from any other computer on the same LAN.

Default login: create the first admin user through Studio (`app_users` table) OR let the app seed one on first launch if configured. Follow the on-screen prompts.

---

## 7. Daily use

Every time you want to run the app:

1. Start Docker Desktop, wait for the whale to steady.
2. In PowerShell:
   ```powershell
   cd $HOME\Desktop\supabase-selfhost\docker
   docker compose up -d
   cd $HOME\Desktop\missy
   bun run start -- --host 0.0.0.0
   ```
3. Open <http://localhost:8080>.

To stop: `Ctrl+C` the app, then `docker compose down` in the supabase folder.

---

## Troubleshooting

**Port 8000 / 5432 / 8080 already in use**
Another program is bound to that port. Either close it, or change the mapping in `supabase-selfhost/docker/docker-compose.yml` (e.g. `"8001:8000"`) and update `SUPABASE_URL` / `VITE_SUPABASE_URL` to match.

**Docker Desktop won't start on Windows**
Enable virtualization in BIOS (Intel VT-x / AMD-V). Ensure WSL2 is installed: `wsl --install` in an admin PowerShell, then reboot.

**Migration errors ("relation already exists" / "role does not exist")**
The database isn't empty or is missing base Supabase roles. Reset it:
```powershell
cd $HOME\Desktop\supabase-selfhost\docker
docker compose down -v
docker compose up -d
```
Wait 60 seconds, then re-run the migration loop from step 4. `-v` wipes the DB volume — you lose all data.

**"Missing Supabase environment variable" when starting the app**
`.env` is missing a value or the file isn't in the project root. Re-check step 5. Restart `bun run start` after any `.env` change.

**LAN clients can't reach the app or the DB**
On the server PC, allow inbound TCP on ports **8080** (app) and **8000** (Supabase API) in Windows Defender Firewall. Both computers must be on the same subnet.

**"Invalid JWT" / "JWSInvalidSignature" on login**
`ANON_KEY` / `SERVICE_ROLE_KEY` in the app's `.env` were generated from a **different** `JWT_SECRET` than what's now in the Supabase `.env`. Regenerate the keys from the current secret and update both places.

---

## macOS

Same as Windows, with:
- Install Docker Desktop for Mac (Apple Silicon or Intel build to match your CPU).
- Install Bun: `curl -fsSL https://bun.sh/install | bash`
- Use Terminal instead of PowerShell. The migration loop becomes:
  ```bash
  for f in supabase/migrations/*.sql; do
    echo "Applying $f"
    docker exec -i supabase-db psql -U postgres -d postgres < "$f"
  done
  ```
- Find LAN IP: `ipconfig getifaddr en0`

## Linux

- Install Docker Engine + docker compose plugin from your distro (`apt install docker.io docker-compose-plugin` on Debian/Ubuntu). Add your user to the `docker` group and re-login.
- Install Bun: `curl -fsSL https://bun.sh/install | bash`
- Same migration loop as macOS.
- Find LAN IP: `hostname -I`

---

## Appendix A — Preparing on a connected PC, running on an air-gapped one

On the **connected** PC, after step 3's `docker compose pull` succeeds:

```powershell
# Save all Supabase images to a single tarball
docker save $(docker compose -f $HOME\Desktop\supabase-selfhost\docker\docker-compose.yml config --images) -o supabase-images.tar

# Cache all npm packages
cd $HOME\Desktop\missy
bun install   # populates node_modules
```

Copy to the offline PC (USB drive):
- `supabase-selfhost\` (whole folder, including its `.env`)
- `supabase-images.tar`
- `missy\` (whole project, including `node_modules` and `.env`)
- Docker Desktop installer, Bun installer

On the **offline** PC:
1. Install Docker Desktop and Bun from the copied installers.
2. Load images: `docker load -i supabase-images.tar`
3. `cd supabase-selfhost\docker && docker compose up -d` (no pull needed).
4. Apply migrations (step 4).
5. `cd ..\..\missy && bun run build && bun run start -- --host 0.0.0.0`

From this point on, the machine never touches the internet.

---

## Summary

- All Supabase URLs and keys are read from `.env` only — the same build works against cloud or local.
- The complete database (tables, RLS, functions, triggers, storage bucket) is in `supabase/migrations/*.sql`, ordered, replayable on any empty Postgres.
- No edge functions, no cron, no cloud-only features.
- Setup needs internet once (Docker images + npm packages). After that: fully offline, including LAN multi-user use.
