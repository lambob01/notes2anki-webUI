from __future__ import annotations

import re

PRESETS: dict[str, str] = {
    "explanations": (
        "Explain the why behind each fact: add a concise explanation of the "
        "underlying mechanism or reasoning, not just a restatement."
    ),
    "derivations": (
        "For every card involving a formula or equation, add a step-by-step "
        "derivation: state the starting principle and each algebraic step, "
        "using LaTeX (\\(...\\) inline, \\[...\\] display). Skip cards that "
        "contain no formula."
    ),
    "common_mistakes": (
        'Where a common misconception exists, add a brief "Common mistake:" '
        "note describing the wrong intuition and why it is wrong."
    ),
    "real_world_applications": (
        "Where natural, add one sentence connecting the idea to a real-world "
        "system, physical example, or practical application."
    ),
}

_ANSWER_NAMES = {"answer", "back"}
_ANSWER_LABEL_PARTS = tuple(_ANSWER_NAMES)


def _tokens(value: object) -> set[str]:
    """Lowercase the value and split it on anything non-alphanumeric."""
    return set(re.findall(r"[a-z0-9]+", str(value).lower()))


def resolve_target_field(fields: list[dict] | None) -> str:
    """Pick the field that receives added depth.

    Prefer an exact answer/back name, then a field whose name or label
    mentions one, then the template's second field, then its only field.
    """
    usable = [f for f in (fields or []) if f.get("name")]

    for field in usable:
        if str(field["name"]).strip().lower() in _ANSWER_NAMES:
            return field["name"]

    for field in usable:
        tokens = _tokens(field["name"]) | _tokens(field.get("label") or "")
        if tokens.intersection(_ANSWER_LABEL_PARTS):
            return field["name"]

    if len(usable) >= 2:
        return usable[1]["name"]
    if usable:
        return usable[0]["name"]
    return "answer"


def _enrichment_lines(specs: list[str] | None, custom_text: str | None) -> list[str]:
    lines: list[str] = []
    for key in dict.fromkeys(specs or []):
        instruction = PRESETS.get(key)
        if instruction:
            lines.append(f"- {instruction}")

    extra = (custom_text or "").strip()
    if extra:
        lines.append(extra)
    return lines


def compose_enrichment(
    specs: list[str] | None,
    custom_text: str | None,
    fields: list[dict] | None,
) -> str:
    """Expand preset keys and free text into the enrichment block body.

    Returns an empty string when there is nothing to add, so callers can leave
    the prompt untouched.
    """
    lines = _enrichment_lines(specs, custom_text)
    if not lines:
        return ""

    target = resolve_target_field(fields)
    preamble = (
        "These extend the rules above. They are the explicit exception to two of them:\n"
        "the rule against leaving a field empty when the content does not supply it,\n"
        "and the rule against adding facts that are not in the content (provided every\n"
        'addition is marked "(not in slides)").\n'
        "- You MAY supplement sparse slide content with established knowledge.\n"
        "  Mark every explanation/derivation/application not present in the\n"
        '  provided content by ending that passage with "(not in slides)".\n'
        f'- Put all added depth in the "{target}" field. Do not create extra\n'
        "  cards to hold it.\n"
        "- Apply a requirement only where relevant to that card's idea; leave\n"
        "  cards alone where it would be forced.\n"
        "- Keep ordinary additions to 2-4 sentences; derivations may be longer."
    )
    return preamble + "\n\n" + "\n".join(lines)


def compose_topic_enrichment(
    specs: list[str] | None,
    custom_text: str | None,
    fields: list[dict] | None,
) -> str:
    """Enrichment for topic requests, where there is no slide source.

    The slide-oriented composer marks added knowledge "(not in slides)" and
    treats it as an exception to a don't-invent-facts rule. Topic cards are
    written from established knowledge in the first place, so that framing is
    wrong; the presets themselves still apply.
    """
    lines = _enrichment_lines(specs, custom_text)
    if not lines:
        return ""

    target = resolve_target_field(fields)
    preamble = (
        "These extend the rules above.\n"
        f'- Put all added depth in the "{target}" field. Do not create extra\n'
        "  cards to hold it.\n"
        "- Apply a requirement only where relevant to that card's idea; leave\n"
        "  cards alone where it would be forced.\n"
        "- Keep ordinary additions to 2-4 sentences; derivations may be longer."
    )
    return preamble + "\n\n" + "\n".join(lines)
