"""Replaying a generation must copy its stored config exactly.

The important halves are the custom prompt (already composed when the original
was saved, so it must not be composed again) and file reprocessing (otherwise
ProcessedSlide dedup makes the replay a no-op).
"""

import os
import uuid

import pytest
from fastapi.testclient import TestClient

from app.config import UPLOAD_DIR
from app.database import SessionLocal
from app.main import app
from app.models import CardTemplate, Generation, Provider


@pytest.fixture
def seeded():
    db = SessionLocal()
    tag = uuid.uuid4().hex[:8]
    provider = Provider(
        name=f"rerun-probe-{tag}", provider_type="openai", base_url="http://x.invalid"
    )
    template = CardTemplate(
        name=f"rerun-tpl-{tag}", note_type="Basic", fields=[{"name": "prompt"}]
    )
    db.add_all([provider, template])
    db.commit()
    yield provider, template
    db.close()


def _seed_gen(
    db,
    provider,
    template,
    *,
    source_type="text",
    source_text="hello",
    source_filename=None,
    custom_prompt=None,
):
    gen = Generation(
        title="Lecture 5",
        source_type=source_type,
        source_text=source_text,
        source_filename=source_filename,
        provider_id=provider.id,
        model_name="gpt-4o",
        template_id=template.id,
        deck_name="Biology",
        subject_context="Biology 101",
        custom_prompt=custom_prompt,
        dpi=200,
        max_workers=6,
        status="completed",
    )
    db.add(gen)
    db.commit()
    return gen.id


def test_text_rerun_copies_config_without_recomposing_prompt(seeded, monkeypatch):
    provider, template = seeded
    prompt = "already composed instructions\n\n- keep this exact"
    gid = _seed_gen(
        SessionLocal(), provider, template, source_text="notes", custom_prompt=prompt
    )

    calls = []
    monkeypatch.setattr(
        "app.routers.generate._run_generation",
        lambda generation_id, force: calls.append((generation_id, force)),
    )

    with TestClient(app) as c:
        response = c.post(f"/api/generate/{gid}/rerun")

    assert response.status_code == 200
    body = response.json()
    assert body["id"] != gid
    assert body["source_text"] == "notes"
    assert body["custom_prompt"] == prompt
    assert body["deck_name"] == "Biology"
    assert body["subject_context"] == "Biology 101"
    assert body["model_name"] == "gpt-4o"
    assert body["status"] == "pending"

    assert len(calls) == 1
    assert calls[0] == (body["id"], False)


def test_file_rerun_forces_reprocessing(seeded, monkeypatch):
    provider, template = seeded
    os.makedirs(UPLOAD_DIR, exist_ok=True)
    stored_name = f"{uuid.uuid4().hex[:16]}.pdf"
    path = os.path.join(UPLOAD_DIR, stored_name)
    with open(path, "wb") as handle:
        handle.write(b"%PDF-1.4 test")

    try:
        gid = _seed_gen(
            SessionLocal(),
            provider,
            template,
            source_type="file",
            source_text=None,
            source_filename=stored_name,
        )

        calls = []
        monkeypatch.setattr(
            "app.routers.generate._run_generation",
            lambda generation_id, force: calls.append((generation_id, force)),
        )

        with TestClient(app) as c:
            response = c.post(f"/api/generate/{gid}/rerun")

        assert response.status_code == 200
        body = response.json()
        assert body["source_filename"] == stored_name
        assert len(calls) == 1
        assert calls[0] == (body["id"], True)
    finally:
        os.unlink(path)


def test_rerun_rejects_missing_upload(seeded, monkeypatch):
    provider, template = seeded
    stored_name = f"{uuid.uuid4().hex[:16]}.pdf"
    gid = _seed_gen(
        SessionLocal(),
        provider,
        template,
        source_type="file",
        source_text=None,
        source_filename=stored_name,
    )

    monkeypatch.setattr("app.routers.generate._run_generation", lambda *args: None)

    with TestClient(app) as c:
        response = c.post(f"/api/generate/{gid}/rerun")

    assert response.status_code == 400
    assert "no longer available" in response.json()["detail"]


def test_rerun_missing_generation_404s(monkeypatch):
    monkeypatch.setattr("app.routers.generate._run_generation", lambda *args: None)
    with TestClient(app) as c:
        assert c.post("/api/generate/no-such-id/rerun").status_code == 404
