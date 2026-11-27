"""Independent keyword/triage signal ported from legacy/utils/risk_analyzer.py.

This is deliberately NOT a classifier and NOT a clinical instrument. It is a
second signal that runs even when the LLM fails. It is conservative: obvious
negation, reported third-person speech, quotes, and clear past/recovery context
can suppress a match, but a single ambiguous signal is kept. When in doubt we
keep the higher level. See docs/RISK.md for the documented tradeoffs.

`matched_rules` contains stable rule ids only — never raw message text.
"""

from __future__ import annotations

import re
import unicodedata
from dataclasses import dataclass, replace
from typing import Literal

RiskLevel = Literal["low", "elevated", "high"]
RiskCategory = Literal[
    "none",
    "hopelessness",
    "self_harm_ideation",
    "plan_or_means",
    "harm_to_others",
    "acute_distress",
    "other",
]

_LEVEL_ORDER: dict[RiskLevel, int] = {"low": 0, "elevated": 1, "high": 2}
_LEVEL_FROM_ORDER: dict[int, RiskLevel] = {v: k for k, v in _LEVEL_ORDER.items()}

_LEET = str.maketrans(
    {
        "0": "o",
        "1": "i",
        "3": "e",
        "4": "a",
        "5": "s",
        "7": "t",
        "@": "a",
        "!": "i",
    }
)


@dataclass(frozen=True)
class RuleResult:
    level: RiskLevel
    category: RiskCategory
    matched_rules: tuple[str, ...] = ()

    @property
    def flagged(self) -> bool:
        return self.level != "low"


@dataclass(frozen=True)
class _Rule:
    id: str
    pattern: re.Pattern[str]
    level: RiskLevel
    category: RiskCategory
    kind: str
    allow_negation: bool = False


def _r(
    rule_id: str,
    pattern: str,
    level: RiskLevel,
    category: RiskCategory,
    kind: str,
    *,
    allow_negation: bool = False,
) -> _Rule:
    return _Rule(rule_id, re.compile(pattern), level, category, kind, allow_negation)


# ---------------------------------------------------------------------------
# English rules. Ported phrases from legacy/utils/risk_analyzer.py are kept
# recognisable (same intent) but split into stable rule ids and kinds.
# ---------------------------------------------------------------------------
RULES: tuple[_Rule, ...] = (
    # Direct ideation — high only when plan/means/timeframe also appears.
    _r("direct_kill_myself", r"\bkill\s+myself\b", "elevated", "self_harm_ideation", "direct"),
    _r("direct_kill_self", r"\bkill\s+(?:himself|herself|themselves)\b", "elevated", "self_harm_ideation", "direct"),
    _r("direct_end_my_life", r"\bend\s+my\s+life\b", "elevated", "self_harm_ideation", "direct"),
    _r("direct_end_it", r"\b(?:end|ending)\s+it\s+all\b", "elevated", "self_harm_ideation", "direct"),
    _r("direct_want_die", r"\bwant\s+to\s+die\b|\bwanted\s+to\s+die\b", "elevated", "self_harm_ideation", "direct"),
    _r("direct_wish_dead", r"\bwish\s+i\s+(?:was|were)\s+dead\b", "elevated", "self_harm_ideation", "direct"),
    _r("direct_suicide", r"\bsuicid(?:e|al)\b", "elevated", "self_harm_ideation", "direct"),
    _r("direct_no_reason_to_live", r"\bno\s+reason\s+to\s+live\b", "elevated", "self_harm_ideation", "direct"),
    _r("direct_better_off_dead", r"\bbetter\s+off\s+dead\b", "elevated", "self_harm_ideation", "direct"),
    _r("direct_dont_want_live", r"\bdon'?t\s+want\s+to\s+live\b", "elevated", "self_harm_ideation", "direct", allow_negation=True),
    _r("direct_dont_want_die_anymore", r"\bdon'?t\s+want\s+to\s+die\s+anymore\b", "elevated", "self_harm_ideation", "direct", allow_negation=True),
    _r("direct_deserve_to_die", r"\bdeserve\s+to\s+die\b", "elevated", "self_harm_ideation", "direct"),
    _r("direct_before_i_die", r"\bbefore\s+i\s+die\b", "elevated", "self_harm_ideation", "direct"),
    _r("direct_take_my_life", r"\btake\s+(?:my|my\s+own)\s+life\b", "elevated", "self_harm_ideation", "direct"),

    # Indirect ideation.
    _r("indirect_better_off_without_me", r"\bbetter\s+off\s+without\s+me\b|\bbetter\s+without\s+me\b", "elevated", "self_harm_ideation", "indirect"),
    _r("indirect_cant_do_this_anymore", r"\bcan'?t\s+do\s+this\s+anymore\b", "elevated", "acute_distress", "indirect"),
    _r("indirect_disappear", r"\b(?:want|wish)\s+to\s+disappear\b|\bdisappear\s+forever\b", "elevated", "self_harm_ideation", "indirect"),
    _r("indirect_wish_not_wake", r"\bwish\s+i\s+(?:wouldn'?t|will\s+not)\s+wake\s+up\b", "elevated", "self_harm_ideation", "indirect"),
    _r("indirect_nobody_would_miss_me", r"\bnobody\s+would\s+miss\s+me\b", "elevated", "self_harm_ideation", "indirect"),
    _r("indirect_tired_of_living", r"\btired\s+of\s+living\b", "elevated", "self_harm_ideation", "indirect"),
    _r("indirect_burden", r"\b(?:a|such\s+a)\s+burden\b", "elevated", "self_harm_ideation", "indirect"),

    # Self-harm (distinct from suicide ideation).
    _r("self_harm_generic", r"\bself[\s-]?harm\b|\bhurt(?:ing)?\s+myself\b", "elevated", "self_harm_ideation", "self_harm"),
    _r("self_harm_cut", r"\bcut(?:ting)?\s+myself\b", "elevated", "self_harm_ideation", "self_harm"),
    _r("self_harm_burn", r"\bburn(?:ing)?\s+myself\b", "elevated", "self_harm_ideation", "self_harm"),

    # Hopelessness / worthlessness.
    _r("hopeless_hopeless", r"\bhopeless\b", "elevated", "hopelessness", "hopeless"),
    _r("hopeless_nobody_cares", r"\bnobody\s+cares\b|\bno\s+one\s+cares\b", "elevated", "hopelessness", "hopeless"),
    _r("hopeless_worthless", r"\bworthless\b", "elevated", "hopelessness", "hopeless"),
    _r("hopeless_no_point", r"\bno\s+point\b", "elevated", "hopelessness", "hopeless"),
    _r("hopeless_give_up", r"\bgive\s+up\b", "elevated", "hopelessness", "hopeless"),
    _r("hopeless_alone_forever", r"\balone\s+forever\b", "elevated", "hopelessness", "hopeless"),
    _r("hopeless_hate_myself", r"\bhate\s+myself\b", "elevated", "hopelessness", "hopeless"),
    _r("hopeless_nothing_matters", r"\bnothing\s+matters\b", "elevated", "hopelessness", "hopeless"),
    _r("hopeless_no_way_out", r"\bno\s+way\s+out\b", "elevated", "hopelessness", "hopeless"),

    # Acute distress (not necessarily self-harm).
    _r("acute_cant_cope", r"\bcan'?t\s+cope\b|\bcannot\s+cope\b", "elevated", "acute_distress", "acute"),
    _r("acute_distress", r"\bacute\s+distress\b", "elevated", "acute_distress", "acute"),
    _r("acute_pain_to_stop", r"\b(?:the|this|emotional)\s+pain\s+to\s+stop\b", "elevated", "acute_distress", "acute"),

    # Harm to others.
    _r("harm_other_hurt_someone", r"\b(?:want|going|will)\s+to\s+hurt\s+(?:someone|somebody|people)\b|\bwill\s+hurt\s+(?:someone|somebody|people)\b|\bhurt\s+(?:my|the)\s+(?:family|friend|classmate|teacher)\b", "elevated", "harm_to_others", "harm_other"),
    _r("harm_other_kill_person", r"\bkill\s+(?:my|the|some|that)\s+(?:person|people|someone|somebody|neighbor|neighbour|classmate|teacher|student|family|friend|child|kid|man|woman|guy|human)\b", "elevated", "harm_to_others", "harm_other"),
    _r("harm_other_make_them_pay", r"\bmake\s+them\s+pay\b", "elevated", "harm_to_others", "harm_other"),

    # Explicit means / high-severity phrases. These are high on their own.
    _r("means_hang_myself", r"\bhang\s+myself\b", "high", "plan_or_means", "means"),
    _r("means_overdose", r"\boverdose\b", "high", "plan_or_means", "means"),
    _r("means_jump_off", r"\bjump\s+off\b", "high", "plan_or_means", "means"),
    _r("means_drown_myself", r"\bdrown\s+myself\b", "high", "plan_or_means", "means"),
    _r("means_set_on_fire", r"\bset\s+myself\s+on\s+fire\b", "high", "plan_or_means", "means"),
    _r("means_shoot_myself", r"\bshoot\s+myself\b", "high", "plan_or_means", "means"),
    _r("means_drive_off_cliff", r"\bdrive\s+off\s+(?:the|a)\s+cliff\b", "high", "plan_or_means", "means"),
    _r("means_rope_ready", r"\b(?:rope|pills)\s+(?:ready|in\s+my|next\s+to\s+me)\b", "high", "plan_or_means", "means"),

    # Plan / means / timeframe language. Alone it is weak; it escalates only
    # when a risk signal is present, or when two plan signals co-occur.
    _r("plan_tonight", r"\btonight\b", "elevated", "plan_or_means", "plan"),
    _r("plan_tomorrow", r"\btomorrow\b", "elevated", "plan_or_means", "plan"),
    _r("plan_after_midnight", r"\bafter\s+midnight\b", "elevated", "plan_or_means", "plan"),
    _r("plan_after_asleep", r"\bafter\s+(?:everyone|everybody)\s+(?:is\s+)?asleep\b", "elevated", "plan_or_means", "plan"),
    _r("plan_by_end_of_week", r"\bby\s+the\s+end\s+of\s+(?:the\s+)?week\b|\bis\s+hafte\b", "elevated", "plan_or_means", "plan"),
    _r("plan_going_to", r"\bgoing\s+to\b|\bwill\s+do\s+it\b|\bdo(?:ing)?\s+it\b", "elevated", "plan_or_means", "plan"),
    _r("plan_decided", r"\b(?:i'?ve\s+)?decided\s+to\s+(?:do|end)\b|\bmade\s+up\s+my\s+mind\b", "elevated", "plan_or_means", "plan"),
    _r("plan_have_a_plan", r"\b(?:have|got)\s+a\s+plan\b|\bmy\s+plan\s+is\b", "elevated", "plan_or_means", "plan"),
    _r("plan_chosen_time", r"\bchosen\s+a\s+(?:time|place)\b|\btime\s+and\s+a\s+place\b", "elevated", "plan_or_means", "plan"),
    _r("plan_bought_pills", r"\bbought\s+(?:some\s+)?pills\b|\bgot\s+(?:some\s+)?pills\b", "elevated", "plan_or_means", "plan"),
    _r("plan_wrote_note", r"\b(?:wrote|written|writing)\s+(?:a|my)\s+note\b|\bleave\s+a\s+note\b", "elevated", "plan_or_means", "plan"),
    _r("plan_said_goodbye", r"\bsaid\s+goodbye\b|\bsaying\s+goodbye\b|\bsay\s+goodbye\b", "elevated", "plan_or_means", "plan"),
    _r("plan_give_away_things", r"\bgive\s+away\s+(?:my|all\s+my)\s+(?:things|stuff|possessions)\b|\bpacked\s+my\s+things\b", "elevated", "plan_or_means", "plan"),
    _r("plan_make_it_happen", r"\bmake\s+it\s+happen\b", "elevated", "plan_or_means", "plan"),
    _r("plan_aaj_raat", r"\baaj\s+raat\b|\bkal\s+subah\b|\bkal\s+shaam\b", "elevated", "plan_or_means", "plan"),

    # Hinglish / transliterated phrases. CLEARLY SEPARATE and incomplete.
    # Requires review by a native speaker and a clinician before launch.
    _r("hinglish_suicide", r"\b(?:main\s+)?(?:khudkushi|aatmahatya|atmahatya)\b|\bkhud\s+ko\s+mar\b|\bkhudko\s+mar\b", "elevated", "self_harm_ideation", "hinglish"),
    _r("hinglish_mar_jana", r"\bmujhe\s+mar\s+jana\s+hai\b|\bmain\s+mar\s+jana\s+chahta\s+hoon\b|\bmarne\s+ki\s+(?:soch|soche)\b", "elevated", "self_harm_ideation", "hinglish"),
    _r("hinglish_cant_live", r"\bmain\s+ab\s+nahi\s+jee\s+sakta\b|\bmain\s+ab\s+nahi\s+je\s+pata\b", "elevated", "self_harm_ideation", "hinglish"),
    _r("hinglish_life_over", r"\bzindagi\s+khatam\b|\bjindagi\s+khatam\b|\bzindagi\s+se\s+thak\s+gaya\b", "elevated", "self_harm_ideation", "hinglish"),
    _r("hinglish_better_without_me", r"\bsab\s+(?:mere\s+)?bina\s+behtar\s+hoga\b|\bkisi\s+ko\s+farq\s+nahi\s+padega\b", "elevated", "hopelessness", "hinglish"),
)

_CONTEXT_KINDS = frozenset(
    {"direct", "indirect", "self_harm", "hopeless", "acute", "harm_other", "hinglish", "means"}
)

_NEGATION_BEFORE = re.compile(
    r"\b(?:not|never|no|don'?t|didn'?t|won'?t|isn'?t|ain'?t|wouldn'?t|couldn'?t|can'?t)\b"
    r"(?:\s+\w+){0,3}\s*$"
)
_THIRD_PERSON_BEFORE = re.compile(
    r"\b(?:he|she|they|him|her|friend|brother|sister|mother|father|mom|dad|teacher|student|"
    r"character|girl|boy|guy|woman|man|neighbor|neighbour)\b"
    r"(?:\s+\w+){0,8}\s*$"
)
_REPORTED_BEFORE = re.compile(
    r"\b(?:said|says|told|mentioned|quoted|reported|claimed|according\s+to|lyrics?|song|movie|"
    r"book|film|script|joke|meme)\b(?:\s+\w+){0,8}\s*$"
)
_PAST_BEFORE = re.compile(
    r"\b(?:used\s+to|when\s+i\s+was|back\s+then|years\s+ago|as\s+a\s+teenager|as\s+a\s+kid|"
    r"in\s+the\s+past)\b(?:\s+\w+){0,10}\s*$"
)
_PAST_AFTER = re.compile(
    r"^\s+(?:as\s+a\s+teenager|as\s+a\s+kid|years\s+ago|back\s+then|in\s+the\s+past)\b"
)
_RECOVERY = re.compile(
    r"\b(?:okay|fine|better|recovered|over\s+it|not)\s+(?:it\s+)?now\b|\bnot\s+anymore\b"
)
_PRESENT = re.compile(r"\b(?:now|today|still|recently|last\s+night|this\s+week|anymore)\b")
_QUOTED = re.compile(r"['\"]\s*(?:i|he|she|they)\b|\b(?:says|said)\s+['\"]")
_LAUGHING_AFTER = re.compile(r"^\s+(?:laughing|lol|haha|joking)\b")
_ACCIDENT_AFTER = re.compile(r"^\s+(?:in\s+(?:a\s+)?(?:car\s+)?accident|in\s+a\s+crash)")
_HATE_FORGIVE_AFTER = re.compile(r"^\s+for\s+(?:forgetting|messing|saying|doing|not)")
_GIVE_UP_ON_AFTER = re.compile(r"^\s+on\s+")
_NO_POINT_IDIOM_AFTER = re.compile(
    r"^\s+(?:arguing|trying\s+to\s+(?:win|prove|convince)|in\s+(?:the|this)\s+(?:game|debate|argument))"
)
_ACUTE_WORK_AFTER = re.compile(r"^\s+with\s+(?:work|school|homework|this\s+workload)\b")


def normalize(text: str) -> str:
    """Lowercase, Unicode-normalize and de-obfuscate text before matching."""
    value = unicodedata.normalize("NFKC", text or "").casefold()
    value = value.replace("’", "'").replace("‘", "'")

    pieces: list[str] = []
    for token in re.split(r"(\s+)", value):
        if token.isspace() or not token:
            pieces.append(token)
            continue
        # Digit substitution is only useful in tokens that also contain a
        # letter ("k1ll", "5elf"); leave bare numbers like 988/112 alone.
        if any(ch.isalpha() for ch in token):
            token = token.translate(_LEET)
        pieces.append(token)
    value = "".join(pieces)

    # "sooooo" -> "soo"; "suuuicide" -> "suuicide" (still matches suicide-ish
    # patterns after punctuation cleanup where relevant).
    value = re.sub(r"([a-z])\1{2,}", r"\1\1", value)
    value = re.sub(r"[^a-z0-9' ]+", " ", value)
    return re.sub(r"\s+", " ", value).strip()


def _is_suppressed(value: str, match: re.Match[str], rule: _Rule) -> bool:
    before = value[max(0, match.start() - 90) : match.start()]
    after = value[match.end() : match.end() + 90]

    if not rule.allow_negation and _NEGATION_BEFORE.search(before):
        return True

    if _THIRD_PERSON_BEFORE.search(before) or _REPORTED_BEFORE.search(before):
        return True
    if _QUOTED.search(before):
        return True

    if rule.id == "direct_want_die" and (
        _LAUGHING_AFTER.match(after) or _ACCIDENT_AFTER.match(after)
    ):
        return True

    if rule.id == "hopeless_hate_myself" and _HATE_FORGIVE_AFTER.match(after):
        return True
    if rule.id == "hopeless_give_up" and _GIVE_UP_ON_AFTER.match(after):
        return True
    if rule.id == "hopeless_no_point" and _NO_POINT_IDIOM_AFTER.match(after):
        return True
    if rule.id == "acute_cant_cope" and _ACUTE_WORK_AFTER.match(after):
        return True

    past_context = bool(_PAST_BEFORE.search(before) or _PAST_AFTER.match(after))
    if past_context:
        if _RECOVERY.search(value) or not _PRESENT.search(value):
            return True

    return False


def evaluate(text: str) -> RuleResult:
    """Run the rules engine on one message."""
    if not text or not text.strip():
        return RuleResult("low", "none")

    value = normalize(text)
    matches: list[tuple[_Rule, re.Match[str]]] = []
    for rule in RULES:
        for match in rule.pattern.finditer(value):
            if not _is_suppressed(value, match, rule):
                matches.append((rule, match))
                break

    if not matches:
        return RuleResult("low", "none")

    matched_rules = tuple(dict.fromkeys(rule.id for rule, _ in matches))
    highest = max(_LEVEL_ORDER[rule.level] for rule, _ in matches)
    kinds = {rule.kind for rule, _ in matches}
    categories = {rule.category for rule, _ in matches}
    plan_count = sum(1 for rule, _ in matches if rule.kind == "plan")
    has_risk_context = bool(kinds & _CONTEXT_KINDS)

    if has_risk_context and plan_count >= 1:
        highest = _LEVEL_ORDER["high"]
    elif plan_count >= 2:
        highest = _LEVEL_ORDER["high"]

    level = _LEVEL_FROM_ORDER[highest]

    if "plan_or_means" in categories and level == "high":
        category: RiskCategory = "plan_or_means"
    elif "self_harm_ideation" in categories:
        category = "self_harm_ideation"
    elif "harm_to_others" in categories:
        category = "harm_to_others"
    elif "hopelessness" in categories:
        category = "hopelessness"
    elif "acute_distress" in categories:
        category = "acute_distress"
    else:
        category = "other"

    return RuleResult(level=level, category=category, matched_rules=matched_rules)


def max_level(*levels: RiskLevel) -> RiskLevel:
    """Return the higher of two or more levels."""
    return _LEVEL_FROM_ORDER[max(_LEVEL_ORDER[level] for level in levels)]


def evaluate_conversation(texts: list[str], *, window: int = 5) -> RuleResult:
    """Evaluate the last ``window`` user messages, then escalate if needed.

    Escalation happens when 3+ messages in the window are flagged, or when an
    elevated signal appears together with hopelessness language. It raises the
    current result by exactly one level and records a stable rule id.
    """
    if not texts:
        return RuleResult("low", "none")

    recent = texts[-window:]
    results = [evaluate(text) for text in recent]
    current = results[-1]

    flagged_count = sum(1 for result in results if result.flagged)
    has_elevated = any(result.level == "elevated" for result in results)
    has_hopelessness = any(result.category == "hopelessness" for result in results)

    if flagged_count >= 3 or (has_elevated and has_hopelessness):
        next_order = min(_LEVEL_ORDER["high"], _LEVEL_ORDER[current.level] + 1)
        category: RiskCategory = current.category if current.flagged else "acute_distress"
        return replace(
            current,
            level=_LEVEL_FROM_ORDER[next_order],
            category=category,
            matched_rules=current.matched_rules + ("conversation_escalation",),
        )

    return current
