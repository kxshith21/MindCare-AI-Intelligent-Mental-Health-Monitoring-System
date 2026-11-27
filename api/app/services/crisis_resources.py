"""Region-keyed crisis resources appended to elevated/high chat responses.

Every entry has a ``last_verified`` date. Numbers and URLs can change — re-verify
all of them before launch. Unknown or missing regions always get the DEFAULT
list, which is never empty.
"""

from __future__ import annotations

from dataclasses import asdict, dataclass

# RE-VERIFY BEFORE LAUNCH. These were checked from public sources on 2026-11-27
# but are not a live service and may be out of date or region-incomplete.
LAST_VERIFIED = "2026-11-27"


@dataclass(frozen=True)
class CrisisResource:
    name: str
    contact: str
    detail: str
    last_verified: str = LAST_VERIFIED


_DEFAULT_RESOURCES: tuple[CrisisResource, ...] = (
    CrisisResource(
        name="Find a Helpline",
        contact="findahelpline.com",
        detail="Find free, confidential support services in your country.",
    ),
    CrisisResource(
        name="Local emergency services",
        contact="your local emergency number",
        detail="If you may hurt yourself or someone else, contact local emergency services now.",
    ),
)

_RESOURCES: dict[str, tuple[CrisisResource, ...]] = {
    "IN": (
        CrisisResource(
            name="Tele-MANAS",
            contact="14416 / 1-800-891-4416",
            detail="India's national 24x7 tele-mental-health helpline.",
        ),
        CrisisResource(
            name="India emergency services",
            contact="112",
            detail="National emergency number for immediate danger.",
        ),
        CrisisResource(
            name="Find a Helpline - India",
            contact="findahelpline.com/in",
            detail="Additional India-specific support services.",
        ),
    ),
    "US": (
        CrisisResource(
            name="988 Suicide & Crisis Lifeline",
            contact="988",
            detail="Free, confidential support 24x7 in the United States.",
        ),
        CrisisResource(
            name="Emergency services",
            contact="911",
            detail="Call for immediate danger.",
        ),
    ),
    "GB": (
        CrisisResource(
            name="Samaritans",
            contact="116 123",
            detail="Free, confidential support 24x7 in the UK.",
        ),
        CrisisResource(
            name="Emergency services",
            contact="999 / 112",
            detail="Call for immediate danger.",
        ),
    ),
    "CA": (
        CrisisResource(
            name="9-8-8 Suicide Crisis Helpline",
            contact="988",
            detail="Free, confidential support 24x7 in Canada.",
        ),
        CrisisResource(
            name="Emergency services",
            contact="911",
            detail="Call for immediate danger.",
        ),
    ),
    "AU": (
        CrisisResource(
            name="Lifeline",
            contact="13 11 14",
            detail="Free, confidential support 24x7 in Australia.",
        ),
        CrisisResource(
            name="Emergency services",
            contact="000",
            detail="Call for immediate danger.",
        ),
    ),
}


def get_crisis_resources(region: str | None) -> list[dict[str, str]]:
    """Return resources for an ISO alpha-2 region, never an empty list."""
    key = (region or "").strip().upper()
    resources = _RESOURCES.get(key, _DEFAULT_RESOURCES)
    return [asdict(resource) for resource in resources]
