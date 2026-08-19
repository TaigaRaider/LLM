"""Role-based access control.

Permissions are enforced server-side on every endpoint. The frontend uses the
same list to hide what a user cannot do, but the server is the source of truth.
"""

from functools import lru_cache

from fastapi import Depends, HTTPException

from .models import Officer
from .schemas import OfficerOut
from .security import current_officer

PERMISSIONS: dict[str, set[str]] = {
    "Check-in Officer": {"check_in", "remove_bag", "load", "lookup", "reports"},
    "Handover Officer": {"handover", "unload", "lookup", "reports"},
    "Logistics Manager": {"*"},  # everything
}

ALL_PERMISSIONS = {
    "check_in",
    "remove_bag",
    "load",
    "handover",
    "unload",
    "lookup",
    "reports",
    "admin",
}


@lru_cache
def permissions_for(role: str) -> frozenset[str]:
    perms = PERMISSIONS.get(role, set())
    if "*" in perms:
        return frozenset(ALL_PERMISSIONS)
    return frozenset(perms)


def has_permission(officer: Officer, permission: str) -> bool:
    return permission in permissions_for(officer.role)


def officer_out(officer: Officer) -> OfficerOut:
    out = OfficerOut.model_validate(officer)
    out.permissions = sorted(permissions_for(officer.role))
    return out


def require_perms(*permissions: str):
    """Dependency factory: `Depends(require_perms("admin"))`."""

    def dep(officer: Officer = Depends(current_officer)) -> Officer:
        if not any(has_permission(officer, p) for p in permissions):
            raise HTTPException(status_code=403, detail=f"Permission denied — {officer.role} role cannot do this")
        return officer

    return dep