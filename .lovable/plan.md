# Offline SQLite rebuild — no Docker, one command, LAN-ready

## The one decision I need from you first

This app currently talks to Postgres **from the browser** (17 files call the Supabase client directly), and the database itself does a lot of the work: 11 stored triggers post accounting journal entries, auto-generate receipt/PO numbers, and adjust stock. SQLite has none of that.

So this is not a connection-string swap. It is a backend rebuild:

- every screen's data access moves from browser -> server API
- all accounting/stock/receipt-number logic moves from SQL triggers into TypeScript
- live cross-device updates move from Postgres realtime to polling/SSE

Second, equally important: **better-sqlite3 cannot run in the Lovable preview.** The Lovable preview runs on a Cloudflare Workers-style runtime with no native modules and no filesystem. Once the app runs on SQLite it becomes a Node-only app that runs on your iMac — the in-editor preview and the published lovable.app URL will no longer work. That is fine if the iMac is the only place it ever runs; it is not fine if you still demo from the cloud URL.

Confirm you accept losing the cloud preview, and I'll proceed.

## What changes in the project structure

```text
data/
  missy.db                  <- the whole database, one file
  backups/missy-2026-07-29T10-00-00.db
server/
  db.ts                     <- better-sqlite3 connection, WAL mode
  schema.sql                <- SQLite schema (tables + indexes)
  migrate.ts                <- runs schema on first boot, idempotent
  domain/                   <- former SQL triggers, now TS
    sales.ts  purchases.ts  expenses.ts  journal.ts  numbering.ts
  backup.ts                 <- 7-day timer, manual backup, restore
  api.ts                    <- HTTP endpoints the frontend calls
scripts/
  export-from-postgres.ts   <- one-time data migration
  start.mjs                 <- single entry: build if needed, serve on 0.0.0.0
uploads/product-images/     <- replaces the storage bucket
```

Removed: `@supabase/supabase-js`, `src/integrations/supabase/*`, `supabase/`, all RLS/GRANT concerns, Docker, Supabase CLI.

## Startup flow after the change

`npm start` -> `scripts/start.mjs`:

1. ensure `data/` exists, open `data/missy.db` (created on first run)
2. run `server/migrate.ts` (idempotent, safe every boot)
3. start the 7-day backup timer
4. serve the built app on `0.0.0.0:8080`

No Docker, no daemon, no second terminal. Other devices use `http://<imac-ip>:8080`.

## Postgres-specific things in your schema that must be handled

| Current | Why it breaks | Replacement |
| --- | --- | --- |
| `gen_random_uuid()` defaults | pgcrypto only | `crypto.randomUUID()` in TS |
| `account_type` enum | no enums in SQLite | `TEXT` + CHECK constraint |
| 11 plpgsql triggers (journal posting, COGS, stock in/out, journal delete-by-source) | no plpgsql | TypeScript service functions inside one transaction per operation |
| `acct(code)` SQL function | no plpgsql | TS lookup helper |
| receipt/PO number defaults using `to_char`/`lpad`/`random()` | no such functions | `numbering.ts` |
| `numeric` money columns | SQLite has no exact decimal | store **integer minor units** (cents) — this is the one change that touches display code, and I'll keep every rendered figure identical |
| `date` / `timestamptz` | no date types | ISO-8601 `TEXT`, existing formatting unchanged |
| RLS policies + GRANTs | no RLS | app-level auth (your `app_users`/`app_sessions` login already does this) |
| `pgcrypto` SHA-256 password hashing | no pgcrypto | Node `crypto` scrypt; existing hashes re-verified on first login, no password resets |
| Supabase realtime publication | not available | server broadcasts changes over SSE; the existing query-invalidation layer subscribes to that instead |
| `product-images` storage bucket | not available | `uploads/product-images/` served statically |
| `ARRAY` permissions column on `app_users` | no arrays | JSON text column |

## Data migration (one-time)

`npm run migrate:from-postgres` — point it at your running Postgres once, and it:

1. reads every table in dependency order
2. converts uuids, enums, arrays, numerics (-> cents), dates
3. writes into a fresh `data/missy.db` inside one transaction
4. prints per-table row counts for you to eyeball, and refuses to overwrite a non-empty db without `--force`

Journal entries are copied as-is rather than recomputed, so historical books stay exactly as they are today.

## Backups

- **Automatic:** every 7 days (and once on startup if the last backup is older than 7 days) — SQLite online backup API, so it is safe while the app is in use. Written to `data/backups/missy-<timestamp>.db`. Keeps the last 10, prunes older.
- **Backup Now:** button in Settings, same code path, toasts the file name.
- **Restore:** button in Settings, lists available backups with date + size, requires typing a confirmation before it runs. It snapshots the current db first (`pre-restore-<timestamp>.db`), swaps the file, and asks all connected devices to reload.

UI stays exactly as it is elsewhere; the only new controls are these three, placed in the existing Settings danger-zone area.

## Order of work

1. **Database swap** — schema, connection, domain services replacing triggers, server API, rewire all 17 screens. Largest step by far.
2. **Startup script** — `npm start`, auto-migrate on boot.
3. **Network binding** — `0.0.0.0`, LAN notes in `SETUP_MAC.md`.
4. **Backup/restore** — timer, endpoints, three Settings controls.

## Honest caveat

Step 1 rewrites the data layer of every page in the app. The UI will look identical, but this is a large change and it needs testing against a copy of your real data before you switch the iMac over. I'd recommend running the migration into a copy first and comparing a few reports (trial balance, stock levels, a day's sales) before retiring Postgres.
