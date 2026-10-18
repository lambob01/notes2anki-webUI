from __future__ import annotations

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
_ANSWER_LABEL_PARTS = ("answer", "back")


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
        name = str(field["name"]).strip().lower()
        label = str(field.get("label") or "").strip().lower()
        if any(part in name or part in label for part in _ANSWER_LABEL_PARTS):
            return field["name"]

    if len(usable) >= 2:
        return usable[1]["name"]
    if usable:
        return usable[0]["name"]
    return "answer"


def compose_enrichment(
    specs: list[str] | None,
    custom_text: str | None,
    fields: list[dict] | None,
) -> str:
    """Expand preset keys and free text into the enrichment block body.

    Returns an empty string when there is nothing to add, so callers can leave
    the prompt untouched.
    """
    lines: list[str] = []
    for key in dict.fromkeys(specs or []):
        instruction = PRESETS.get(key)
        if instruction:
            lines.append(f"- {instruction}")

    extra = (custom_text or "").strip()
    if extra:
        lines.append(extra)

    if not lines:
        return ""

    target = resolve_target_field(fields)
    preamble = (
        "These extend the rules above. Where they conflict with rules 6 and 8,\n"
        "they are the explicit exception, limited to the depth requested below.\n"
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
