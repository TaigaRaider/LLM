# Deploying LLM (backend + frontend)

Two hosts, both free tiers:

- **Backend** (FastAPI + Postgres) → [Render](https://render.com)
- **Frontend** (prototype + registration app) → [Vercel](https://vercel.com)

## 1. Backend on Render

The live backend is at **https://llm-backend-3hy2.onrender.com** (`/api/health`
returns `{"status": "ok"}`). It is a free-tier Python web service (region
`oregon`, Python 3.12) with a free managed Postgres `llm-db`
(`dpg-da30uaibkg8c73d8f260-a`, database name `llm_vxy3`).

> The original Blueprint was deleted (its initial sync failed and left
> `LLM_DATABASE_URL` as a placeholder, which crashed every deploy). The resources
> are now managed directly in the Render dashboard / API, so changes to
> `render.yaml` do **not** auto-apply. `render.yaml` is kept as documentation of
> the intended setup.

Key env vars on the service (set via the Render dashboard / API, not in the repo):

- `LLM_JWT_SECRET` — generated value
- `LLM_DATABASE_URL` — the real internal Postgres connection string
  (`postgresql://llm:…@dpg-da30uaibkg8c73d8f260-a/llm_vxy3`)
- `LLM_DEFAULT_OFFICER_PASSWORD` — `officer123` (only used at seed time)
- `LLM_EXTERNAL_SYNC_ENABLED` — `false` (external participant sync off)

Deploys run automatically from `main` (auto-deploy on commit). Free services
spin down after ~15 min idle — the first request after that takes ~1 min.

If you ever need to recreate from scratch: create a new Blueprint from
`render.yaml` or create the web service + Postgres directly and set the env vars
above manually.

Officer accounts are seeded on startup (tables auto-create + re-seed if empty).
**Passwords were rotated after launch** — they are no longer `officer123` (see the
last person who set them / the notes in this repo's git history). Rotate them
again in the app under Dashboard → Officers if you need fresh ones.

### Postgres notes

- Data survives redeploys/restarts. Free Postgres databases are deleted after
  ~30 days of inactivity.
- If you ever switch the database (or lose it), the app auto-creates tables and
  re-seeds officers on startup — bags/participants would be empty again.

## 2. Frontend on Vercel

The prototype is at `prototype/` (Vite + React). The build also compiles the
registration app into `public/registration/` (`prebuild` script), so
`https://<your-app>.vercel.app/registration/` serves it too.

1. In Vercel: **Add New → Project** → import the GitHub repo.
2. Project settings:
   - **Root Directory**: `prototype`
   - Framework preset: **Vite**
   - Build command: leave default (`npm run build`)
   - Output directory: `dist`
3. Deploy. The production API base is read from `prototype/.env.production`
   (`VITE_API_BASE`), which currently points at
   `https://llm-backend-3hy2.onrender.com/api`.
4. Verify: open the site → sign in with the current officer credentials.

The live frontend is at **https://luggagelogisticsmanager.vercel.app**
(`/registration/` serves the registration app). The Vercel project is
`luggage_logistics_manager` (root directory `prototype`, framework Vite, linked
to this repo's `main`), so pushes redeploy automatically.

Security note: the registration app (`/registration/`) is deployed publicly but
requires a Logistics Manager login — that's the intended gate.

## 3. Local development (unchanged)

```bash
# backend
cd backend
python -m uvicorn app.main:app --port 8000

# frontend (vite proxies /api -> localhost:8000)
cd prototype
npm run dev
```