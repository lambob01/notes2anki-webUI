"""Clear-history behaviour: per-item delete must forget a file's dedup rows.

`ProcessedSlide` rows survive generation deletion, so deleting the only
generation for a lecture and re-uploading the same file silently produced
zero cards (`skipped_all_duplicates`). The dedup set must be reset when the
generation being deleted was the last referrer of its upload.
"""

import os
import uuid

from fastapi.testclient import TestClient

from app.config import SLIDES_DIR, UPLOAD_DIR
from app.database import SessionLocal
from app.main import app
from app.models import CardTemplate, Generation, ProcessedSlide, Provider


def _seed(tag, statuses):
    """A provider/template plus one generation per given status, each with an
    upload, slide dir, and ProcessedSlide row for that upload's name."""
    db = SessionLocal()
    provider = Provider(name=f"prov-{tag}", provider_type="openai", base_url="http://x.invalid")
    template = CardTemplate(name=f"tpl-{tag}", note_type="Basic", fields=[{"name": "prompt"}])
    db.add_all([provider, template])
    db.commit()
    db.refresh(provider)
    db.refresh(template)

    os.makedirs(UPLOAD_DIR, exist_ok=True)
    os.makedirs(SLIDES_DIR, exist_ok=True)

    gens = []
    for i, status in enumerate(statuses):
        upload = f"{tag}-{i:04d}abcdef00.pptx"
        upload_path = os.path.join(UPLOAD_DIR, upload)
        with open(upload_path, "wb") as f:
            f.write(b"pptx bytes")

        g = Generation(
            source_type="file",
            source_filename=upload,
            provider_id=provider.id,
            model_name="gpt-4o",
            template_id=template.id,
            status=status,
        )
        db.add(g)
        db.commit()
        db.refresh(g)

        slide_dir = os.path.join(SLIDES_DIR, g.id)
        os.makedirs(slide_dir, exist_ok=True)
        with open(os.path.join(slide_dir, "0.jpg"), "wb") as f:
            f.write(b"jpeg")

        db.add(ProcessedSlide(file_digest=f"digest-{tag}-{i}", slide_index=0, source_filename=upload))
        gens.append((g.id, upload))

    db.commit()
    db.close()
    return gens


def test_delete_last_referrer_clears_that_files_dedup():
    tag = uuid.uuid4().hex[:8]
    gen_id, upload = _seed(tag, ["completed"])[0]

    with TestClient(app) as c:
        assert c.delete(f"/api/generate/{gen_id}").status_code == 200

    db = SessionLocal()
    try:
        remaining = db.query(ProcessedSlide).filter(
            ProcessedSlide.source_filename == upload
        ).count()
        assert remaining == 0
    finally:
        db.close()


def test_delete_keeps_dedup_when_upload_still_referenced():
    tag = uuid.uuid4().hex[:8]
    gens = _seed(tag, ["completed", "completed"])
    # Give both generations the same upload so the first delete is not the
    # last referrer.
    db = SessionLocal()
    try:
        second = db.query(Generation).filter(Generation.id == gens[1][0]).first()
        second.source_filename = gens[0][1]
        db.commit()
    finally:
        db.close()

    with TestClient(app) as c:
        assert c.delete(f"/api/generate/{gens[0][0]}").status_code == 200

    db = SessionLocal()
    try:
        remaining = db.query(ProcessedSlide).filter(
            ProcessedSlide.source_filename == gens[0][1]
        ).count()
        assert remaining == 1  # the row for the still-referenced upload's file
    finally:
        db.close()
