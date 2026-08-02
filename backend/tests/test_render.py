"""The stateless /api/render endpoint.

This is the only server-side piece the client-side app depends on, so its
contract matters more than most: the browser is unable to do this work itself
and has no fallback if the shape changes.

The invariant these guard hardest is that nothing survives the request - no
uploads, no rendered slides, no temp directories. A leak there turns a service
that holds nothing into one that accumulates other people's lecture notes.
"""

from __future__ import annotations

import base64
import glob
import tempfile
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)


def _pdf_bytes(pages: int = 3) -> bytes:
    """A real multi-page PDF, rendered by the same library the endpoint uses."""
    import fitz

    doc = fitz.open()
    for i in range(pages):
        page = doc.new_page()
        # Long enough that _is_title_or_blank doesn't treat early pages as
        # title slides and skip them.
        page.insert_text(
            (72, 100),
            f"Page {i} covers thermodynamic equilibrium and the governing "
            f"rate equations in detail.",
            fontsize=11,
        )
    data = doc.tobytes()
    doc.close()
    return data


def test_rejects_unsupported_extension() -> None:
    res = client.post(
        "/api/render", files={"file": ("notes.exe", b"MZ...", "application/octet-stream")}
    )

    assert res.status_code == 400
    assert "Unsupported file type" in res.json()["detail"]


def test_rejects_out_of_range_dpi() -> None:
    """An unauthenticated endpoint must not let a caller pick the memory cost."""
    res = client.post(
        "/api/render",
        files={"file": ("deck.pdf", _pdf_bytes(1), "application/pdf")},
        data={"dpi": "10000"},
    )

    assert res.status_code == 400
    assert "dpi" in res.json()["detail"]


def test_rejects_oversized_upload(monkeypatch) -> None:
    from app.routers import render as render_router

    monkeypatch.setattr(render_router, "MAX_UPLOAD_BYTES", 1024)

    res = client.post(
        "/api/render",
        files={"file": ("deck.pdf", b"x" * 5000, "application/pdf")},
    )

    assert res.status_code == 413


def test_renders_a_pdf_to_one_image_per_page() -> None:
    res = client.post(
        "/api/render",
        files={"file": ("lecture.pdf", _pdf_bytes(3), "application/pdf")},
        data={"skip_title_blank": "false"},
    )

    assert res.status_code == 200
    body = res.json()
    assert body["filename"] == "lecture.pdf"
    assert body["slide_count"] == 3
    assert [s["index"] for s in body["slides"]] == [0, 1, 2]
    assert "thermodynamic equilibrium" in body["text"]

    for slide in body["slides"]:
        image = base64.b64decode(slide["image_b64"])
        assert slide["media_type"] == "image/jpeg"
        # A real JPEG, not an empty or truncated buffer.
        assert image[:2] == b"\xff\xd8"
        assert len(image) > 1000


def test_text_file_yields_text_and_no_slides() -> None:
    """.txt/.md have nothing to rasterize; the browser generates from text."""
    res = client.post(
        "/api/render",
        files={"file": ("notes.md", b"# Kinetics\n\nRate laws.", "text/markdown")},
    )

    assert res.status_code == 200
    body = res.json()
    assert body["slides"] == []
    assert body["slide_count"] == 0
    assert "Kinetics" in body["text"]


def test_client_filename_is_never_used_as_a_path() -> None:
    """The filename is attacker-supplied; only its extension may be trusted."""
    res = client.post(
        "/api/render",
        files={
            "file": (
                "../../../../tmp/notes2anki_escape.pdf",
                _pdf_bytes(1),
                "application/pdf",
            )
        },
        data={"skip_title_blank": "false"},
    )

    assert res.status_code == 200
    assert not Path("/tmp/notes2anki_escape.pdf").exists()


def test_request_leaves_nothing_on_disk() -> None:
    """The whole security argument for this endpoint is that it stores nothing."""
    pattern = str(Path(tempfile.gettempdir()) / "notes2anki_render_*")
    before = set(glob.glob(pattern))

    res = client.post(
        "/api/render",
        files={"file": ("lecture.pdf", _pdf_bytes(2), "application/pdf")},
        data={"skip_title_blank": "false"},
    )

    assert res.status_code == 200
    assert set(glob.glob(pattern)) == before


@pytest.mark.skipif(
    __import__("app.services.document_reader", fromlist=["DocumentReader"])
    .DocumentReader.find_libreoffice()
    is None,
    reason="LibreOffice not installed; the PPTX vision path cannot be exercised",
)
def test_renders_a_real_pptx_via_libreoffice() -> None:
    """The reason this endpoint exists at all.

    A browser can rasterize a PDF by itself. PPTX is the format that genuinely
    needs a server, so if this path breaks there is no client-side fallback.
    """
    deck = Path(__file__).resolve().parents[2] / "example files" / (
        "CE10232 - TCA - 5 - Biology.pptx"
    )
    if not deck.exists():
        pytest.skip("sample deck not present")

    res = client.post(
        "/api/render",
        files={
            "file": (
                deck.name,
                deck.read_bytes(),
                "application/vnd.openxmlformats-officedocument.presentationml.presentation",
            )
        },
    )

    assert res.status_code == 200
    body = res.json()
    assert body["slide_count"] > 0

    first = base64.b64decode(body["slides"][0]["image_b64"])
    assert first[:2] == b"\xff\xd8"
    # LibreOffice produced a real rendering, not the blank-page fallback.
    assert len(first) > 10_000
