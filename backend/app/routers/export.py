from __future__ import annotations

import os
import uuid
import csv
import hashlib
import io
import tempfile
import html
from pathlib import Path

import genanki
from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import Generation, Card, CardTemplate
from app.config import EXPORT_DIR, SLIDES_DIR

router = APIRouter()


def _clean_latex(value: str) -> str:
    import re
    value = re.sub(r"\\\\", r"\\", (value or ""))
    value = re.sub(r"\\\(|\\\)", r"", value)
    return html.escape(value, quote=False)


def _stable_id(value: str) -> int:
    """A deterministic Anki model/deck id derived from a name.

    Anki keys note types and decks on these ids: re-importing a deck whose
    model id changed creates a *duplicate* note type rather than updating the
    existing notes, so the id has to survive process restarts.
    """
    digest = hashlib.md5((value or "").encode("utf-8")).hexdigest()
    # Anki ids are signed 64-bit; stay well inside that range.
    return int(digest[:12], 16)


def _slide_media(gen: Generation, card: Card):
    """The `<img>` HTML + media file path for a card's source slide.

    Returns None when the card has no slide (text generations) or the stored
    image is gone. The media filename is stable per generation+slide so a card
    re-synced to Anki resolves the same media file instead of duplicating it.
    """
    if card.slide_index is None:
        return None
    stored = os.path.join(SLIDES_DIR, gen.id, f"{card.slide_index}.jpg")
    if not os.path.isfile(stored):
        return None
    filename = f"notes2anki_{gen.id[:8]}_{card.slide_index}.jpg"
    img_html = f'<img src="{filename}" style="max-width:100%; margin-bottom:8px">'
    return img_html, stored


def _build_apkg(gen: Generation, db: Session) -> str:
    cards = db.query(Card).filter(
        Card.generation_id == gen.id,
        Card.selected == True,
    ).order_by(Card.sort_order).all()

    if not cards:
        raise HTTPException(400, "No selected cards to export")

    template = db.query(CardTemplate).filter(CardTemplate.id == gen.template_id).first()
    css = template.css if template else ""
    fields_list = template.fields if template else []
    field_names = [f["name"] for f in fields_list] if fields_list else ["prompt", "answer"]

    # Anki merges on model/deck id, so these must be stable across restarts.
    # Python's hash() is salted per process (PYTHONHASHSEED), which would mint
    # a new note type on every re-import - use a content hash instead.
    model_id = _stable_id(gen.template_id)
    deck_id = _stable_id(gen.deck_name or "Default")

    # note_type lives on the template, not the generation.
    template_note_type = (template.note_type if template else "") or "Basic"

    if template_note_type.lower() == "cloze":
        front_template = "{{cloze:prompt}}"
        back_template = "{{cloze:prompt}}<hr id=answer>{{answer}}"
        note_type = genanki.Model.CLOZE
    else:
        front = "{{prompt}}"
        back_parts = ["{{FrontSide}}", "<hr id=answer>"]
        for fn in field_names:
            if fn not in ("prompt",):
                back_parts.append(f"{{{{{fn}}}}}")
        back = "<br>".join(back_parts)
        front_template = front
        back_template = back
        note_type = genanki.Model.FRONT_BACK

    anki_model = genanki.Model(
        model_id,
        gen.template_id,
        fields=[{"name": fn} for fn in field_names],
        templates=[{
            "name": "Card 1",
            "qfmt": front_template,
            "afmt": back_template,
        }],
        css=css,
        model_type=note_type,
    )

    deck = genanki.Deck(deck_id, gen.deck_name or "Default")

    # The image belongs on the front. Templates name it "prompt" by default;
    # fall back to the first field for note types that call it something else.
    front_index = next((i for i, fn in enumerate(field_names) if fn.lower() == "prompt"), 0)

    media_files = []
    for card in cards:
        fields = card.fields or {}
        note_fields = [_clean_latex(fields.get(fn, "")) for fn in field_names]
        media = _slide_media(gen, card)
        if media:
            img_html, stored = media
            note_fields[front_index] = f"{img_html}{note_fields[front_index]}"
            if stored not in media_files:
                media_files.append(stored)
        note = genanki.Note(
            model=anki_model,
            fields=note_fields,
            tags=["notes2anki"],
        )
        deck.add_note(note)

    filename = f"{gen.id}.apkg"
    filepath = os.path.join(EXPORT_DIR, filename)
    package = genanki.Package(deck, media_files=media_files)
    package.write_to_file(filepath)

    return filepath


def _build_csv(gen: Generation, db: Session) -> str:
    cards = db.query(Card).filter(
        Card.generation_id == gen.id,
        Card.selected == True,
    ).order_by(Card.sort_order).all()

    if not cards:
        raise HTTPException(400, "No selected cards to export")

    template = db.query(CardTemplate).filter(CardTemplate.id == gen.template_id).first()
    fields_list = template.fields if template else []
    field_names = [f["name"] for f in fields_list] if fields_list else ["prompt", "answer"]

    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow(field_names)

    for card in cards:
        fields = card.fields or {}
        writer.writerow([fields.get(fn, "") for fn in field_names])

    filename = f"{gen.id}.csv"
    filepath = os.path.join(EXPORT_DIR, filename)
    with open(filepath, "w", newline="", encoding="utf-8") as f:
        f.write(output.getvalue())

    return filepath


@router.get("/{generation_id}/apkg")
def export_apkg(generation_id: str, db: Session = Depends(get_db)):
    gen = db.query(Generation).filter(Generation.id == generation_id).first()
    if not gen:
        raise HTTPException(404, "Generation not found")
    filepath = _build_apkg(gen, db)
    return FileResponse(filepath, media_type="application/octet-stream", filename=f"{gen.deck_name or 'cards'}.apkg")


@router.get("/{generation_id}/csv")
def export_csv(generation_id: str, db: Session = Depends(get_db)):
    gen = db.query(Generation).filter(Generation.id == generation_id).first()
    if not gen:
        raise HTTPException(404, "Generation not found")
    filepath = _build_csv(gen, db)
    return FileResponse(filepath, media_type="text/csv", filename=f"{gen.deck_name or 'cards'}.csv")
