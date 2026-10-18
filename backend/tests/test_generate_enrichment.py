"""Generate endpoints must expand preset keys before persisting the run."""

import os
import uuid

from fastapi.testclient import TestClient

from app.config import UPLOAD_DIR
from app.database import SessionLocal
from app.main import app
from app.models import CardTemplate, Provider


def _seed(db):
    tag = uuid.uuid4().hex[:8]
    provider = Provider(
        name=f"probe-{tag}",
        provider_type="openai",
        base_url="http://x.invalid",
    )
    template = CardTemplate(
        name=f"probe-tpl-{tag}",
        note_type="Basic",
        fields=[
            {"name": "prompt", "label": "Front"},
            {"name": "answer", "label": "Back"},
        ],
    )
    db.add_all([provider, template])
    db.commit()
    return provider, template


def _payload(provider, template, **overrides):
    payload = {
        "provider_id": provider.id,
        "model_name": "gpt-4o",
        "template_id": template.id,
        "deck_name": "Default",
        "card_specs": ["explanations"],
        "custom_prompt": "Mention units.",
    }
    payload.update(overrides)
    return payload


def test_text_generation_stores_composed_enrichment(monkeypatch) -> None:
    import app.routers.generate as generate_router

    monkeypatch.setattr(generate_router, "_run_generation", lambda *args, **kwargs: None)

    db = SessionLocal()
    provider, template = _seed(db)

    with TestClient(app) as client:
        response = client.post(
            "/api/generate",
            json=_payload(provider, template, source_text="Bernoulli's equation"),
        )

    db.close()

    assert response.status_code == 200
    stored = response.json()["custom_prompt"]
    assert "underlying mechanism" in stored
    assert '"answer"' in stored
    assert stored.rstrip().endswith("Mention units.")


def test_from_file_generation_stores_composed_enrichment(monkeypatch) -> None:
    import app.routers.generate as generate_router

    monkeypatch.setattr(generate_router, "_run_generation", lambda *args, **kwargs: None)

    os.makedirs(UPLOAD_DIR, exist_ok=True)
    stored_name = f"{uuid.uuid4().hex[:16]}.txt"
    with open(os.path.join(UPLOAD_DIR, stored_name), "w", encoding="utf-8") as f:
        f.write("Bernoulli's equation")

    db = SessionLocal()
    provider, template = _seed(db)

    with TestClient(app) as client:
        response = client.post(
            "/api/generate/from-file",
            json=_payload(
                provider,
                template,
                source_filename=stored_name,
                source_title="Fluid mechanics",
            ),
        )

    db.close()

    assert response.status_code == 200
    stored = response.json()["custom_prompt"]
    assert "underlying mechanism" in stored
    assert '"answer"' in stored
