"""Auth endpoints that must run server-side (service role).

POST /auth/psychologist-signup is the ONLY way the 'psychologist' role is
ever assigned: it calls the Supabase Admin API with the service role key and
sets app_metadata.role = 'psychologist'. Patient signups go through the
standard Supabase signup from /web and always become 'patient' (the
handle_new_user trigger reads app_metadata, which clients cannot write).
"""

from fastapi import APIRouter, HTTPException

from app.core.config import get_settings
from app.schemas.auth import PsychologistSignupRequest, PsychologistSignupResponse
from app.services.supabase_admin import AdminApiError, admin_create_user

router = APIRouter(prefix="/auth", tags=["auth"])


@router.post(
    "/psychologist-signup",
    response_model=PsychologistSignupResponse,
    status_code=201,
)
async def psychologist_signup(payload: PsychologistSignupRequest) -> PsychologistSignupResponse:
    settings = get_settings()
    if not settings.supabase_service_role_key:
        raise HTTPException(
            status_code=503,
            detail="Psychologist signup is not configured on this server.",
        )

    user_metadata: dict = {
        "display_name": payload.display_name,
        "license_no": payload.license_no,
    }
    if payload.region:
        user_metadata["region"] = payload.region

    try:
        user = await admin_create_user(
            settings,
            email=payload.email,
            password=payload.password,
            # Server-assigned role — the request schema has no role field.
            app_metadata={"role": "psychologist"},
            user_metadata=user_metadata,
        )
    except AdminApiError as exc:
        if exc.status_code == 409:
            raise HTTPException(
                status_code=409, detail="An account with that email already exists."
            ) from exc
        if exc.status_code == 503:
            raise HTTPException(
                status_code=503,
                detail="Psychologist signup is not configured on this server.",
            ) from exc
        raise HTTPException(
            status_code=502, detail="Could not create the account. Please try again."
        ) from exc

    user_id = str(user.get("id", ""))
    if not user_id:
        raise HTTPException(
            status_code=502, detail="Could not create the account. Please try again."
        )

    # psychologist_profiles (verified = false, submitted license_no) is created
    # by the handle_new_user trigger from app_metadata/user_metadata.
    return PsychologistSignupResponse(
        user_id=user_id,
        email=str(user.get("email", payload.email)),
        role="psychologist",
        verified=False,
    )
