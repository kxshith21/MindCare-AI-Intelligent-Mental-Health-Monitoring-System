"""Labeled rules-engine evaluation and false-negative/false-positive report.

Run with `pytest -s` to see the printed summary. The dataset lives in
`tests/data/risk_cases.yaml`; `must_flag` cases must never be missed.
"""

from pathlib import Path

import pytest
import yaml

from app.services import risk_rules

CASES_PATH = Path(__file__).parent / "data" / "risk_cases.yaml"
ORDER = {"low": 0, "elevated": 1, "high": 2}


@pytest.fixture(scope="module")
def cases() -> list[dict]:
    with CASES_PATH.open(encoding="utf-8") as handle:
        loaded = yaml.safe_load(handle)
    assert isinstance(loaded, list)
    assert len(loaded) >= 60, "labeled dataset must contain 60+ cases"
    return loaded


def test_labeled_dataset_summary(capsys, cases: list[dict]) -> None:
    false_negatives: list[tuple[str, str, str]] = []
    false_positives: list[str] = []
    must_flag_count = 0
    benign_count = 0

    for case in cases:
        result = risk_rules.evaluate(case["text"])
        if case["must_flag"]:
            must_flag_count += 1
            if ORDER[result.level] < ORDER[case["expected_min_level"]]:
                false_negatives.append(
                    (case["text"], case["expected_min_level"], result.level)
                )
        else:
            benign_count += 1
            if result.flagged:
                false_positives.append(case["text"])

    fp_rate = len(false_positives) / benign_count if benign_count else 0.0
    print("\n=== RULES ENGINE LABELED SET ===")
    print(f"total_cases={len(cases)}")
    print(f"must_flag_cases={must_flag_count}")
    print(f"benign_cases={benign_count}")
    print(f"false_negatives={len(false_negatives)}")
    print(f"false_positives={len(false_positives)}")
    print(f"false_positive_rate={fp_rate:.3f}")
    if false_negatives:
        for text, expected, actual in false_negatives:
            print(f"FN expected>={expected} got={actual}: {text!r}")
    if false_positives:
        for text in false_positives:
            print(f"FP expected=low: {text!r}")

    assert not false_negatives, "zero false negatives required on must_flag cases"
    assert fp_rate <= 0.10, f"false-positive rate too high: {fp_rate:.3f}"


def test_matched_rules_are_ids_not_raw_text() -> None:
    result = risk_rules.evaluate("I want to kill myself tonight.")
    assert "direct_kill_myself" in result.matched_rules
    assert "plan_tonight" in result.matched_rules
    assert all(rule_id.isidentifier() for rule_id in result.matched_rules)
    assert "kill myself" not in result.matched_rules
    assert "tonight" not in result.matched_rules


def test_normalization_handles_obfuscation() -> None:
    assert risk_rules.normalize("K1LL My5elf") == "kill myself"
    assert risk_rules.normalize("su1c1de") == "suicide"
    assert risk_rules.normalize("SOOOO hopeless") == "soo hopeless"
    assert risk_rules.normalize("988 and 112") == "988 and 112"


def test_conversation_escalation_from_three_flagged_messages() -> None:
    messages = [
        "I feel hopeless.",
        "I want to disappear.",
        "Nobody cares about me.",
    ]
    result = risk_rules.evaluate_conversation(messages)
    assert result.level == "high"
    assert "conversation_escalation" in result.matched_rules


def test_conversation_escalation_one_step_only() -> None:
    messages = [
        "I feel hopeless.",
        "I want to disappear.",
        "I want to kill myself.",
    ]
    result = risk_rules.evaluate_conversation(messages)
    assert result.level == "high"


def test_max_level_helper() -> None:
    assert risk_rules.max_level("low", "elevated", "high") == "high"
    assert risk_rules.max_level("low", "low") == "low"
