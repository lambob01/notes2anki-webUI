"""CSV export has to agree with the other two Anki write paths.

`_anki_field` (`.apkg`) and `escapeField` (AnkiConnect) are documented as
having to produce identical cards. CSV was a third path that agreed with
neither: it read `template.fields` even when the template mapped onto a real
Anki note type, and it wrote values raw where the others HTML-escape.
"""

import csv
import io
import uuid

import pytest
from fastapi.testclient import TestClient

from app.database import SessionLocal
from app.main import app
from app.models import Card, CardTemplate, Generation, Provider
from app.routers.export import _anki_field, _csv_columns


def _mapped_template():
    """A template built from a user's own Anki note type."""
    return CardTemplate(
        name="Mapped",
        note_type="ChemEng",
        fields=[{"name": "prompt"}, {"name": "answer"}, {"name": "formula"}],
        mapping={"Front": ["prompt"], "Back": ["answer", "formula"], "Pic": ["image"]},
        anki_fields=["Front", "Back", "Pic"],
    )


def _legacy_template():
    return CardTemplate(
        name="Legacy",
        note_type="Basic",
        fields=[{"name": "prompt"}, {"name": "answer"}],
        mapping=None,
    )


def test_mapped_template_exports_anki_field_names():
    names, norm = _csv_columns(_mapped_template())
    assert names == ["Front", "Back", "Pic"]
    assert norm["Back"] == ["answer", "formula"]


def test_legacy_template_still_uses_its_own_fields():
    names, norm = _csv_columns(_legacy_template())
    assert names == ["prompt", "answer"]
    assert norm is None


def test_missing_template_falls_back_to_prompt_answer():
    names, norm = _csv_columns(None)
    assert names == ["prompt", "answer"]
    assert norm is None


def _render_row(template, fields):
    """The row-building half of _build_csv, without the DB round-trip."""
    from app.routers.export import _ordered_sources

    names, norm = _csv_columns(template)
    if norm is None:
        return names, [_anki_field(fields.get(fn, "")) for fn in names]
    row = []
    for fn in names:
        parts = []
        for source in _ordered_sources(norm.get(fn, [])):
            if source == "image":
                continue
            text = _anki_field(fields.get(source, ""))
            if text:
                parts.append(text)
        row.append("<br>".join(parts))
    return names, row


def test_multiple_sources_concatenate_into_one_column():
    _, row = _render_row(
        _mapped_template(),
        {"prompt": "What is it?", "answer": "A thing", "formula": "E=mc^2"},
    )
    assert row[0] == "What is it?"
    assert row[1] == "A thing<br>E=mc^2"


def test_image_source_is_skipped_because_csv_carries_no_media():
    _, row = _render_row(_mapped_template(), {"prompt": "Q", "answer": "A"})
    assert row[2] == ""  # the "Pic" column, mapped only to image


def test_html_is_escaped_exactly_as_the_apkg_path_does():
    fields = {"prompt": "a < b & c > d", "answer": "x"}
    _, row = _render_row(_mapped_template(), fields)
    assert row[0] == "a &lt; b &amp; c &gt; d"
    assert row[0] == _anki_field(fields["prompt"])


def test_latex_delimiters_survive_escaping():
    _, row = _render_row(_mapped_template(), {"prompt": r"\(x^2\)", "answer": "y"})
    assert row[0] == r"\(x^2\)"


def test_escaped_values_survive_a_csv_round_trip():
    names, row = _render_row(
        _mapped_template(), {"prompt": 'has "quotes", commas', "answer": "b"}
    )
    buf = io.StringIO()
    w = csv.writer(buf)
    w.writerow(names)
    w.writerow(row)
    parsed = list(csv.reader(io.StringIO(buf.getvalue())))
    assert parsed[0] == ["Front", "Back", "Pic"]
    assert parsed[1][0] == 'has "quotes", commas'


# --- end-to-end through the real endpoint -----------------------------------
# The unit checks above call helpers that only exist post-fix, so they cannot
# demonstrate the regression on their own. This one goes through
# GET /api/export/{id}/csv and is version-independent: against the old
# _build_csv it emits the app's own field names instead of the note type's.


@pytest.fixture
def mapped_generation():
    db = SessionLocal()
    tag = uuid.uuid4().hex[:8]
    provider = Provider(name=f"csv-{tag}", provider_type="openai", base_url="http://x.invalid")
    template = CardTemplate(
        name=f"csv-tpl-{tag}",
        note_type="ChemEng",
        fields=[{"name": "prompt"}, {"name": "answer"}, {"name": "formula"}],
        mapping={"Front": ["prompt"], "Back": ["answer", "formula"]},
        anki_fields=["Front", "Back"],
    )
    db.add_all([provider, template])
    db.commit()

    gen = Generation(
        source_type="file",
        provider_id=provider.id,
        model_name="gpt-4o",
        template_id=template.id,
        status="completed",
        deck_name="Probe",
    )
    db.add(gen)
    db.commit()
    db.add(
        Card(
            generation_id=gen.id,
            fields={"prompt": "Q < 1", "answer": "A", "formula": "E=mc^2"},
            selected=True,
            sort_order=0.0,
        )
    )
    db.commit()
    gen_id = gen.id
    db.close()
    return gen_id


def test_csv_endpoint_uses_the_note_types_fields(mapped_generation):
    with TestClient(app) as c:
        resp = c.get(f"/api/export/{mapped_generation}/csv")
    assert resp.status_code == 200
    rows = list(csv.reader(io.StringIO(resp.text)))

    # The note type's fields - not prompt/answer/formula.
    assert rows[0] == ["Front", "Back"]
    # Both mapped sources concatenated into the one column.
    assert rows[1][1] == "A<br>E=mc^2"
    # ...and escaped like the other write paths.
    assert rows[1][0] == "Q &lt; 1"
