from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import Card
from app.schemas import BatchSelectRequest, CardSchema, CardUpdate

router = APIRouter()


@router.get("/{card_id}", response_model=CardSchema)
def get_card(card_id: str, db: Session = Depends(get_db)):
    card = db.query(Card).filter(Card.id == card_id).first()
    if not card:
        raise HTTPException(404, "Card not found")
    return card


@router.put("/{card_id}", response_model=CardSchema)
def update_card(card_id: str, data: CardUpdate, db: Session = Depends(get_db)):
    card = db.query(Card).filter(Card.id == card_id).first()
    if not card:
        raise HTTPException(404, "Card not found")
    if data.fields is not None:
        # Only an actual change marks the card as user-edited; opening the
        # editor and saving without touching anything must not.
        changed = data.fields != card.fields
        card.fields = data.fields
        if changed:
            card.user_edited = True
    if data.selected is not None:
        card.selected = data.selected
    db.commit()
    db.refresh(card)
    return card


@router.delete("/{card_id}")
def delete_card(card_id: str, db: Session = Depends(get_db)):
    card = db.query(Card).filter(Card.id == card_id).first()
    if not card:
        raise HTTPException(404, "Card not found")
    db.delete(card)
    db.commit()
    return {"ok": True}


@router.post("/batch-select")
def batch_select(data: BatchSelectRequest, db: Session = Depends(get_db)):
    if not data.card_ids:
        return {"ok": True, "updated": 0}
    count = db.query(Card).filter(Card.id.in_(data.card_ids)).update(
        {"selected": data.selected}, synchronize_session=False
    )
    db.commit()
    return {"ok": True, "updated": count}
