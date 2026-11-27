"""Auth request/response schemas."""

from pydantic import BaseModel, Field

# Deliberately not EmailStr: that would pull in the email-validator dependency
# for a check Supabase Auth performs again server-side anyway.
_EMAIL_PATTERN = r"^[^@\s]+@[^@\s]+\.[^@\s]+$"


class PsychologistSignupRequest(BaseModel):
    """Psychologist application payload.

    There is NO role field here by design — the role is always assigned
    server-side (app_metadata.role = 'psychologist'), never by the client.
    """

    email: str = Field(min_length=5, max_length=254, pattern=_EMAIL_PATTERN)
    password: str = Field(min_length=8, max_length=128)
    display_name: str = Field(min_length=1, max_length=120)
    license_no: str = Field(min_length=1, max_length=64)
    region: str | None = Field(default=None, max_length=2)


class PsychologistSignupResponse(BaseModel):
    user_id: str
    email: str
    role: str = "psychologist"
    verified: bool = False
