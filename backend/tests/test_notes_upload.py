"""`POST /api/notes/upload` must stream, cap, and not leak the server path.

The old handler did `await file.read()` with no size cap - a large upload was a
memory spike nothing could stop - then hashed the same bytes twice, used
`SessionLocal` directly, and returned the server-side `filepath` to the
browser. `UPLOAD_DIR` is a content-hash store, so an oversized upload must
leave no partial file behind either.
"""

import os

from fastapi.testclient import TestClient

from app.config import UPLOAD_DIR
from app.main import app


def test_upload_stores_file_and_omits_filepath():
    with TestClient(app) as c:
        r = c.post(
            "/api/notes/upload",
            files={"file": ("notes.txt", b"hello world", "text/plain")},
        )

    assert r.status_code == 200
    body = r.json()
    assert "filepath" not in body
    assert body["stored_filename"].endswith(".txt")
    stored = os.path.join(UPLOAD_DIR, body["stored_filename"])
    assert os.path.isfile(stored)
    with open(stored) as f:
        assert f.read() == "hello world"


def test_upload_rejects_oversized_file_and_leaves_nothing_behind(monkeypatch):
    from app.routers import notes

    monkeypatch.setattr(notes, "MAX_UPLOAD_MB", 1)
    monkeypatch.setattr(notes, "MAX_UPLOAD_BYTES", 1024)

    with TestClient(app) as c:
        r = c.post(
            "/api/notes/upload",
            files={"file": ("notes.txt", b"x" * 2048, "text/plain")},
        )

    assert r.status_code == 413
    big = [
        f for f in os.listdir(UPLOAD_DIR)
        if os.path.getsize(os.path.join(UPLOAD_DIR, f)) >= 2048
    ]
    assert big == []
