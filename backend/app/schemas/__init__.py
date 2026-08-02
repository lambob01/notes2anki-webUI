from __future__ import annotations

import datetime
from pydantic import BaseModel, field_validator, Field
from typing import Optional


class ProviderModelSchema(BaseModel):
    id: str
    model_id: str
    display_name: Optional[str] = None
    is_custom: bool = False
    supports_vision: bool = False

    model_config = {"from_attributes": True}


class ProviderSchema(BaseModel):
    id: str
    name: str
    provider_type: str
    base_url: Optional[str] = None
    # The API key is deliberately NOT exposed. The browser gets only whether
    # one is stored and a masked fragment to identify it; the plaintext never
    # leaves the server.
    key_set: bool = False
    key_hint: Optional[str] = None
    is_active: bool = True
    created_at: datetime.datetime
    updated_at: datetime.datetime
    models: list[ProviderModelSchema] = []

    model_config = {"from_attributes": True}


class ProviderCreate(BaseModel):
    name: str
    provider_type: str
    base_url: Optional[str] = None
    api_key: Optional[str] = None
    is_active: bool = True


class ProviderUpdate(BaseModel):
    name: Optional[str] = None
    provider_type: Optional[str] = None
    base_url: Optional[str] = None
    api_key: Optional[str] = None
    is_active: Optional[bool] = None


class TestProviderRequest(BaseModel):
    provider_type: str
    base_url: Optional[str] = None
    api_key: Optional[str] = None


class CustomModelCreate(BaseModel):
    model_id: str
    display_name: Optional[str] = None
    supports_vision: bool = False


class CardTemplateSchema(BaseModel):
    id: str
    name: str
    note_type: str
    fields: list[dict]
    css: Optional[str] = None
    is_default: bool = False
    mapping: Optional[dict] = None
    anki_fields: Optional[list[str]] = None
    created_at: datetime.datetime
    updated_at: datetime.datetime

    model_config = {"from_attributes": True}


class CardTemplateCreate(BaseModel):
    name: str
    note_type: str
    fields: list[dict]
    css: Optional[str] = None
    is_default: bool = False
    mapping: Optional[dict] = None
    anki_fields: Optional[list[str]] = None


class CardTemplateUpdate(BaseModel):
    name: Optional[str] = None
    note_type: Optional[str] = None
    fields: Optional[list[dict]] = None
    css: Optional[str] = None
    is_default: Optional[bool] = None
    mapping: Optional[dict] = None
    anki_fields: Optional[list[str]] = None


class TextNoteCreate(BaseModel):
    text: str
    title: Optional[str] = None


class GenerateRequest(BaseModel):
    provider_id: str
    model_name: str
    template_id: str
    deck_name: str = "Default"
    custom_prompt: Optional[str] = None
    subject_context: Optional[str] = None
    source_text: Optional[str] = None
    source_title: Optional[str] = None
    source_filename: Optional[str] = None
    dpi: int = 150
    max_workers: int = 4
    # Reprocess slides that were already handled by an earlier run of this
    # file, overriding the ProcessedSlide dedup.
    force: bool = False


class CardSchema(BaseModel):
    id: str
    generation_id: str
    slide_index: Optional[int] = None
    fields: dict
    selected: bool = True
    user_edited: bool = False
    sort_order: float = 0.0
    created_at: datetime.datetime
    updated_at: datetime.datetime

    model_config = {"from_attributes": True}


class CardUpdate(BaseModel):
    fields: Optional[dict] = None
    selected: Optional[bool] = None


class BatchSelectRequest(BaseModel):
    card_ids: list[str]
    selected: bool


class GenerationSchema(BaseModel):
    id: str
    title: Optional[str] = None
    source_type: str
    source_filename: Optional[str] = None
    source_text: Optional[str] = None
    provider_id: str
    model_name: str
    template_id: str
    deck_name: str = "Default"
    custom_prompt: Optional[str] = None
    subject_context: Optional[str] = None
    status: str = "pending"
    phase: Optional[str] = None
    # Optional because rows created before progress tracking existed have NULL
    # here; the validator normalizes them so the UI always gets a number.
    total_slides: Optional[int] = 0
    completed_slides: Optional[int] = 0
    cards_generated: Optional[int] = 0
    failed_slides: Optional[int] = 0

    @field_validator(
        "total_slides", "completed_slides", "cards_generated", "failed_slides",
        mode="before",
    )
    @classmethod
    def _null_to_zero(cls, v):
        return 0 if v is None else v
    error_message: Optional[str] = None
    created_at: datetime.datetime
    completed_at: Optional[datetime.datetime] = None
    cards: list[CardSchema] = []

    model_config = {"from_attributes": True}
