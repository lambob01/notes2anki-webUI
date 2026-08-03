"""Deleting a generation must remove its files - but not shared ones.

`delete_generation` used to drop the row and cascade to cards while leaving
`SLIDES_DIR/{id}/` and the exports on disk forever.

The upload is the dangerous half. Uploads are stored under a content-hash
filename, so re-running the same lecture reuses one file across many
generations (on the dev DB: 25 generations over 4 uploads, one referenced 20
times). Deleting it while another generation still points at it would break
every one of them, so it is refcounted.
"""

import os
import uuid

import pytest
from fastapi.testclient import TestClient

from app.config import EXPORT_DIR, SLIDES_DIR, UPLOAD_DIR
from app.database import SessionLocal
from app.main import app
from app.models import CardTemplate, Generation, Provider


@pytest.fixture
def seeded():
    """Two generations sharing one upload, each with its own slides/exports."""
    db = SessionLocal()
    # CardTemplate.name is unique, and the fixture runs once per test against
    # one shared temp database, so the seed data has to be unique too.
    tag = uuid.uuid4().hex[:8]
    provider = Provider(name=f"probe-{tag}", provider_type="openai", base_url="http://x.invalid")
    template = CardTemplate(
        name=f"probe-tpl-{tag}", note_type="Basic", fields=[{"name": "prompt"}]
    )
    db.add_all([provider, template])
    db.commit()

    shared_upload = f"shared-upload-{tag}.pptx"
    gens = []
    for _ in range(2):
        g = Generation(
            source_type="file",
            source_filename=shared_upload,
            provider_id=provider.id,
            model_name="gpt-4o",
            template_id=template.id,
            status="completed",
        )
        db.add(g)
        db.commit()
        gens.append(g.id)

    os.makedirs(UPLOAD_DIR, exist_ok=True)
    os.makedirs(EXPORT_DIR, exist_ok=True)
    upload_path = os.path.join(UPLOAD_DIR, shared_upload)
    with open(upload_path, "wb") as f:
        f.write(b"pptx bytes")

    artifacts = {}
    for gid in gens:
        slide_dir = os.path.join(SLIDES_DIR, gid)
        os.makedirs(slide_dir, exist_ok=True)
        with open(os.path.join(slide_dir, "0.jpg"), "wb") as f:
            f.write(b"jpeg")
        apkg = os.path.join(EXPORT_DIR, f"{gid}.apkg")
        with open(apkg, "wb") as f:
            f.write(b"zip")
        artifacts[gid] = (slide_dir, apkg)

    yield gens, upload_path, artifacts
    db.close()


def test_delete_removes_slides_and_exports(seeded):
    gens, _, artifacts = seeded
    slide_dir, apkg = artifacts[gens[0]]
    assert os.path.isdir(slide_dir) and os.path.isfile(apkg)

    with TestClient(app) as c:
        assert c.delete(f"/api/generate/{gens[0]}").status_code == 200

    assert not os.path.exists(slide_dir)
    assert not os.path.exists(apkg)


def test_shared_upload_survives_while_another_generation_needs_it(seeded):
    gens, upload_path, artifacts = seeded

    with TestClient(app) as c:
        assert c.delete(f"/api/generate/{gens[0]}").status_code == 200

    # The second generation still points at it.
    assert os.path.isfile(upload_path), "shared upload deleted while still referenced"
    # ...and its own artifacts are untouched.
    other_slides, other_apkg = artifacts[gens[1]]
    assert os.path.isdir(other_slides)
    assert os.path.isfile(other_apkg)


def test_upload_is_removed_once_the_last_referrer_goes(seeded):
    gens, upload_path, _ = seeded

    with TestClient(app) as c:
        c.delete(f"/api/generate/{gens[0]}")
        assert os.path.isfile(upload_path)
        c.delete(f"/api/generate/{gens[1]}")

    assert not os.path.exists(upload_path)


def test_delete_of_missing_generation_still_404s():
    with TestClient(app) as c:
        assert c.delete("/api/generate/no-such-id").status_code == 404
