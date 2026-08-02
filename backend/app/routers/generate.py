from __future__ import annotations

import hashlib
import os
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException, BackgroundTasks
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session
from sqlalchemy import update

from app.database import get_db, generate_uuid
from app.models import Provider, ProviderModel, CardTemplate, Generation, Card, ProcessedSlide
from app.schemas import GenerateRequest, GenerationSchema
from app.config import UPLOAD_DIR, HISTORY_DIR, SLIDES_DIR
from app.services.document_reader import DocumentReader, DocumentSlide
from app.llm.base import FatalProviderError, ProviderConfig
from app.services.ai_generator import (
    generate_cards_text,
    generate_cards_vision,
    generate_global_context,
    AiError,
)
import json

router = APIRouter()

SUPPORTED_EXTENSIONS = {
    ".txt", ".md", ".pdf", ".docx", ".pptx",
    ".png", ".jpg", ".jpeg", ".bmp", ".gif", ".webp",
}


def _file_digest(filepath: str) -> str:
    h = hashlib.sha256()
    with open(filepath, "rb") as f:
        while chunk := f.read(8192):
            h.update(chunk)
    return h.hexdigest()


def _is_slide_processed(db: Session, file_digest: str, slide_index: int) -> bool:
    return db.query(ProcessedSlide).filter(
        ProcessedSlide.file_digest == file_digest,
        ProcessedSlide.slide_index == slide_index,
    ).count() > 0


def _mark_slide_processed(db: Session, file_digest: str, slide_index: int, source_filename: str):
    existing = db.query(ProcessedSlide).filter(
        ProcessedSlide.file_digest == file_digest,
        ProcessedSlide.slide_index == slide_index,
    ).first()
    if not existing:
        ps = ProcessedSlide(
            file_digest=file_digest,
            slide_index=slide_index,
            source_filename=source_filename,
        )
        db.add(ps)
        db.commit()


# A live job commits progress (bumping `updated_at`) at least once per slide,
# and a slide's worst case is a full 3-attempt retry cycle. Anything quiet
# longer than this has no live task behind it.
STALE_RUN_MINUTES = 10


def _reap_stale_running(db: Session) -> None:
    """Fail a run whose background task has silently died.

    A background task that dies without raising (killed thread, interpreter
    quirk) leaves its row `running` forever, and the review page polls a
    phantom "Generating..." that never resolves. Any `running`/`pending` row
    untouched for STALE_RUN_MINUTES has no live task - the task updates the
    row at least once per slide - so mark it failed and let the user re-run.
    """
    import datetime as dt

    cutoff = dt.datetime.utcnow() - dt.timedelta(minutes=STALE_RUN_MINUTES)
    stale = (
        db.query(Generation)
        .filter(
            Generation.status.in_(["running", "pending"]),
            Generation.updated_at < cutoff,
        )
        .all()
    )
    if not stale:
        return
    for gen in stale:
        gen.status = "failed"
        gen.phase = "failed"
        gen.completed_at = dt.datetime.utcnow()
        gen.error_message = (
            f"Generation stopped unexpectedly - no progress for "
            f"{STALE_RUN_MINUTES} minutes. Run it again; slides already "
            "processed are skipped."
        )
    db.commit()


def _persist_json_mode_tier(db: Session, provider: Provider, cfg: ProviderConfig) -> None:
    """Write back a structured-output tier the run negotiated.

    Workers record a downgrade on the detached snapshot rather than on the ORM
    row, so it has to be copied across once the fan-out is done. Worth doing
    even when the run failed: it's a real answer from the provider about what
    it accepts, and re-learning it costs a 400 on every slide of the next job.

    Runs in a `finally`, so it must never raise - a broken Session here would
    replace the exception that actually failed the generation with a confusing
    database error.
    """
    try:
        if cfg.json_mode_tier != provider.json_mode_tier:
            provider.json_mode_tier = cfg.json_mode_tier
            db.commit()
    except Exception:
        import logging

        logging.getLogger(__name__).warning(
            "Could not persist json_mode_tier for provider %s", provider.id,
            exc_info=True,
        )
        db.rollback()


def _run_generation(generation_id: str, force: bool = False):
    from app.database import SessionLocal
    import datetime as dt
    db = SessionLocal()
    try:
        gen = db.query(Generation).filter(Generation.id == generation_id).first()
        if not gen:
            return

        gen.status = "running"
        gen.phase = "starting"
        gen.total_slides = 0
        gen.completed_slides = 0
        gen.cards_generated = 0
        gen.failed_slides = 0
        gen.error_message = None
        db.commit()

        provider = db.query(Provider).filter(Provider.id == gen.provider_id).first()
        if not provider:
            gen.status = "failed"
            gen.error_message = "Provider not found"
            db.commit()
            return

        template = db.query(CardTemplate).filter(CardTemplate.id == gen.template_id).first()
        if not template:
            gen.status = "failed"
            gen.error_message = "Card template not found"
            db.commit()
            return

        template_fields = template.fields or []

        # Snapshot the provider *here*, on the thread that owns `db`. The slide
        # fan-out below calls the LLM from worker threads while this thread
        # commits progress, and each commit expires the ORM instance - so a
        # worker reading `provider.api_key` off the row would lazy-load it,
        # running SQL on this Session from another thread. See ProviderConfig.
        provider_cfg = ProviderConfig.from_row(provider)

        try:
            if gen.source_text:
                _process_text(db, gen, provider_cfg, gen.model_name, template_fields)
            elif gen.source_filename:
                _process_file(
                    db, gen, provider_cfg, gen.model_name, template_fields, force=force
                )
        finally:
            _persist_json_mode_tier(db, provider, provider_cfg)

        gen.status = "completed"
        # Preserve a phase the processor set deliberately (e.g. the
        # all-duplicates skip), which explains a zero-card result.
        if gen.phase != "skipped_all_duplicates":
            gen.phase = "done"
        gen.completed_at = dt.datetime.utcnow()
        db.commit()
    except Exception as e:
        gen.status = "failed"
        gen.phase = "failed"
        gen.error_message = str(e)
        db.commit()
    finally:
        db.close()


def _process_text(db, gen, provider: ProviderConfig, model_name, template_fields):
    # Text is one unit of work, so the bar goes 0 -> 1 rather than per-slide.
    gen.phase = "generating"
    gen.total_slides = 1
    gen.completed_slides = 0
    db.commit()

    cards = generate_cards_text(
        provider=provider,
        model_name=model_name,
        text=gen.source_text,
        template_fields=template_fields,
        custom_prompt=gen.custom_prompt,
        subject_context=gen.subject_context,
    )
    for i, card_data in enumerate(cards):
        card = Card(
            generation_id=gen.id,
            slide_index=i,
            fields=card_data,
            selected=True,
            sort_order=float(i),
        )
        db.add(card)
    gen.cards_generated = len(cards)
    gen.completed_slides = 1
    db.commit()


def _process_file(
    db, gen, provider: ProviderConfig, model_name, template_fields, force: bool = False
):
    filepath = os.path.join(UPLOAD_DIR, gen.source_filename)
    if not os.path.exists(filepath):
        raise Exception(f"File not found: {filepath}")

    reader = DocumentReader(filepath)
    digest = _file_digest(filepath)

    if reader.is_text():
        text = reader.extract_text()
        gen.source_text = text
        db.commit()
        _process_text(db, gen, provider, model_name, template_fields)
        return

    document_text = reader.extract_text()
    global_context = ""
    if document_text.strip():
        gen.phase = "analyzing"
        db.commit()
        try:
            global_context = generate_global_context(provider, model_name, document_text)
        except AiError:
            pass

    # Rendering a large PPTX runs LibreOffice and can take a while; surface it
    # so the UI isn't a blank "generating" for the duration.
    gen.phase = "rendering"
    db.commit()
    slides = reader.render_slides(dpi=gen.dpi, skip_title_blank=True)

    pending_slides = list(slides) if force else [
        slide for slide in slides
        if not _is_slide_processed(db, digest, slide.index)
    ]

    # Stash the rendered slide images next to the job so the review page can
    # show each card's source slide and exports can embed it. Only pending
    # slides get cards, so only those are worth keeping.
    slide_dir = os.path.join(SLIDES_DIR, gen.id)
    os.makedirs(slide_dir, exist_ok=True)
    for slide in pending_slides:
        with open(os.path.join(slide_dir, f"{slide.index}.jpg"), "wb") as f:
            f.write(slide.image_bytes)

    if not pending_slides:
        # Every slide is in processed_slides from an earlier run of this exact
        # file. Say so - otherwise the job just completes with zero cards and
        # looks like the generator silently did nothing.
        gen.phase = "skipped_all_duplicates"
        gen.total_slides = 0
        gen.error_message = (
            f"All {len(slides)} slide(s) in this file were already processed in "
            "a previous run, so no new cards were generated. Enable "
            "'Re-process already processed slides' and run it again to force "
            "a fresh pass."
        )
        db.commit()
        return

    gen.total_slides = len(pending_slides)
    gen.completed_slides = 0
    gen.phase = "generating"
    db.commit()

    max_workers = min(gen.max_workers, max(len(pending_slides), 1))
    card_order = 0

    with ThreadPoolExecutor(max_workers=max_workers) as executor:
        futures = {}
        for slide in pending_slides:
            future = executor.submit(
                generate_cards_vision,
                provider=provider,
                model_name=model_name,
                image_bytes=slide.image_bytes,
                notes=slide.notes,
                source_filename=reader.path.name,
                slide_index=slide.index,
                template_fields=template_fields,
                custom_prompt=gen.custom_prompt,
                subject_context=gen.subject_context,
                global_context=global_context,
            )
            futures[future] = slide

        fatal: Exception | None = None

        for future in as_completed(futures):
            slide = futures[future]

            # Once one slide hits an unrecoverable provider error (bad key,
            # unbillable model, no quota), every remaining slide will hit the
            # same one. Drain without issuing more work.
            if fatal is not None:
                future.cancel()
                continue

            try:
                cards = future.result()
                for card_data in cards:
                    card = Card(
                        generation_id=gen.id,
                        slide_index=card_data.get("slide_index", slide.index),
                        fields=card_data,
                        selected=True,
                        sort_order=float(card_order),
                    )
                    db.add(card)
                    card_order += 1
                gen.cards_generated = card_order
                db.commit()
                _mark_slide_processed(db, digest, slide.index, reader.path.name)
            except FatalProviderError as e:
                fatal = e
                gen.failed_slides = (gen.failed_slides or 0) + 1
            except AiError as e:
                gen.failed_slides = (gen.failed_slides or 0) + 1
                # Cap the accumulated text: 27 slides x a 400-char provider
                # body is unreadable, and only the distinct causes matter.
                msg = f"Slide {slide.index}: {e}"
                existing = gen.error_message or ""
                if msg not in existing and len(existing) < 2000:
                    gen.error_message = f"{existing}\n{msg}".strip()
            finally:
                # Count the slide either way - a slide that errored is still
                # finished, and not advancing here would stall the progress bar
                # at less than 100% on a partially failed run.
                gen.completed_slides = (gen.completed_slides or 0) + 1
                db.commit()

    if fatal is not None:
        # Surface the provider's own words: it names the model and the reason,
        # which is what the user needs to fix it.
        raise AiError(
            f"Generation stopped: the provider rejected every request with an "
            f"error that retrying cannot fix.\n\n{fatal}"
        )


@router.post("", response_model=GenerationSchema)
def start_generation(data: GenerateRequest, background_tasks: BackgroundTasks, db: Session = Depends(get_db)):
    provider = db.query(Provider).filter(Provider.id == data.provider_id).first()
    if not provider:
        raise HTTPException(404, "Provider not found")

    template = db.query(CardTemplate).filter(CardTemplate.id == data.template_id).first()
    if not template:
        raise HTTPException(404, "Card template not found")

    gen = Generation(
        title=data.source_title or "Untitled Generation",
        source_type="text" if data.source_text else "file",
        source_filename=None,
        source_text=data.source_text,
        provider_id=data.provider_id,
        model_name=data.model_name,
        template_id=data.template_id,
        deck_name=data.deck_name,
        custom_prompt=data.custom_prompt,
        subject_context=data.subject_context,
        dpi=data.dpi,
        max_workers=data.max_workers,
        status="pending",
    )
    db.add(gen)
    db.commit()
    db.refresh(gen)

    background_tasks.add_task(_run_generation, gen.id, data.force)

    return gen


@router.post("/from-file", response_model=GenerationSchema)
def generate_from_file(
    data: GenerateRequest,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
):
    if not data.source_filename:
        raise HTTPException(400, "source_filename is required")
    provider = db.query(Provider).filter(Provider.id == data.provider_id).first()
    if not provider:
        raise HTTPException(404, "Provider not found")

    template = db.query(CardTemplate).filter(CardTemplate.id == data.template_id).first()
    if not template:
        raise HTTPException(404, "Card template not found")

    # These are two different things: source_filename is the stored upload name
    # used to open the file on disk, source_title is the human label shown in
    # the UI. Using the title as the path breaks any real title.
    source_filename = data.source_filename

    upload_path = os.path.join(UPLOAD_DIR, source_filename)
    if not os.path.exists(upload_path):
        raise HTTPException(400, f"Uploaded file not found: {source_filename}")

    gen = Generation(
        title=data.source_title or source_filename,
        source_type="file",
        source_filename=source_filename,
        source_text=None,
        provider_id=data.provider_id,
        model_name=data.model_name,
        template_id=data.template_id,
        deck_name=data.deck_name,
        custom_prompt=data.custom_prompt,
        subject_context=data.subject_context,
        dpi=data.dpi,
        max_workers=data.max_workers,
        status="pending",
    )
    db.add(gen)
    db.commit()
    db.refresh(gen)

    background_tasks.add_task(_run_generation, gen.id, data.force)

    return gen


@router.get("/{generation_id}/slides/{slide_index}")
def get_slide_image(generation_id: str, slide_index: int, db: Session = Depends(get_db)):
    """The rendered JPEG/PNG of a source slide, used to attach pictures to cards."""
    gen = db.query(Generation).filter(Generation.id == generation_id).first()
    if not gen:
        raise HTTPException(404, "Generation not found")
    path = os.path.join(SLIDES_DIR, generation_id, f"{slide_index}.jpg")
    if not os.path.isfile(path):
        raise HTTPException(404, "Slide image not found")
    # The PPTX fallback renderer produces PNGs; serve whatever was stored.
    media_type = "image/png" if path and _looks_like_png(path) else "image/jpeg"
    return FileResponse(path, media_type=media_type)


def _looks_like_png(path: str) -> bool:
    with open(path, "rb") as f:
        return f.read(8) == b"\x89PNG\r\n\x1a\n"


@router.get("/{generation_id}", response_model=GenerationSchema)
def get_generation(generation_id: str, db: Session = Depends(get_db)):
    _reap_stale_running(db)
    gen = db.query(Generation).filter(Generation.id == generation_id).first()
    if not gen:
        raise HTTPException(404, "Generation not found")
    return gen


@router.get("", response_model=list[GenerationSchema])
def list_generations(db: Session = Depends(get_db)):
    _reap_stale_running(db)
    return db.query(Generation).order_by(Generation.created_at.desc()).all()


@router.delete("/{generation_id}")
def delete_generation(generation_id: str, db: Session = Depends(get_db)):
    gen = db.query(Generation).filter(Generation.id == generation_id).first()
    if not gen:
        raise HTTPException(404, "Generation not found")
    db.delete(gen)
    db.commit()
    return {"ok": True}
