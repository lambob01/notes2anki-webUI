"""Enrichment instructions are appended, never prefixed."""

from app.services.ai_generator import ENRICHMENT_HEADER, _append_enrichment


def test_append_enrichment_adds_header_and_strips_text() -> None:
    assert _append_enrichment("BASE", "  Do X.  ") == (
        f"BASE\n\n{ENRICHMENT_HEADER}\nDo X."
    )


def test_append_enrichment_is_noop_when_empty() -> None:
    assert _append_enrichment("BASE", None) == "BASE"
    assert _append_enrichment("BASE", "   ") == "BASE"
