# Deploying LLM (backend + frontend)

Two hosts, both free tiers:

- **Backend** (FastAPI + Postgres) → [Render](https://render.com)
- **Frontend** (prototype + registration app) → [Vercel](https://vercel.com)

## 1. Backend on Render

Everything is defined in `render.yaml` (web service + managed Postgres `llm-db`,
random `LLM_JWT_SECRET`, `LLM_DATABASE_URL` wired automatically).

1. Push this repo to GitHub (already done — `main`).
2. Go to https://render.com → **New +** → **Blueprint**.
3. Connect the GitHub repo (authorize the GitHub app if prompted).
4. Render proposes: web service `llm-backend` + database `llm-db` → **Apply**.
5. Wait for the deploy (build + start, a few minutes). Free services spin down
   after ~15 min idle — the first request after that takes ~1 min.
6. Verify: open `https://<your-service>.onrender.com/api/health` → `{"status": "ok"}`.
   If the name `llm-backend` is taken, Render picks another — note the URL.

Changing infra later (e.g. enabling external sync): edit `render.yaml`, push,
then on Render **Dashboard → Blueprints → your blueprint → Update** (infra
changes are not auto-applied on push).

Seeded logins: `ama` / `kofi` / `efua`, all with password `officer123` — each is
forced to change it on first login. **Change `efua`'s password immediately** after
deploying: whoever can log in as Logistics Manager controls everything.

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
   (`VITE_API_BASE`). If your Render service got a different name than
   `llm-backend`, edit that one line, commit, and Vercel redeploys.
4. Verify: open the site → sign in as `efua` / `officer123`.

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