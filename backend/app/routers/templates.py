from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import CardTemplate
from app.schemas import CardTemplateSchema, CardTemplateCreate, CardTemplateUpdate

router = APIRouter()

DEFAULT_FIELDS = [
    {"name": "prompt", "label": "Front / Prompt", "visible": True},
    {"name": "answer", "label": "Back / Answer", "visible": True},
    {"name": "formula", "label": "Formula", "visible": True},
    {"name": "example question", "label": "Example Question", "visible": True},
    {"name": "solution", "label": "Solution", "visible": True},
    {"name": "extra", "label": "Extra", "visible": True},
    {"name": "topic", "label": "Topic", "visible": True},
]

DEFAULT_CSS = (
    ".card { font-family: Arial, sans-serif; font-size: 20px; text-align: left; "
    "color: #111; background: #fff; line-height: 1.45; } "
    "img { max-width: 100%; height: auto; } "
    "small { color: #666; }"
)

NOTE_TYPES = ["Basic", "Cloze", "Notes2Anki"]


@router.get("", response_model=list[CardTemplateSchema])
def list_templates(db: Session = Depends(get_db)):
    return db.query(CardTemplate).all()


@router.post("", response_model=CardTemplateSchema)
def create_template(data: CardTemplateCreate, db: Session = Depends(get_db)):
    if db.query(CardTemplate).filter(CardTemplate.name == data.name).first():
        raise HTTPException(400, "Template name already exists")
    template = CardTemplate(
        name=data.name,
        note_type=data.note_type,
        fields=data.fields,
        css=data.css or DEFAULT_CSS,
        is_default=data.is_default,
    )
    if data.is_default:
        db.query(CardTemplate).filter(CardTemplate.is_default == True).update(
            {"is_default": False}
        )
    db.add(template)
    db.commit()
    db.refresh(template)
    return template


@router.get("/defaults")
def get_defaults():
    return {"fields": DEFAULT_FIELDS, "css": DEFAULT_CSS, "note_types": NOTE_TYPES}


@router.get("/{template_id}", response_model=CardTemplateSchema)
def get_template(template_id: str, db: Session = Depends(get_db)):
    template = db.query(CardTemplate).filter(CardTemplate.id == template_id).first()
    if not template:
        raise HTTPException(404, "Template not found")
    return template


@router.put("/{template_id}", response_model=CardTemplateSchema)
def update_template(template_id: str, data: CardTemplateUpdate, db: Session = Depends(get_db)):
    template = db.query(CardTemplate).filter(CardTemplate.id == template_id).first()
    if not template:
        raise HTTPException(404, "Template not found")
    for field, value in data.model_dump(exclude_unset=True).items():
        setattr(template, field, value)
    if data.is_default:
        db.query(CardTemplate).filter(CardTemplate.id != template_id, CardTemplate.is_default == True).update(
            {"is_default": False}
        )
    db.commit()
    db.refresh(template)
    return template


@router.delete("/{template_id}")
def delete_template(template_id: str, db: Session = Depends(get_db)):
    template = db.query(CardTemplate).filter(CardTemplate.id == template_id).first()
    if not template:
        raise HTTPException(404, "Template not found")
    db.delete(template)
    db.commit()
    return {"ok": True}
