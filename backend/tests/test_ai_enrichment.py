"""Enrichment instructions are appended, never prefixed."""

from app.services.ai_generator import ENRICHMENT_HEADER, _append_enrichment


def test_append_enrichment_adds_header_and_strips_text() -> None:
    assert _append_enrichment("BASE", "  Do X.  ") == (
        f"BASE\n\n{ENRICHMENT_HEADER}\nDo X."
    )


def test_append_enrichment_is_noop_when_empty() -> None:
    assert _append_enrichment("BASE", None) == "BASE"
    assert _append_enrichment("BASE", "   ") == "BASE"


def test_global_context_precedes_enrichment(monkeypatch) -> None:
    import app.services.ai_generator as ai

    captured: dict[str, str] = {}

    def fake_call_llm(provider, model_name, messages, system=None, field_names=None):
        captured["system"] = system
        return []

    monkeypatch.setattr(ai, "_call_llm", fake_call_llm)

    ai.generate_cards_text(
        provider=object(),
        model_name="dummy-model",
        text="Body",
        template_fields=[{"name": "prompt"}, {"name": "answer"}],
        custom_prompt="Do X.",
        global_context="Syllabus",
    )

    system = captured["system"]
    assert "Global lecture context:" in system
    assert system.index("Global lecture context:") < system.index(ai.ENRICHMENT_HEADER)
