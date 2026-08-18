"""Adapter for the existing participant registration system.

The existing system exposes an HTTP API. We treat it as read-only source of truth for
participants: sync pulls records and upserts them locally, keyed by ``external_id``.

Everything about the remote system is config-driven (see ``app/config.py``):

- ``LLM_EXTERNAL_API_BASE_URL``  base URL, e.g. https://registry.example.org/api
- ``LLM_EXTERNAL_API_TOKEN``     bearer token
- ``LLM_EXTERNAL_API_PARTICIPANTS_PATH``  full snapshot endpoint (default ``/participants``)
- ``LLM_EXTERNAL_API_DELTA_PATH``  optional incremental endpoint; if set, it is called with
  ``?updated_since=<ISO timestamp>`` and only updated records are returned
- ``LLM_EXTERNAL_API_FIELD_MAP`` JSON field mapping from their record -> ours
  (``id``, ``name``, ``id_number``, ``phone``, ``group``)
"""

from __future__ import annotations

from datetime import datetime

import httpx

from ..config import Settings

DEFAULT_SYNC_HEADER = "Authorization"


class ExternalApiError(Exception):
    pass


def guess_field_map(sample: dict) -> dict:
    """Best-effort mapping from an unknown record to our field names."""
    keys = {k.lower().replace(" ", "").replace("_", "").replace("-", ""): k for k in sample.keys()}
    mapping = {}
    aliases = {
        "id": "id",
        "idnumber": "id_number",
        "nationalid": "id_number",
        "participantid": "id_number",
        "name": "name",
        "fullname": "name",
        "participantname": "name",
        "phone": "phone",
        "phonenumber": "phone",
        "mobile": "phone",
        "group": "group",
        "bus": "group",
        "busgroup": "group",
    }
    for alias, ours in aliases.items():
        if alias in keys and ours not in mapping.values():
            mapping[keys[alias]] = ours
    return mapping


class ExternalAdapter:
    def __init__(self, settings: Settings):
        self.settings = settings
        self.base_url = settings.external_api_base_url.rstrip("/")
        self.field_map = settings.external_field_map

    @property
    def enabled(self) -> bool:
        return bool(self.settings.external_api_base_url and self.settings.external_sync_enabled)

    def _headers(self) -> dict:
        headers = {"Accept": "application/json"}
        if self.settings.external_api_token:
            headers["Authorization"] = f"Bearer {self.settings.external_api_token}"
        return headers

    async def fetch_participants(self, since: datetime | None = None) -> list[dict]:
        """Fetch raw participant records from the existing system."""
        if not self.enabled:
            raise ExternalApiError("External sync not configured (LLM_EXTERNAL_API_BASE_URL / LLM_EXTERNAL_SYNC_ENABLED)")
        path = self.settings.external_api_participants_path
        params = None
        if since is not None and self.settings.external_api_delta_path:
            path = self.settings.external_api_delta_path
            params = {"updated_since": since.isoformat()}
        url = f"{self.base_url}{path}"
        timeout = self.settings.external_sync_timeout_seconds
        try:
            async with httpx.AsyncClient(timeout=timeout) as client:
                resp = await client.get(url, headers=self._headers(), params=params)
                resp.raise_for_status()
                data = resp.json()
        except (httpx.HTTPError, ValueError) as exc:
            raise ExternalApiError(f"External API request failed: {exc}") from exc
        if isinstance(data, dict) and "data" in data:
            data = data["data"]
        if isinstance(data, dict) and "participants" in data:
            data = data["participants"]
        if not isinstance(data, list):
            raise ExternalApiError("External API returned an unexpected shape (expected a list)")
        return data

    def map_participant(self, raw: dict) -> dict | None:
        """Map one external record to our participant fields. Returns None if unusable."""
        out = {}
        for their_field, our_field in self.field_map.items():
            if their_field in raw:
                out[our_field] = raw[their_field]
        external_id = out.get("id")
        if external_id is None:
            external_id = raw.get("externalId") or raw.get("external_id")
        name = str(out.get("name", "")).strip()
        id_number = str(out.get("id_number", "")).strip()
        if not name or not external_id:
            return None
        return {
            "external_id": str(external_id),
            "name": name,
            "id_number": id_number,
            "phone": str(out.get("phone", "") or "").strip(),
            "group": str(out.get("group", "") or "").strip(),
        }

    async def dry_run(self) -> tuple[bool, list[dict], dict]:
        """Call the external API and report raw records + a guessed field map (no writes)."""
        try:
            records = await self.fetch_participants()
        except ExternalApiError as exc:
            return False, [], {"error": str(exc)}
        sample = records[:5]
        guess = guess_field_map(sample[0]) if sample else {}
        return True, sample, guess