"""The list response must not ship every card of every generation.

`GET /api/generate` used to return `GenerationSchema`, whose `cards` field made
pydantic load the whole card table for every row just so History could render
`g.cards?.length` - which showed none of them. The list now returns a summary
(no cards, a real `card_count`), progress polling goes through a slim
`/status` endpoint, and the detail GET keeps carrying cards for the review
page. Cancellation semantics are pinned here too.
"""

import uuid

import pytest
from fastapi.testclient import TestClient

from app.database import SessionLocal
from app.main import app
from app.models import Card, CardTemplate, Generation, Provider


@pytest.fixture
def seeded():
    db = SessionLocal()
    tag = uuid.uuid4().hex[:8]
    provider = Provider(
        name=f"summary-probe-{tag}", provider_type="openai", base_url="http://x.invalid"
    )
    template = CardTemplate(
        name=f"summary-tpl-{tag}", note_type="Basic", fields=[{"name": "prompt"}]
    )
    db.add_all([provider, template])
    db.commit()
    yield provider, template
    db.close()


def _seed_gen(db, provider, template, *, status="completed", cards=0):
    g = Generation(
        source_type="text",
        source_text="hello",
        provider_id=provider.id,
        model_name="gpt-4o",
        template_id=template.id,
        status=status,
    )
    db.add(g)
    db.commit()
    for i in range(cards):
        db.add(
            Card(
                generation_id=g.id,
                fields={"prompt": f"q{i}"},
                selected=True,
                sort_order=float(i),
            )
        )
    g.cards_generated = cards
    db.commit()
    return g.id


def test_list_omits_cards_and_reports_count(seeded):
    provider, template = seeded
    gid = _seed_gen(SessionLocal(), provider, template, status="completed", cards=2)

    with TestClient(app) as c:
        rows = c.get("/api/generate").json()

    row = next(r for r in rows if r["id"] == gid)
    assert "cards" not in row
    assert row["card_count"] == 2


def test_status_endpoint_is_slim(seeded):
    provider, template = seeded
    gid = _seed_gen(SessionLocal(), provider, template, status="completed", cards=3)

    with TestClient(app) as c:
        r = c.get(f"/api/generate/{gid}/status")

    assert r.status_code == 200
    body = r.json()
    assert body["id"] == gid
    assert body["status"] == "completed"
    assert body["cards_generated"] == 3
    assert "cards" not in body


def test_detail_still_includes_cards(seeded):
    provider, template = seeded
    gid = _seed_gen(SessionLocal(), provider, template, status="completed", cards=2)

    with TestClient(app) as c:
        body = c.get(f"/api/generate/{gid}").json()

    assert "cards" in body
    assert len(body["cards"]) == 2


def test_cancel_running_generation(seeded):
    provider, template = seeded
    with TestClient(app) as c:
        # Seeded inside the context: startup reconcile would mark a `running`
        # row interrupted before the request gets a chance to cancel it.
        db = SessionLocal()
        try:
            gid = _seed_gen(db, provider, template, status="running")
        finally:
            db.close()

        r = c.post(f"/api/generate/{gid}/cancel")
        assert r.status_code == 200

        db = SessionLocal()
        try:
            gen = db.query(Generation).filter(Generation.id == gid).first()
            assert gen.status == "cancelled"
        finally:
            db.close()


def test_cancel_completed_generation_conflicts(seeded):
    provider, template = seeded
    gid = _seed_gen(SessionLocal(), provider, template, status="completed")

    with TestClient(app) as c:
        assert c.post(f"/api/generate/{gid}/cancel").status_code == 409


def test_cancel_missing_generation_404s():
    with TestClient(app) as c:
        assert c.post("/api/generate/no-such-id/cancel").status_code == 404


def test_cancelled_generation_can_be_deleted(seeded):
    provider, template = seeded
    with TestClient(app) as c:
        db = SessionLocal()
        try:
            gid = _seed_gen(db, provider, template, status="running")
        finally:
            db.close()
        c.post(f"/api/generate/{gid}/cancel")
        assert c.delete(f"/api/generate/{gid}").status_code == 200
