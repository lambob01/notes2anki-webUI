"""Topic mode writes cards from a request instead of extracting from a source.

The important separations from text/file mode: the stored source_type is
"topic", the prompt is not slide-shaped, the target count is persisted, and
generated cards have no slide index.
"""

import uuid

import pytest
from fastapi.testclient import TestClient

from app.database import SessionLocal
from app.main import app
from app.models import CardTemplate, Provider
from app.services import ai_generator
from app.services.card_specs import compose_topic_enrichment


@pytest.fixture
def seeded():
    db = SessionLocal()
    tag = uuid.uuid4().hex[:8]
    provider = Provider(
        name=f"topic-probe-{tag}", provider_type="openai", base_url="http://x.invalid"
    )
    template = CardTemplate(
        name=f"topic-tpl-{tag}",
        note_type="Basic",
        fields=[
            {"name": "prompt", "label": "Front"},
            {"name": "answer", "label": "Back"},
        ],
    )
    db.add_all([provider, template])
    db.commit()
    yield provider, template
    db.close()


def _payload(provider, template, **overrides):
    payload = {
        "provider_id": provider.id,
        "model_name": "gpt-4o",
        "template_id": template.id,
        "deck_name": "Default",
        "topic": "Explain boundary layers in fluid mechanics",
        "target_card_count": 10,
        "card_specs": ["explanations"],
        "custom_prompt": "Mention units.",
    }
    payload.update(overrides)
    return payload


def test_topic_request_stores_config_without_slide_language(seeded, monkeypatch):
    import app.routers.generate as generate_router

    monkeypatch.setattr(generate_router, "_run_generation", lambda *args, **kwargs: None)
    provider, template = seeded

    with TestClient(app) as client:
        response = client.post("/api/generate", json=_payload(provider, template))

    assert response.status_code == 200
    body = response.json()
    assert body["source_type"] == "topic"
    assert body["source_text"] == "Explain boundary layers in fluid mechanics"
    assert body["target_card_count"] == 10
    assert body["title"] == "Explain boundary layers in fluid mechanics"

    stored = body["custom_prompt"]
    assert "underlying mechanism" in stored
    assert '"answer"' in stored
    assert "not in slides" not in stored
    assert "provided content" not in stored
    assert stored.rstrip().endswith("Mention units.")


def test_topic_and_source_text_are_mutually_exclusive(seeded, monkeypatch):
    import app.routers.generate as generate_router

    monkeypatch.setattr(generate_router, "_run_generation", lambda *args, **kwargs: None)
    provider, template = seeded

    with TestClient(app) as client:
        response = client.post(
            "/api/generate",
            json=_payload(provider, template, source_text="Some notes"),
        )

    assert response.status_code == 400
    assert "either a topic or source text" in response.json()["detail"]


def test_blank_request_is_rejected(seeded, monkeypatch):
    import app.routers.generate as generate_router

    monkeypatch.setattr(generate_router, "_run_generation", lambda *args, **kwargs: None)
    provider, template = seeded

    with TestClient(app) as client:
        response = client.post(
            "/api/generate",
            json=_payload(provider, template, topic="   "),
        )

    assert response.status_code == 400
    assert "Provide a topic" in response.json()["detail"]


def test_target_card_count_is_bounded(seeded, monkeypatch):
    import app.routers.generate as generate_router

    monkeypatch.setattr(generate_router, "_run_generation", lambda *args, **kwargs: None)
    provider, template = seeded

    with TestClient(app) as client:
        response = client.post(
            "/api/generate",
            json=_payload(provider, template, target_card_count=31),
        )

    assert response.status_code == 400
    assert "between 1 and 30" in response.json()["detail"]


def test_from_file_rejects_topic(seeded, monkeypatch):
    import app.routers.generate as generate_router

    monkeypatch.setattr(generate_router, "_run_generation", lambda *args, **kwargs: None)
    provider, template = seeded

    with TestClient(app) as client:
        response = client.post(
            "/api/generate/from-file",
            json=_payload(provider, template, source_filename="whatever.txt"),
        )

    assert response.status_code == 400
    assert "POST /api/generate" in response.json()["detail"]


def test_topic_background_run_writes_cards_without_slides(seeded, monkeypatch):
    import app.routers.generate as generate_router

    captured: dict[str, object] = {}

    def fake_generate_cards_topic(**kwargs):
        captured.update(kwargs)
        return [{"prompt": "What is a boundary layer?", "answer": "A thin flow region."}]

    monkeypatch.setattr(generate_router, "generate_cards_topic", fake_generate_cards_topic)
    provider, template = seeded

    with TestClient(app) as client:
        response = client.post(
            "/api/generate",
            json=_payload(provider, template, target_card_count=7),
        )
        generation_id = response.json()["id"]
        detail = client.get(f"/api/generate/{generation_id}").json()

    assert detail["status"] == "completed"
    assert detail["source_type"] == "topic"
    assert detail["cards_generated"] == 1
    assert len(detail["cards"]) == 1
    assert detail["cards"][0]["slide_index"] is None
    assert detail["cards"][0]["fields"] == {
        "prompt": "What is a boundary layer?",
        "answer": "A thin flow region.",
    }
    assert captured["topic"] == "Explain boundary layers in fluid mechanics"
    assert captured["target_card_count"] == 7


def test_topic_prompt_uses_established_knowledge_and_count():
    fields = [
        {"name": "prompt", "description": "The question."},
        {"name": "answer", "description": "An explanation."},
    ]
    prompt = ai_generator.build_topic_prompt(fields, "Fluid mechanics", 10)

    assert "established knowledge" in prompt
    assert "explanatory study cards" in prompt
    assert "Generate exactly 10 cards" in prompt
    assert "Subject context: Fluid mechanics" in prompt
    assert '"prompt"' in prompt and '"answer"' in prompt

    auto = ai_generator.build_topic_prompt(fields, None)
    assert "Generate as many cards as the request warrants" in auto
    assert "Generate exactly" not in auto


def test_generate_cards_topic_sends_request_and_enrichment(monkeypatch):
    captured: dict[str, object] = {}

    def fake_call_llm(provider, model_name, messages, system=None, field_names=None):
        captured.update(
            {
                "messages": messages,
                "system": system,
                "field_names": field_names,
            }
        )
        return []

    monkeypatch.setattr(ai_generator, "_call_llm", fake_call_llm)

    result = ai_generator.generate_cards_topic(
        provider=object(),
        model_name="dummy-model",
        topic="Explain X",
        template_fields=[{"name": "prompt"}, {"name": "answer"}],
        custom_prompt="Do Y.",
        subject_context="Physics",
        target_card_count=5,
    )

    assert result == []
    assert captured["messages"] == [{"role": "user", "content": "Explain X"}]
    assert captured["field_names"] == ["prompt", "answer"]
    system = captured["system"]
    assert "exactly 5 cards" in system
    assert ai_generator.ENRICHMENT_HEADER in system
    assert "Do Y." in system


def test_topic_enrichment_has_no_slide_marking():
    fields = [{"name": "prompt"}, {"name": "answer"}]
    result = compose_topic_enrichment(["explanations"], "Mention units.", fields)

    assert "underlying mechanism" in result
    assert '"answer"' in result
    assert result.rstrip().endswith("Mention units.")
    assert "not in slides" not in result
    assert "provided content" not in result
    assert compose_topic_enrichment([], "  ", fields) == ""
