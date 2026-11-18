from typing import Optional, Dict, Any, List
from fastapi import Header, HTTPException, Depends, status
from app.services.firebase_service import firebase_service
from app.config import settings


async def get_current_user(authorization: Optional[str] = Header(None)) -> Dict[str, Any]:
    """
    Authenticates requests using Firebase ID token.
    Never trusts client-supplied college_id or role!
    Derives identity and tenant from server-side profile.
    """
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Missing or malformed Authorization header with Bearer token."
        )

    token = authorization.split("Bearer ")[1].strip()
    decoded = firebase_service.verify_token(token)
    if not decoded:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid, expired, or untrusted Firebase token."
        )

    user_id = decoded.get("uid") or decoded.get("user_id")
    profile = firebase_service.get_doc("profiles", user_id)

    if not profile:
        # Fallback profile if just verified via dev auth
        profile = {
            "id": user_id,
            "college_id": decoded.get("college_id", "col_bpit"),
            "role": decoded.get("role", "student"),
            "email": decoded.get("email", ""),
            "full_name": decoded.get("name", "Student User"),
            "pseudonym": "Student User"
        }

    return profile


def require_roles(allowed_roles: List[str]):
    async def role_checker(user: Dict[str, Any] = Depends(get_current_user)) -> Dict[str, Any]:
        user_role = user.get("role")
        if user_role not in allowed_roles:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Access denied. Requires one of roles: {allowed_roles}. Current role: {user_role}."
            )
        return user
    return role_checker


require_student = require_roles(["student", "rep", "admin", "superadmin"])
require_rep = require_roles(["rep", "admin", "superadmin"])
require_admin = require_roles(["admin", "superadmin"])
require_superadmin = require_roles(["superadmin"])

