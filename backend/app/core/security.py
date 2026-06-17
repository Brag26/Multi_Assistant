from dataclasses import dataclass
from enum import StrEnum
from typing import Annotated, Any

import httpx
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from jose import jwt
from jose.exceptions import JWTError

from app.core.config import settings

bearer = HTTPBearer(auto_error=False)

class Role(StrEnum):
    SUPER_ADMIN = "super_admin"
    TENANT_ADMIN = "tenant_admin"
    MANAGER = "manager"
    AGENT = "agent"
    VIEWER = "viewer"

ROLE_ORDER = {
    Role.VIEWER: 10,
    Role.AGENT: 20,
    Role.MANAGER: 30,
    Role.TENANT_ADMIN: 40,
    Role.SUPER_ADMIN: 50,
}

@dataclass(frozen=True)
class Principal:
    user_id: str
    email: str | None
    tenant_id: str | None
    role: Role
    claims: dict[str, Any]

_jwks_cache: dict[str, Any] | None = None

async def _jwks() -> dict[str, Any]:
    global _jwks_cache
    if _jwks_cache is None:
        async with httpx.AsyncClient(timeout=5) as client:
            response = await client.get(settings.supabase_jwks_url)
            response.raise_for_status()
            _jwks_cache = response.json()
    return _jwks_cache

async def verify_supabase_jwt(credentials: Annotated[HTTPAuthorizationCredentials | None, Depends(bearer)]) -> Principal:
    if credentials is None:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Missing bearer token")

    token = credentials.credentials
    try:
        header = jwt.get_unverified_header(token)
        key = next((k for k in (await _jwks()).get("keys", []) if k.get("kid") == header.get("kid")), None)
        if not key:
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Unknown signing key")
        claims = jwt.decode(token, key, algorithms=[header.get("alg", "RS256")], audience=settings.supabase_jwt_audience)
    except JWTError as exc:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token") from exc

    metadata = claims.get("app_metadata", {}) | claims.get("user_metadata", {})
    role = Role(metadata.get("role", Role.VIEWER))
    return Principal(
        user_id=claims["sub"],
        email=claims.get("email"),
        tenant_id=metadata.get("tenant_id"),
        role=role,
        claims=claims,
    )

CurrentUser = Annotated[Principal, Depends(verify_supabase_jwt)]

def require_role(*roles: Role):
    minimum = min(ROLE_ORDER[r] for r in roles)

    async def dependency(user: CurrentUser) -> Principal:
        if ROLE_ORDER[user.role] < minimum:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Insufficient role")
        return user

    return dependency

def require_tenant_access(user: Principal, tenant_id: str) -> None:
    if user.role == Role.SUPER_ADMIN:
        return
    if user.tenant_id != tenant_id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Tenant access denied")
