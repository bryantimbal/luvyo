# LUVYO backend: Supabase + hosted server

The LUVYO server (`server/`) runs the route planner, fare engine, community verification and
admin portal. With a database it stores everything in **PostgreSQL**. **Supabase** provides the
database and sign-in, and a host such as **Render** runs the server.

```
Android app / website ──HTTPS──▶ LUVYO server (Render) ──▶ Supabase PostgreSQL + PostGIS
          │                            │  /api/*  /admin/
          └──── sign-in (email) ──────▶ Supabase Auth  ◀── verifies tokens
```

| Without `DATABASE_URL` | With `DATABASE_URL` |
|---|---|
| Data in `data/runtime/dataset.json` (one computer) | Data in PostgreSQL (`supabase/migrations`) |
| Contributors identified by device (demo only) | Contributors must sign in (Supabase Auth): no fake votes |
| Good for local testing | Production |

How it works: on start-up the server loads the whole dataset into memory, because the route planner
needs it there. Every change (admin edits, rider reports, confirmations, points, issue reports, audit
log) is written to the database in one transaction before the request is answered. Readable ids such
as `mrt3` are kept next to the UUID primary keys.

---

## 1. Create the Supabase project

1. Sign up at **supabase.com**, then click **New project**.
   - **Name:** `luvyo`. **Region:** **Southeast Asia (Singapore)**.
   - Choose a strong **database password** and save it in your password manager.
2. When the project is ready, collect these values. Keep them private; the anon key is the only one
   that's safe to make public.
   - **Project Settings → API:** the **Project URL** (`https://<ref>.supabase.co`), the **anon public**
     key, and the **service_role** key (secret: server only, never in the app).
   - **Connect** (top bar) → **Session pooler** → the **URI**, which looks like
     `postgresql://postgres.<ref>:[YOUR-PASSWORD]@aws-0-ap-southeast-1.pooler.supabase.com:5432/postgres`.
     Put your database password in it. Use the *pooler* address: hosts like Render can't reach
     Supabase's direct (IPv6-only) address.
3. **Authentication → Sign In / Providers → Email:** turn it **on**. While testing, you can turn
   **Confirm email** off so testers can sign in immediately. Turn it back on before launch.

## 2. Create the tables and load the data (from your computer)

In Command Prompt, inside your `luvyo` folder:

```bat
git pull
```

```bat
npm ci
```

Set the connection string for this window. Keep the quotes, and use your real URI:

```bat
set "DATABASE_URL=postgresql://postgres.<ref>:YOUR-PASSWORD@aws-0-ap-southeast-1.pooler.supabase.com:5432/postgres"
```

Create all tables, security rules and functions. This is safe to re-run; it applies only new migrations:

```bat
npm run db:migrate
```

Load the transport data (routes, stops, fares, places, settings):

```bat
npm run db:seed
```

`db:seed` loads `data/dev/dataset.json` by default. When you have verified data, pass your own file:
`npm run db:seed -- path\to\dataset.json`. In Supabase → **Table Editor** you should now see
`transport_routes`, `transport_stops`, `fare_schedules` and the rest.

## 3. Deploy the server on Render

1. Sign up at **render.com** with your GitHub account and allow it access to **ninjatechph/luvyo**.
2. **New → Blueprint** → choose **ninjatechph/luvyo**. Render reads `render.yaml` and asks for:

   | Variable | Value |
   |---|---|
   | `DATABASE_URL` | The Session pooler URI from step 1 |
   | `SUPABASE_URL` | `https://<ref>.supabase.co` |
   | `SUPABASE_ANON_KEY` | The anon public key |
   | `SUPABASE_SERVICE_ROLE_KEY` | The service_role key |
   | `ADMIN_TOKENS` | `<long-random-token>:superadmin:Bryan`. Use a new token, not the one you used locally |
   | `ANTHROPIC_API_KEY` | Optional. Lets Claude read uploaded LTFRB resolutions (see [RESOLUTIONS.md](RESOLUTIONS.md)). Leave empty to use OCR |

   Render builds the server from the `Dockerfile`, which also installs the PDF and OCR tools used by
   the resolution importer.

   `CORS_ORIGIN` is pre-filled with `https://localhost` (the Android app) and
   `https://ninjatechph.github.io` (the website).
3. Click **Apply**. After the build, the service address looks like `https://luvyo-api.onrender.com`.
4. Check it: open `https://luvyo-api.onrender.com/api/health`. It should say `"storage":"postgres"`.
   The admin portal is at `https://luvyo-api.onrender.com/admin/`.

Free-plan notes: Render's free service **sleeps after 15 minutes idle**, so the first request then
takes about a minute; the **Starter** plan stays awake. Supabase's free project **pauses after a week
without activity** (resume it from the dashboard); the **Pro** plan doesn't.

Other hosts: the `Dockerfile` runs the same server on Fly.io, Railway, Google Cloud Run and similar,
with the same environment variables.

## 4. Point the apps at your server

**Android app (built by GitHub Actions):**
1. GitHub → **ninjatechph/luvyo → Settings → Secrets and variables → Actions → Variables → New
   repository variable**: name `LUVYO_API_BASE`, value `https://luvyo-api.onrender.com`.
2. Push any change to `main`, or open **Actions → Android build → Run workflow**. The new APK, at the
   same download link as before, now uses your server: real accounts and shared community data, and
   no demo banner.

**Android app (built on your computer):**

```bat
set "LUVYO_API_BASE=https://luvyo-api.onrender.com"
```

```bat
npm run android:apk
```

**Website (GitHub Pages):** it stays the standalone demo unless you deploy a connected build:

```bat
set "LUVYO_API_BASE=https://luvyo-api.onrender.com"
```

```bat
npm run deploy:pages
```

If you put the app on another domain, add that origin to `CORS_ORIGIN` on Render.

## 5. Day-to-day

- **Edit data:** use the admin portal on the server (`/admin/`). Changes save to Supabase and apply
  immediately.
- **Moderate:** use the Community queue and Issue reports in the admin portal.
- **Back up:** Supabase **Database → Backups** (daily on paid plans). On the free plan, export
  regularly with `pg_dump`.
- **Schema changes:** add a new `supabase/migrations/000N_*.sql`, then run `npm run db:migrate`
  against Supabase before deploying the server version that needs it.

## 6. Run the server on your computer against Supabase (optional)

```bat
set "DATABASE_URL=...session pooler URI..."
```

```bat
set "SUPABASE_URL=https://<ref>.supabase.co"
```

```bat
set "SUPABASE_ANON_KEY=..."
```

```bat
set "ADMIN_TOKENS=my-local-token:superadmin:Bryan"
```

```bat
npm start
```

The startup line ends with `storage: PostgreSQL`.

## Known limits (next steps)

- **Run one server instance.** Data is held in memory, so two instances would not see each other's
  changes. One instance comfortably serves early usage; scaling out needs a change-notification step
  (Postgres LISTEN/NOTIFY).
- **Google sign-in inside the Android app** needs a deep-link return URL; email and password work
  today. Google works on the website.
- **Report photos** are stored in the database; move them to Supabase Storage when volume grows.
- **Push notifications (FCM)** are not wired yet (see `docs/NOTIFICATIONS.md`).

## Troubleshooting

| Problem | Fix |
|---|---|
| `db:migrate` says *No auth schema* | You're pointing at a plain Postgres, not Supabase. Use the Supabase URI (for local Postgres only, add `--auth-stub`) |
| `ENOTFOUND` / timeouts connecting from Render | Use the **Session pooler** URI, not the direct `db.<ref>.supabase.co` address |
| `password authentication failed` | Re-check the password inside the URI; if it contains `@`, `#` or `/`, URL-encode them |
| App shows "Contributions need sign-in, which is not configured" | Set `SUPABASE_URL` and `SUPABASE_ANON_KEY` on the server |
| App can't reach the server (network error) in Android | `CORS_ORIGIN` must include `https://localhost`, and `LUVYO_API_BASE` must be `https://` |
| Sign-up says "check your email" | Confirm the email, or turn **Confirm email** off while testing |
