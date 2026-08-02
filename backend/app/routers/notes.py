from __future__ import annotations

import os
import hashlib
from fastapi import APIRouter, UploadFile, File, Form, Depends, HTTPException

from app.config import UPLOAD_DIR

router = APIRouter()

SUPPORTED_EXTENSIONS = {
    ".txt", ".md", ".pdf", ".docx", ".pptx",
    ".png", ".jpg", ".jpeg", ".bmp", ".gif", ".webp",
}


def _is_supported(filename: str) -> bool:
    ext = os.path.splitext(filename)[1].lower()
    return ext in SUPPORTED_EXTENSIONS


@router.post("/upload")
async def upload_notes(file: UploadFile = File(...)):
    if not file.filename or not _is_supported(file.filename):
        raise HTTPException(
            400,
            f"Unsupported file type. Supported: {', '.join(sorted(SUPPORTED_EXTENSIONS))}",
        )

    content = await file.read()
    digest = hashlib.sha256(content).hexdigest()[:16]
    ext = os.path.splitext(file.filename)[1].lower()
    filename = f"{digest}{ext}"
    filepath = os.path.join(UPLOAD_DIR, filename)

    with open(filepath, "wb") as f:
        f.write(content)

    # The generation pipeline dedups on the full SHA-256 of the file, so
    # report whether this exact file already went through, letting the UI
    # warn before the user starts a job that would skip every slide.
    from app.database import SessionLocal
    from app.models import ProcessedSlide

    full_digest = hashlib.sha256(content).hexdigest()
    db = SessionLocal()
    try:
        processed_count = (
            db.query(ProcessedSlide)
            .filter(ProcessedSlide.file_digest == full_digest)
            .count()
        )
    finally:
        db.close()

    file_size = len(content)
    is_text_file = ext in {".txt", ".md"}

    return {
        "filename": file.filename,
        "stored_filename": filename,
        "filepath": filepath,
        "size_bytes": file_size,
        "extension": ext,
        "is_text_file": is_text_file,
        "already_processed": processed_count > 0,
        "processed_slides": processed_count,
    }
