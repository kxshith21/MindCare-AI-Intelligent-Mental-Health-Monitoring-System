"""Crisis resource mapping tests."""

from app.services.crisis_resources import LAST_VERIFIED, get_crisis_resources


def test_region_resources_are_never_empty() -> None:
    for region in ["IN", "US", "GB", "CA", "AU", "ZZ", None, ""]:
        resources = get_crisis_resources(region)
        assert resources, f"region {region!r} returned no resources"


def test_india_resources() -> None:
    resources = get_crisis_resources("IN")
    assert any("14416" in item["contact"] for item in resources)
    assert any("112" in item["contact"] for item in resources)


def test_us_resources() -> None:
    resources = get_crisis_resources("US")
    assert any(item["contact"] == "988" for item in resources)
    assert any(item["contact"] == "911" for item in resources)


def test_unknown_and_null_use_default() -> None:
    assert get_crisis_resources("ZZ") == get_crisis_resources(None)
    assert any("findahelpline.com" in item["contact"] for item in get_crisis_resources(None))


def test_every_resource_has_verification_date() -> None:
    for region in ["IN", "US", "GB", "CA", "AU", None]:
        for item in get_crisis_resources(region):
            assert item["last_verified"] == LAST_VERIFIED
            assert item["name"] and item["contact"] and item["detail"]
