"""The salvage parser behind the prompt-only structured-output tier.

Ported from the notes2anki-v2 CLI, whose extract_cards_json this is a copy of.
It is what makes providers with no JSON mode (Ollama, LM Studio) usable, and
it is pure string surgery - exactly the code that breaks silently when edited.
"""

import pytest

from app.services.ai_generator import AiError, _extract_cards_json


def test_accepts_fenced_object() -> None:
    raw = '```json\n{"cards":[{"prompt":"Q","answer":"A"}]}\n```'

    assert _extract_cards_json(raw) == [{"prompt": "Q", "answer": "A"}]


def test_accepts_bare_list() -> None:
    raw = '[{"prompt":"Q","answer":"A"}]'

    assert _extract_cards_json(raw) == [{"prompt": "Q", "answer": "A"}]


def test_accepts_empty_card_set() -> None:
    assert _extract_cards_json('{"cards":[]}') == []


def test_ignores_prose_before_the_json() -> None:
    raw = 'Here are your cards:\n{"cards":[{"prompt":"Q","answer":"A"}]}'

    assert _extract_cards_json(raw) == [{"prompt": "Q", "answer": "A"}]


def test_repairs_common_latex_backslashes() -> None:
    raw = '{"cards":[{"prompt":"Formula","answer":"","formula":"\\frac{a}{b}"}]}'

    cards = _extract_cards_json(raw)

    assert cards[0]["formula"] == "\\frac{a}{b}"


def test_repairs_nabla_and_cdot() -> None:
    raw = '{"cards":[{"prompt":"P","answer":"","formula":"\\nabla \\cdot E"}]}'

    cards = _extract_cards_json(raw)

    assert cards[0]["formula"] == "\\nabla \\cdot E"


def test_repairs_truncated_payload() -> None:
    # Hit the token cap mid-object: the closing braces never arrived.
    raw = '{"cards":[{"prompt":"Q","answer":"A"}'

    assert _extract_cards_json(raw) == [{"prompt": "Q", "answer": "A"}]


def test_finds_cards_under_an_unexpected_key() -> None:
    raw = '{"flashcards":[{"prompt":"Q","answer":"A"}]}'

    assert _extract_cards_json(raw) == [{"prompt": "Q", "answer": "A"}]


def test_raises_on_unparseable_text() -> None:
    with pytest.raises(AiError):
        _extract_cards_json("I could not find anything to make cards about.")
