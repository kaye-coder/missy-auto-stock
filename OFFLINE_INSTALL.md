# Missy — offline installation

Missy runs completely offline with **no Docker and no database server**. The
whole database is one file (`data/missy.db`) that the app creates and manages
itself.

## Install

1. Install Node.js LTS (22+) from https://nodejs.org
2. Copy or clone the project folder onto the computer
3. In the project folder:

```bash
npm install     # needs internet once
npm start       # starts everything
```

Open `http://localhost:8080` on the machine itself, or
`http://<that-computer-ip>:8080` from any other computer on the same network.

First sign-in: `admin` / `admin`.

## Air-gapped machines

On a machine with internet, run `npm install` inside the project, then copy the
entire folder (including `node_modules/`) to the offline machine on a USB stick.
Only `npm start` is needed there.

## Backups

Automatic every 7 days, plus **Back up now** and **Restore** in
**Settings → Backups**. Files live in `data/backups/`.

## Data locations

- `data/missy.db` — all shop data
- `data/backups/` — backup copies
- `uploads/product-images/` — product photos

Mac users: see **SETUP_MAC.md** for the step-by-step version with firewall and
auto-start notes.
