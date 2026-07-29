# Missy — Mac setup (fully offline, no Docker)

The app now carries its own database. There is nothing to install besides Node.js:
the data lives in a single file, `data/missy.db`, created automatically the first
time you start the app.

## 1. Install Node.js (once)

Download the **LTS** installer from https://nodejs.org (Node 22 or newer) and run it.
Check it worked:

```bash
node -v
```

## 2. Get the project onto the Mac

```bash
git clone <repo-url>
cd missys-auto-wares
npm install
```

(`npm install` needs internet once. After that the Mac can stay offline forever.)

## 3. Start it

```bash
npm start
```

That single command starts everything: the database, the shop app and the
network server. You will see:

```
Local:   http://localhost:8080
Network: http://192.168.x.x:8080
```

Open the local address on the shop computer. **No Docker, no Supabase, no
separate database to launch.**

To sign in the first time: username `admin`, password `admin`. Change it under
**Users & Access**.

## 4. Use it from other computers on the shop network

1. On the server Mac, find its address: **System Settings → Network → Wi‑Fi → Details → TCP/IP**, e.g. `192.168.1.50`.
2. On any other computer or tablet on the same Wi‑Fi/LAN, open
   `http://192.168.1.50:8080`.
3. If nothing loads, allow incoming connections: **System Settings → Network → Firewall → Options → allow Node**.

Every computer sees the same live data, and each person signs in with their own
account. Changes appear on the other screens automatically.

## 5. Start automatically when the Mac turns on (optional)

```bash
cd ~/missys-auto-wares
npm start
```

To make this automatic, add a Login Item that runs a small script containing the
two lines above (**System Settings → General → Login Items → +**).

## 6. Backups

- The app backs itself up **every 7 days** automatically.
- **Settings → Backups** has a **Back up now** button and a **Restore** button for
  each saved copy (a safety copy is taken before any restore).
- Backups are ordinary files in `data/backups/`. Copy that folder to a USB stick
  for off-site safety.

## 7. Where your data lives

| What | Where |
| --- | --- |
| Database | `data/missy.db` |
| Backups | `data/backups/` |
| Product photos | `uploads/product-images/` |

To move the shop to a new Mac, copy the whole project folder (including `data/`
and `uploads/`), run `npm install`, then `npm start`.

## 8. Moving data from the old hosted database (once)

If you still have the old cloud database and want its records:

```bash
SUPABASE_URL="https://xxxx.supabase.co" \
SUPABASE_SERVICE_ROLE_KEY="your-service-role-key" \
npm run migrate:postgres
```

This copies products, sales, purchases, expenses, customers, suppliers, accounts,
journal entries and users into `data/missy.db`. Run it once, then work offline.

## Troubleshooting

| Problem | Fix |
| --- | --- |
| `npm start` says port 8080 is in use | `PORT=8081 npm start`, then use `:8081` in the browser |
| Other computers cannot connect | Allow Node through the firewall; confirm both machines are on the same network |
| Want a clean slate | **Settings → Danger zone → Reset all data to zero** |
| App will not start after a bad shutdown | Restore the newest file in `data/backups/` from **Settings → Backups** |
