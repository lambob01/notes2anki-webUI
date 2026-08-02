"""Stateless document rendering.

The one thing the browser cannot do for itself. A `.pptx` needs LibreOffice to
become a faithful image - diagrams, equations and layout all live in the
rendering, which is exactly what the vision model reads - and there is no
browser equivalent. So this endpoint exists, and nothing else here does.

**It keeps nothing.** The upload lands in a temp directory that is deleted
before the response is sent; there is no database, no stored slides, no record
that the request happened. That is the entire security posture: reaching this
endpoint gets you a PowerPoint converted, not an API key, a deck, or a
credential. See "Client-side direction" in PLAN.md.

Everything downstream - the LLM calls, storage, review, export - happens in the
browser with the user's own key, which is why this endpoint takes no key and
makes no outbound requests of its own.
"""

from __future__ import annotations

import base64
import os
from pathlib import Path
from tempfile import TemporaryDirectory

from fastapi import APIRouter, File, Form, HTTPException, UploadFile
from starlette.concurrency import run_in_threadpool

from app.services.document_reader import DocumentReader

router = APIRouter()

SUPPORTED_EXTENSIONS = {
    ".txt", ".md", ".pdf", ".docx", ".pptx",
    ".png", ".jpg", ".jpeg", ".bmp", ".gif", ".webp",
}

# This endpoint is unauthenticated by design, so every input that costs CPU or
# memory is bounded. A caller cannot make the box render a 10000-DPI deck.
MAX_UPLOAD_MB = int(os.getenv("MAX_UPLOAD_MB", "150"))
MAX_UPLOAD_BYTES = MAX_UPLOAD_MB * 1024 * 1024
MIN_DPI, MAX_DPI = 72, 300
_CHUNK = 1 << 20


def _media_type(image_bytes: bytes) -> str:
    """PNG or JPEG. The PPTX text fallback emits PNG, every other path JPEG."""
    return "image/png" if image_bytes[:8] == b"\x89PNG\r\n\x1a\n" else "image/jpeg"


async def _save_within_limit(upload: UploadFile, dest: Path) -> int:
    """Stream the upload to disk, aborting if it exceeds the cap.

    Deliberately not `await upload.read()` - that materializes the whole file in
    memory before anything can check its size, so a large upload is a memory
    spike no limit can catch after the fact.
    """
    size = 0
    with open(dest, "wb") as f:
        while chunk := await upload.read(_CHUNK):
            size += len(chunk)
            if size > MAX_UPLOAD_BYTES:
                raise HTTPException(
                    413, f"File is larger than the {MAX_UPLOAD_MB}MB limit."
                )
            f.write(chunk)
    return size


def _read_document(path: Path, dpi: int, skip_title_blank: bool) -> tuple[str, list]:
    """Extract text and render slides. Runs in a worker thread - see below."""
    reader = DocumentReader(str(path))
    text = reader.extract_text()
    # .txt/.md have no slides to render; the browser generates from text alone.
    slides = [] if reader.is_text() else reader.render_slides(
        dpi=dpi, skip_title_blank=skip_title_blank
    )
    return text, slides


@router.post("")
async def render_document(
    file: UploadFile = File(...),
    dpi: int = Form(150),
    skip_title_blank: bool = Form(True),
):
    """Convert a document into per-slide images plus its text.

    The response carries base64 images inline rather than URLs, because a URL
    would mean keeping the file - which is the one thing this service must not
    do. That makes the response large (a 60-slide deck runs to double-digit
    megabytes); it is a single JSON body today, and streaming is the obvious
    change if that becomes a problem.

    `text` is the whole document's extracted text, which the browser feeds to
    the global-context "syllabus" pass before generating per-slide cards.
    """
    if not file.filename:
        raise HTTPException(400, "No filename supplied.")

    ext = Path(file.filename).suffix.lower()
    if ext not in SUPPORTED_EXTENSIONS:
        raise HTTPException(
            400,
            f"Unsupported file type '{ext}'. Supported: "
            f"{', '.join(sorted(SUPPORTED_EXTENSIONS))}",
        )

    if not MIN_DPI <= dpi <= MAX_DPI:
        raise HTTPException(400, f"dpi must be between {MIN_DPI} and {MAX_DPI}.")

    with TemporaryDirectory(prefix="notes2anki_render_") as tmp:
        # The client's filename is never used as a path: it is attacker-supplied
        # and would be a traversal. Only the extension is carried over, since
        # DocumentReader dispatches on it. A fixed stem also keeps LibreOffice's
        # "{stem}.pdf" output name predictable.
        path = Path(tmp) / f"document{ext}"
        await _save_within_limit(file, path)

        # render_slides shells out to LibreOffice and rasterizes with PyMuPDF -
        # seconds to minutes of blocking work. On the event loop that would
        # stall every other request for the duration.
        text, slides = await run_in_threadpool(
            _read_document, path, dpi, skip_title_blank
        )

        return {
            "filename": file.filename,
            "slide_count": len(slides),
            "text": text,
            "slides": [
                {
                    "index": s.index,
                    "notes": s.notes,
                    "media_type": _media_type(s.image_bytes),
                    "image_b64": base64.b64encode(s.image_bytes).decode("ascii"),
                }
                for s in slides
            ],
        }
    # TemporaryDirectory has removed the upload and every intermediate by here.
