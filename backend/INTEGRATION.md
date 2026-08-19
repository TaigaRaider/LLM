# Connecting to the Existing Participant System

The LLM app reads participants from the existing registration system and keeps
a local copy. It is **read-only** by default: the existing system stays the
source of truth for participant data; this app only adds the bag/vehicle
operations on top.

## How it works

1. **Config-driven adapter** — every URL, token and field name is set via env
   vars (`LLM_*`), see `app/config.py`. Nothing is hardcoded.
2. **Polling** — the backend polls the external API on a timer
   (`LLM_EXTERNAL_SYNC_INTERVAL_SECONDS`, default 30 s). A full **snapshot**
   endpoint is required; an optional **delta** endpoint (`?updated_since=…`)
   makes later polls cheaper.
3. **Upsert keyed by external `id`** — records are matched by their external id.
   If an external record's **ID number** matches a locally-created participant,
   that participant is *adopted* (marked `source=external`) instead of
   duplicated.
4. **Soft delete** — in snapshot mode, external participants that disappear
   from the remote list are deactivated locally (never hard-deleted).

## Env vars (backend/.env)

| Variable | Purpose | Example |
|---|---|---|
| `LLM_EXTERNAL_API_BASE_URL` | Base URL of the existing system's API | `https://registry.example.org/api` |
| `LLM_EXTERNAL_API_TOKEN` | Optional bearer token | `secret-token` |
| `LLM_EXTERNAL_API_PARTICIPANTS_PATH` | Full snapshot endpoint | `/participants` |
| `LLM_EXTERNAL_API_DELTA_PATH` | Optional incremental endpoint | `/participants/updated` |
| `LLM_EXTERNAL_API_FIELD_MAP` | JSON field map, **their field → our field** | see below |
| `LLM_EXTERNAL_SYNC_ENABLED` | Turns on the background poller | `true` |
| `LLM_EXTERNAL_SYNC_INTERVAL_SECONDS` | Poll interval | `30` |
| `LLM_EXTERNAL_SYNC_TIMEOUT_SECONDS` | Request timeout | `15` |

Field map maps **their field names → our field names** (`id`, `name`,
`id_number`, `phone`, `group`). Example for the mock server:

```json
{"id": "id", "name": "name", "nationalId": "id_number", "phone": "phone", "bus": "group"}
```

`id` and `name` are required; the others are optional.

## Trying it locally (mock external system)

```bash
cd backend

# terminal 1 — the mock of the existing registration system
python -m uvicorn tools.mock_external:app --port 8090

# terminal 2 — the LLM backend, pointing at the mock
$env:LLM_EXTERNAL_API_BASE_URL = "http://localhost:8090/api"
$env:LLM_EXTERNAL_API_PARTICIPANTS_PATH = "/participants"
$env:LLM_EXTERNAL_API_DELTA_PATH = "/participants/updated"
$env:LLM_EXTERNAL_API_FIELD_MAP = '{"id":"id","name":"name","nationalId":"id_number","phone":"phone","bus":"group"}'
$env:LLM_EXTERNAL_SYNC_ENABLED = "true"
python -m uvicorn app.main:app --port 8000
```

Then:

- `GET /api/sync/status` — shows enabled, last run, imported/soft-deleted counts
- `POST /api/sync/run` — run one sync pass immediately (admin only)
- `POST /api/sync/dry-run` — check the connection and see a guessed field map
  **without writing anything**; works even with `LLM_EXTERNAL_SYNC_ENABLED` unset
  (only the base URL is needed)
- `POST http://localhost:8090/api/participants` — add a record to the mock and
  watch the next poll import it
- `POST http://localhost:8090/api/reset` — restore the mock's default records

`tools/mock_external.py` stores its data in `tools/mock_external_data.json`.

## Going live

1. Get the API docs/auth details for the existing system (URL, auth token,
   response shape).
2. Start the backend with a dry-run config (`LLM_EXTERNAL_SYNC_ENABLED` unset),
   call `POST /api/sync/dry-run` with the admin token and inspect the guessed
   field map. Fix `LLM_EXTERNAL_API_FIELD_MAP` until names match.
3. Enable sync and watch `GET /api/sync/status` after a few polls.
4. If the external system's ID number format differs from what local check-in
   uses, that's fine — records are matched by external id, and `id_number`
   adoption only kicks in for real collisions.

## Notes / limitations

- Sync is one-way (external → local). This app never writes to the existing
  system. If write-back is needed later, it belongs in the sync adapter behind
  the same field map.
- Deactivated external participants stay in the DB (soft delete); they can be
  re-activated automatically when they reappear remotely.
- If the external API goes down, sync records the error in status and retries
  on the next interval; the rest of the app keeps working on the local copy.