from __future__ import annotations

import csv
import hashlib
import html
import io
import os
import shutil
from pathlib import Path
from tempfile import TemporaryDirectory

import genanki
from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session

from app.config import EXPORT_DIR, SLIDES_DIR
from app.database import get_db
from app.models import Card, CardTemplate, Generation
from app.services.latex import clean_latex

router = APIRouter()


def _anki_field(value: str) -> str:
    """Model text as an Anki field: HTML-escaped, LaTeX left intact.

    This must stay identical to `escapeField` in the AnkiConnect client - the
    two write paths produce the same cards from the same row, and any
    divergence shows up as a deck that renders differently depending on how it
    got there. Stripping the `\\(...\\)` delimiters here used to be that
    divergence: it left `.apkg` imports with unrendered inline math while a
    sync of the same cards rendered fine.
    """
    return html.escape(clean_latex(value), quote=False)


def _stable_id(value: str) -> int:
    """A deterministic Anki model/deck id derived from a name.

    Anki keys note types and decks on these ids: re-importing a deck whose
    model id changed creates a *duplicate* note type rather than updating the
    existing notes, so the id has to survive process restarts.
    """
    digest = hashlib.md5((value or "").encode("utf-8")).hexdigest()
    # Anki ids are signed 64-bit; stay well inside that range.
    return int(digest[:12], 16)


class _MediaStager:
    """Collects slide images under the exact filenames the cards reference.

    genanki names each packaged media file after ``os.path.basename()`` of the
    path it is handed. Slide images live at ``{SLIDES_DIR}/{gen}/{index}.jpg``,
    so handing over those paths packaged them as "1.jpg", "2.jpg", … while every
    ``<img>`` tag referenced ``notes2anki_{gen}_{index}.jpg``. Nothing resolved:
    the fields imported correctly and every picture was broken.

    Generic names are also actively harmful - Anki's media folder is shared
    across the whole collection, so a "1.jpg" from one deck overwrites another's.
    That collision is exactly why the prefixed name exists.

    Copying each image into a staging directory under its reference name makes
    ``basename()`` yield the right thing. The directory must outlive
    ``write_to_file``, so callers hold it open around the whole build.
    """

    def __init__(self, staging: Path):
        self._staging = staging
        self.files: list[str] = []

    def add(self, stored: str, filename: str) -> None:
        dest = self._staging / filename
        if str(dest) in self.files:
            return
        shutil.copyfile(stored, dest)
        self.files.append(str(dest))


def _slide_media(gen: Generation, card: Card):
    """`(<img> HTML, source path, media filename)` for a card's source slide.

    Returns None when the card has no slide (text generations) or the stored
    image is gone. The media filename is stable per generation+slide so a card
    re-synced to Anki resolves the same media file instead of duplicating it,
    and must match `slideMediaFilename` in the AnkiConnect client exactly.
    """
    if card.slide_index is None:
        return None
    stored = os.path.join(SLIDES_DIR, gen.id, f"{card.slide_index}.jpg")
    if not os.path.isfile(stored):
        return None
    filename = f"notes2anki_{gen.id[:8]}_{card.slide_index}.jpg"
    img_html = f'<img src="{filename}" style="max-width:100%; margin-bottom:8px">'
    return img_html, stored, filename


def _slide_image_html(gen: Generation, card: Card, stager: _MediaStager) -> str:
    """The `<img>` HTML for a card's slide, staging its media file.

    Used by mapped exports, where the image lands in whichever Anki field the
    mapping points it at rather than being prepended to the front.
    """
    media = _slide_media(gen, card)
    if not media:
        return ""
    img_html, stored, filename = media
    stager.add(stored, filename)
    return img_html


# Canonical content order within a field when several sources share it; the
# slide image always comes first so it tops the card.
_SOURCE_ORDER = ("prompt", "answer", "formula", "example question", "solution", "topic", "extra")


def _normalize_mapping(mapping: dict) -> dict[str, list[str]]:
    """Canonical form: {anki field: [source, ...]}.

    Also accepts the older single-source shape {source: field}, so templates
    saved before multi-source mapping still export correctly.
    """
    normalized: dict[str, list[str]] = {}
    for key, value in (mapping or {}).items():
        if isinstance(value, list):
            sources = [s for s in value if s]
            if sources:
                normalized[key] = sources
        elif value:
            normalized[value] = [key]
    return normalized


def _ordered_sources(sources: list[str]) -> list[str]:
    """Sources in display order: the slide image first, then canonical order."""
    non_image = [s for s in sources if s != "image"]
    non_image.sort(key=lambda s: _SOURCE_ORDER.index(s) if s in _SOURCE_ORDER else 99)
    return (["image"] if "image" in sources else []) + non_image


def _front_field(mapping: dict[str, list[str]], anki_field_names: list[str]) -> str:
    for field, sources in mapping.items():
        if "prompt" in sources:
            return field
    return anki_field_names[0] if anki_field_names else "prompt"


def _image_field(mapping: dict[str, list[str]], front: str) -> str | None:
    """Where the slide image lands: a field mapped to image, else the back.

    Back = any mapped field that isn't the front, preferring "answer" - so a
    note type with no image field still gets the slide picture attached.
    """
    for field, sources in mapping.items():
        if "image" in sources:
            return field
    for field, sources in mapping.items():
        if "answer" in sources and field != front:
            return field
    for field, sources in mapping.items():
        if field != front and sources:
            return field
    return front  # last resort: the front is all there is


def _build_apkg(gen: Generation, db: Session) -> str:
    cards = db.query(Card).filter(
        Card.generation_id == gen.id,
        Card.selected == True,
    ).order_by(Card.sort_order).all()

    if not cards:
        raise HTTPException(400, "No selected cards to export")

    template = db.query(CardTemplate).filter(CardTemplate.id == gen.template_id).first()
    css = template.css if template else ""
    mapping = dict(template.mapping or {}) if template else {}

    # Anki merges on model/deck id, so these must be stable across restarts.
    # Python's hash() is salted per process (PYTHONHASHSEED), which would mint
    # a new note type on every re-import - use a content hash instead.
    model_id = _stable_id(gen.template_id)
    deck_id = _stable_id(gen.deck_name or "Default")

    # note_type lives on the template, not the generation.
    template_note_type = (template.note_type if template else "") or "Basic"
    is_cloze = template_note_type.lower() == "cloze"
    note_type = genanki.Model.CLOZE if is_cloze else genanki.Model.FRONT_BACK

    if mapping:
        # A template built from an existing Anki note type: fields = the
        # detected Anki fields (unmapped ones stay empty), values composed
        # from each field's mapped sources.
        norm = _normalize_mapping(mapping)
        anki_field_names = [f for f in (template.anki_fields or []) if f]
        if not anki_field_names:
            anki_field_names = list(norm.keys())
        front_field = _front_field(norm, anki_field_names)
        image_field = _image_field(norm, front_field)
        if is_cloze:
            back_field = next(
                (f for f in anki_field_names if f != front_field), front_field
            )
            front_template = f"{{{{cloze:{front_field}}}}}"
            back_template = (
                f"{{{{cloze:{front_field}}}}}<hr id=answer>{{{{{back_field}}}}}"
            )
        else:
            front_template = f"{{{{{front_field}}}}}"
            back_parts = ["{{FrontSide}}", "<hr id=answer>"]
            for fn in anki_field_names:
                if fn != front_field:
                    back_parts.append(f"{{{{{fn}}}}}")
            back_template = "<br>".join(back_parts)
    else:
        # Legacy template: fields are the LLM output fields, image goes on
        # the front as before.
        fields_list = template.fields if template else []
        anki_field_names = [f["name"] for f in fields_list] if fields_list else ["prompt", "answer"]
        front_field = "prompt" if "prompt" in anki_field_names else (anki_field_names[0] if anki_field_names else "prompt")
        image_field = None
        if is_cloze:
            front_template = "{{cloze:prompt}}"
            back_template = "{{cloze:prompt}}<hr id=answer>{{answer}}"
        else:
            front_template = "{{prompt}}"
            back_parts = ["{{FrontSide}}", "<hr id=answer>"]
            for fn in anki_field_names:
                if fn not in ("prompt",):
                    back_parts.append(f"{{{{{fn}}}}}")
            back_template = "<br>".join(back_parts)

    anki_model = genanki.Model(
        model_id,
        gen.template_id,
        fields=[{"name": fn} for fn in anki_field_names],
        templates=[{
            "name": "Card 1",
            "qfmt": front_template,
            "afmt": back_template,
        }],
        css=css,
        model_type=note_type,
    )

    deck = genanki.Deck(deck_id, gen.deck_name or "Default")

    filename = f"{gen.id}.apkg"
    filepath = os.path.join(EXPORT_DIR, filename)

    # The staging directory has to outlive write_to_file - genanki reads the
    # media files at write time, not when they are registered.
    with TemporaryDirectory(prefix="notes2anki_apkg_") as staging:
        stager = _MediaStager(Path(staging))

        for card in cards:
            fields = card.fields or {}
            note_fields = []
            if mapping:
                for fn in anki_field_names:
                    parts = []
                    for source in _ordered_sources(norm.get(fn, [])):
                        if source == "image":
                            img = _slide_image_html(gen, card, stager)
                            if img:
                                parts.append(img)
                        else:
                            text = _anki_field(fields.get(source, ""))
                            if text:
                                parts.append(text)
                    # Unmapped image: still attach the slide, on the back field.
                    if (
                        image_field
                        and fn == image_field
                        and "image" not in norm.get(fn, [])
                    ):
                        img = _slide_image_html(gen, card, stager)
                        if img:
                            parts.insert(0, img)
                    if len(parts) > 1:
                        value = "<br>".join(parts)
                    elif parts:
                        value = parts[0]
                    else:
                        value = ""
                    note_fields.append(value)
            else:
                note_fields = [
                    _anki_field(fields.get(fn, "")) for fn in anki_field_names
                ]
                media = _slide_media(gen, card)
                if media:
                    img_html, stored, media_name = media
                    front_index = next(
                        (
                            i
                            for i, fn in enumerate(anki_field_names)
                            if fn == front_field
                        ),
                        0,
                    )
                    note_fields[front_index] = f"{img_html}{note_fields[front_index]}"
                    stager.add(stored, media_name)
            note = genanki.Note(
                model=anki_model,
                fields=note_fields,
                tags=["notes2anki"],
            )
            deck.add_note(note)

        package = genanki.Package(deck, media_files=stager.files)
        package.write_to_file(filepath)

    return filepath


def _csv_columns(template: CardTemplate | None) -> tuple[list[str], dict[str, list[str]] | None]:
    """Column names, and the source mapping when the template has one.

    Mirrors how `_build_apkg` picks its fields, so a template built from a real
    Anki note type exports the same columns either way.
    """
    mapping = dict(template.mapping or {}) if template else {}
    if mapping:
        norm = _normalize_mapping(mapping)
        names = [f for f in (template.anki_fields or []) if f] or list(norm.keys())
        return names, norm

    fields_list = template.fields if template else []
    names = [f["name"] for f in fields_list] if fields_list else ["prompt", "answer"]
    return names, None


def _build_csv(gen: Generation, db: Session) -> str:
    """CSV export. Honours `mapping` and escapes exactly like the other paths.

    This used to read `template.fields` unconditionally, so a template mapped
    onto a user's own Anki note type exported the *app's* field names with
    unconcatenated values - columns that matched neither the note type nor what
    `.apkg` produced from the same rows.

    It also wrote field values raw while `_build_apkg` ran them through
    `_anki_field`. Anki treats imported CSV values as HTML, so an unescaped
    `<` or `&` rendered differently depending on which file you imported - the
    same class of divergence the `_anki_field`/`escapeField` invariant exists
    to prevent.

    Images are the one thing CSV genuinely cannot carry: there is no media
    sidecar, so an `<img>` tag here would reference a file Anki never received.
    `image` sources are skipped; use `.apkg` or AnkiConnect for slide pictures.
    """
    cards = db.query(Card).filter(
        Card.generation_id == gen.id,
        Card.selected == True,
    ).order_by(Card.sort_order).all()

    if not cards:
        raise HTTPException(400, "No selected cards to export")

    template = db.query(CardTemplate).filter(CardTemplate.id == gen.template_id).first()
    field_names, norm = _csv_columns(template)

    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow(field_names)

    for card in cards:
        fields = card.fields or {}
        if norm is None:
            row = [_anki_field(fields.get(fn, "")) for fn in field_names]
        else:
            row = []
            for fn in field_names:
                parts = []
                for source in _ordered_sources(norm.get(fn, [])):
                    if source == "image":
                        continue
                    text = _anki_field(fields.get(source, ""))
                    if text:
                        parts.append(text)
                row.append("<br>".join(parts))
        writer.writerow(row)

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
