# Missy’s Auto Wares — Local Setup

Run the app locally on your MacBook.

## Requirements

- macOS
- [Homebrew](https://brew.sh) (recommended)
- Node.js runtime: **Bun** (preferred) or Node 20+

## Database

This project uses **PostgreSQL** through Lovable Cloud / Supabase.

- **Type:** PostgreSQL 15+ (relational, row-level security enabled)
- **Why Postgres:** works offline with the local dev server, handles sales/inventory/customers reliably, and scales from a single MacBook to production.
- **Local dev:** the frontend talks to the cloud backend by default; no local Postgres install required.
- **If you want a local copy** (backup/testing): install Postgres via Homebrew (`brew install postgresql`), or use the [Supabase CLI](https://supabase.com/docs/guides/cli) for a local Supabase stack.

## Run the app

```bash
# 1. Clone the repo
git clone <repo-url>
cd missys-auto-wares

# 2. Install dependencies
bun install

# 3. Start the local dev server
bun run dev
```

The app opens at `http://localhost:8080`.

## Environment notes

- Supabase credentials are already configured for Lovable Cloud.
- For fully offline development, run a local Supabase stack and point the app to it.
