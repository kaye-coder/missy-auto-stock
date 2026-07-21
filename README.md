# Missy’s Auto Wares — Local Setup

Run the app locally on your MacBook.

## Requirements

- macOS
- [Homebrew](https://brew.sh) (recommended)
- Node.js runtime: **Bun** (preferred) or Node 20+

## Database

This project uses **PostgreSQL** through a local Supabase stack.

- **Type:** PostgreSQL 15+ (relational, row-level security enabled)
- **Why Postgres:** handles sales/inventory/customers reliably and scales from a single MacBook to a local LAN.
- **Local dev:** the frontend talks to a local Supabase backend; no cloud connection is required after setup.

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

## Full offline Mac + LAN setup

For a complete step-by-step guide — including Docker, Supabase CLI, `.env` configuration, and connecting other computers on the same LAN — see **[SETUP_MAC.md](SETUP_MAC.md)**.

## Environment notes

- Supabase credentials are configured in your local `.env` file.
- For fully offline LAN use, run a local Supabase stack and point the app to it (see SETUP_MAC.md).
