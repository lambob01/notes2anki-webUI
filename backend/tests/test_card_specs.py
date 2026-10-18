"""Composition of per-generation card enrichment instructions.

Pure string logic: the UI sends preset keys, the server expands them into
prompt instructions and resolves which field receives the added depth.
"""

from app.services.card_specs import PRESETS, compose_enrichment, resolve_target_field

FIELDS = [
    {"name": "prompt", "label": "Front / Prompt"},
    {"name": "answer", "label": "Back / Answer"},
    {"name": "extra", "label": "Extra"},
]


def test_all_preset_keys_have_instructions() -> None:
    assert set(PRESETS) == {
        "explanations",
        "derivations",
        "common_mistakes",
        "real_world_applications",
    }
    assert all(instruction.strip() for instruction in PRESETS.values())


def test_resolve_prefers_exact_answer_field() -> None:
    assert resolve_target_field(FIELDS) == "answer"


def test_resolve_matches_back_label() -> None:
    fields = [
        {"name": "front", "label": "Front"},
        {"name": "definition", "label": "Back / Answer"},
    ]
    assert resolve_target_field(fields) == "definition"


def test_resolve_matches_whole_token_in_first_field_label() -> None:
    fields = [
        {"name": "definition", "label": "Back / Answer"},
        {"name": "front", "label": "Front"},
    ]
    assert resolve_target_field(fields) == "definition"


def test_resolve_does_not_substring_match_feedback() -> None:
    fields = [{"name": "feedback"}, {"name": "question"}]
    assert resolve_target_field(fields) == "question"


def test_resolve_does_not_substring_match_background() -> None:
    fields = [{"name": "background"}, {"name": "question"}]
    assert resolve_target_field(fields) == "question"


def test_resolve_does_not_substring_match_unanswered() -> None:
    fields = [{"name": "unanswered"}, {"name": "question"}]
    assert resolve_target_field(fields) == "question"


def test_resolve_falls_back_to_second_field() -> None:
    fields = [{"name": "one"}, {"name": "two"}]
    assert resolve_target_field(fields) == "two"


def test_resolve_falls_back_to_only_field() -> None:
    assert resolve_target_field([{"name": "text"}]) == "text"


def test_resolve_handles_no_fields() -> None:
    assert resolve_target_field(None) == "answer"
    assert resolve_target_field([]) == "answer"


def test_compose_with_nothing_returns_empty() -> None:
    assert compose_enrichment([], "", FIELDS) == ""
    assert compose_enrichment(None, "   ", FIELDS) == ""


def test_compose_ignores_unknown_keys() -> None:
    assert compose_enrichment(["does_not_exist"], "", FIELDS) == ""


def test_compose_expands_presets_in_order() -> None:
    text = compose_enrichment(["explanations", "derivations"], "", FIELDS)
    assert text.index(PRESETS["explanations"]) < text.index(PRESETS["derivations"])


def test_compose_appends_free_text_last() -> None:
    text = compose_enrichment(["explanations"], "Mention Bernoulli.", FIELDS)
    assert text.rstrip().endswith("Mention Bernoulli.")


def test_compose_names_target_field_and_grounding_rule() -> None:
    text = compose_enrichment(["common_mistakes"], "", FIELDS)
    assert '"answer"' in text
    assert "(not in slides)" in text
    assert "Do not create extra" in text


def test_preamble_names_the_rules_it_exempts() -> None:
    text = compose_enrichment(["common_mistakes"], "", FIELDS)
    assert "leaving a field empty" in text
    assert "adding facts that are not in the content" in text
    assert "rules 6 and 8" not in text
