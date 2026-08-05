"""Security regressions: keyed-provider base_url repointing (H1) and
source_filename path traversal (H2).

Both are the same underlying gap: unauthenticated endpoints that trust
client-supplied strings and turn them into outbound requests or filesystem
paths.

H1: `PUT /api/providers/{id}` lets a caller repoint `base_url` on a provider
that already holds an encrypted API key, and `POST /api/providers/{id}/test`
/ `POST /api/providers/{id}/models` then forward that stored key to whatever
host the caller chose. Changing base_url on a keyed provider must be refused;
keyless local runtimes (Ollama, LM Studio) must still be repointable.

H2: `source_filename` is joined into UPLOAD_DIR and opened by the generation
pipeline, so `../../../etc/hosts` reads an arbitrary local file and sends its
contents to the LLM. Only real upload names (the `{sha256[:16]}{ext}` scheme
`notes.py` produces) may be used as paths.
"""

import os
import uuid

from fastapi.testclient import TestClient

from app.config import UPLOAD_DIR
from app.database import SessionLocal
from app.main import app
from app.models import CardTemplate, Provider


def _seed_keyed(tag: str) -> tuple[str, str]:
    """A provider with a stored key plus a template, for H1/H2 setup."""
    db = SessionLocal()
    provider = Provider(
        name=f"keyed-{tag}",
        provider_type="openai",
        base_url="https://api.openai.com/v1",
        api_key="sk-test-secret-key",
    )
    template = CardTemplate(
        name=f"tpl-{tag}", note_type="Basic", fields=[{"name": "prompt"}]
    )
    db.add_all([provider, template])
    db.commit()
    db.refresh(provider)
    db.refresh(template)
    provider_id, template_id = provider.id, template.id
    db.close()
    return provider_id, template_id


# --- H1: base_url must not be repointable on a provider that stores a key ---


def test_cannot_repoint_base_url_on_keyed_provider():
    tag = uuid.uuid4().hex[:8]
    provider_id, _ = _seed_keyed(tag)

    with TestClient(app) as c:
        r = c.put(
            f"/api/providers/{provider_id}", json={"base_url": "http://evil.example"}
        )

    assert r.status_code == 400
    db = SessionLocal()
    try:
        provider = db.query(Provider).filter(Provider.id == provider_id).first()
        assert provider.base_url == "https://api.openai.com/v1"
        assert provider.api_key_enc is not None
    finally:
        db.close()


def test_cannot_repoint_base_url_even_with_blank_key_in_same_request():
    tag = uuid.uuid4().hex[:8]
    provider_id, _ = _seed_keyed(tag)

    with TestClient(app) as c:
        r = c.put(
            f"/api/providers/{provider_id}",
            json={"base_url": "http://evil.example", "api_key": ""},
        )

    assert r.status_code == 400


def test_other_fields_still_updatable_on_keyed_provider():
    tag = uuid.uuid4().hex[:8]
    provider_id, _ = _seed_keyed(tag)

    with TestClient(app) as c:
        r = c.put(f"/api/providers/{provider_id}", json={"name": f"renamed-{tag}"})

    assert r.status_code == 200
    db = SessionLocal()
    try:
        provider = db.query(Provider).filter(Provider.id == provider_id).first()
        assert provider.name == f"renamed-{tag}"
        assert provider.base_url == "https://api.openai.com/v1"
    finally:
        db.close()


def test_keyless_provider_can_still_repoint_base_url():
    tag = uuid.uuid4().hex[:8]
    db = SessionLocal()
    provider = Provider(
        name=f"keyless-{tag}",
        provider_type="openai",
        base_url="http://localhost:11434",
    )
    db.add(provider)
    db.commit()
    db.refresh(provider)
    provider_id = provider.id
    db.close()

    with TestClient(app) as c:
        r = c.put(
            f"/api/providers/{provider_id}", json={"base_url": "http://localhost:1234"}
        )

    assert r.status_code == 200
    db = SessionLocal()
    try:
        provider = db.query(Provider).filter(Provider.id == provider_id).first()
        assert provider.base_url == "http://localhost:1234"
    finally:
        db.close()


# --- H2: source_filename must be an upload name, not an arbitrary path ---


def test_path_traversal_source_filename_rejected():
    tag = uuid.uuid4().hex[:8]
    provider_id, template_id = _seed_keyed(tag)

    # A real file outside UPLOAD_DIR, reachable from it with .. segments.
    sentinel = os.path.join(os.path.dirname(UPLOAD_DIR), f"secret-{tag}.txt")
    with open(sentinel, "w") as f:
        f.write("top secret")
    rel = os.path.relpath(sentinel, UPLOAD_DIR)

    with TestClient(app) as c:
        r = c.post(
            "/api/generate/from-file",
            json={
                "provider_id": provider_id,
                "model_name": "gpt-4o",
                "template_id": template_id,
                "source_filename": rel,
            },
        )

    assert r.status_code == 400


def test_non_upload_name_source_filename_rejected():
    tag = uuid.uuid4().hex[:8]
    provider_id, template_id = _seed_keyed(tag)
    # A real file in UPLOAD_DIR under a name the upload endpoint never
    # produces - the existence check alone must not make it acceptable.
    os.makedirs(UPLOAD_DIR, exist_ok=True)
    with open(os.path.join(UPLOAD_DIR, "slides-notes.pdf"), "wb") as f:
        f.write(b"pdf bytes")

    with TestClient(app) as c:
        r = c.post(
            "/api/generate/from-file",
            json={
                "provider_id": provider_id,
                "model_name": "gpt-4o",
                "template_id": template_id,
                "source_filename": "slides-notes.pdf",
            },
        )

    assert r.status_code == 400


def test_valid_upload_name_still_accepted():
    tag = uuid.uuid4().hex[:8]
    provider_id, template_id = _seed_keyed(tag)
    upload_name = "0123456789abcdef.pptx"
    os.makedirs(UPLOAD_DIR, exist_ok=True)
    with open(os.path.join(UPLOAD_DIR, upload_name), "wb") as f:
        f.write(b"pptx bytes")

    with TestClient(app) as c:
        r = c.post(
            "/api/generate/from-file",
            json={
                "provider_id": provider_id,
                "model_name": "gpt-4o",
                "template_id": template_id,
                "source_filename": upload_name,
            },
        )

    assert r.status_code == 200
