from __future__ import annotations

import hashlib
import os
import uuid

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from sqlalchemy.orm import Session

from app.config import UPLOAD_DIR
from app.database import get_db
from app.models import ProcessedSlide

router = APIRouter()

SUPPORTED_EXTENSIONS = {
    ".txt", ".md", ".pdf", ".docx", ".pptx",
    ".png", ".jpg", ".jpeg", ".bmp", ".gif", ".webp",
}

# Uploads are unauthenticated inputs whose only cost is disk, so they are
# bounded the way `/api/render` bounds them: stream to disk, abort at the cap.
MAX_UPLOAD_MB = int(os.getenv("MAX_UPLOAD_MB", "150"))
MAX_UPLOAD_BYTES = MAX_UPLOAD_MB * 1024 * 1024
_CHUNK = 1 << 20


def _is_supported(filename: str) -> bool:
    ext = os.path.splitext(filename)[1].lower()
    return ext in SUPPORTED_EXTENSIONS


@router.post("/upload")
async def upload_notes(file: UploadFile = File(...), db: Session = Depends(get_db)):
    if not file.filename or not _is_supported(file.filename):
        raise HTTPException(
            400,
            f"Unsupported file type. Supported: {', '.join(sorted(SUPPORTED_EXTENSIONS))}",
        )

    # The old handler did `await file.read()` with no cap - a large upload was
    # a memory spike nothing could stop - then hashed the same bytes twice.
    # Streaming to a temp file gives one pass that yields both the stored-name
    # digest (sha256[:16]) and the full dedup digest, and a mid-stream 413
    # leaves nothing behind: the temp file is unlinked and never renamed.
    ext = os.path.splitext(file.filename)[1].lower()
    os.makedirs(UPLOAD_DIR, exist_ok=True)
    tmp = os.path.join(UPLOAD_DIR, f".upload-{uuid.uuid4().hex}")
    digest = hashlib.sha256()
    size = 0
    try:
        with open(tmp, "wb") as f:
            while chunk := await file.read(_CHUNK):
                size += len(chunk)
                if size > MAX_UPLOAD_BYTES:
                    raise HTTPException(
                        413, f"File is larger than the {MAX_UPLOAD_MB}MB limit."
                    )
                digest.update(chunk)
                f.write(chunk)
        full_digest = digest.hexdigest()
        filename = f"{full_digest[:16]}{ext}"
        os.replace(tmp, os.path.join(UPLOAD_DIR, filename))
    finally:
        if os.path.exists(tmp):
            os.remove(tmp)

    # The generation pipeline dedups on the full SHA-256 of the file, so
    # report whether this exact file already went through, letting the UI
    # warn before the user starts a job that would skip every slide.
    processed_count = (
        db.query(ProcessedSlide)
        .filter(ProcessedSlide.file_digest == full_digest)
        .count()
    )

    return {
        "filename": file.filename,
        "stored_filename": filename,
        "size_bytes": size,
        "extension": ext,
        "is_text_file": ext in {".txt", ".md"},
        "already_processed": processed_count > 0,
        "processed_slides": processed_count,
    }
