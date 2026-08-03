import datetime
from sqlalchemy import Column, String, Boolean, DateTime, ForeignKey, Text, Integer, JSON, Float
from sqlalchemy.orm import relationship

from app import crypto
from app.database import Base, generate_uuid


class Provider(Base):
    __tablename__ = "providers"

    id = Column(String, primary_key=True, default=generate_uuid)
    name = Column(String, nullable=False)
    provider_type = Column(String, nullable=False)
    base_url = Column(String, nullable=True)
    # Fernet ciphertext. Read/write it through the `api_key` property below,
    # which handles encryption transparently.
    api_key_enc = Column(String, nullable=True)
    # The pre-encryption plaintext column. Retained only so the startup
    # migration can find and encrypt existing rows; always NULL afterwards.
    legacy_api_key = Column("api_key", String, nullable=True)
    is_active = Column(Boolean, default=True)
    # Which structured-output tier last worked ("schema" / "json_object" /
    # "prompt_only"). Cached so a provider that rejects JSON-schema mode
    # doesn't re-pay the 400 on every request. NULL = not yet probed.
    json_mode_tier = Column(String, nullable=True)
    created_at = Column(DateTime, default=datetime.datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.datetime.utcnow, onupdate=datetime.datetime.utcnow)

    models = relationship("ProviderModel", back_populates="provider", cascade="all, delete-orphan")

    @property
    def api_key(self) -> str | None:
        """The decrypted key. Only ever held in memory, never serialized."""
        return crypto.decrypt(self.api_key_enc)

    @api_key.setter
    def api_key(self, value: str | None) -> None:
        self.api_key_enc = crypto.encrypt(value)

    @property
    def key_set(self) -> bool:
        return bool(self.api_key_enc)

    @property
    def key_hint(self) -> str | None:
        return crypto.hint(self.api_key)


class ProviderModel(Base):
    __tablename__ = "provider_models"

    id = Column(String, primary_key=True, default=generate_uuid)
    provider_id = Column(String, ForeignKey("providers.id", ondelete="CASCADE"), nullable=False, index=True)
    model_id = Column(String, nullable=False)
    display_name = Column(String, nullable=True)
    is_custom = Column(Boolean, default=False)
    supports_vision = Column(Boolean, default=False)
    created_at = Column(DateTime, default=datetime.datetime.utcnow)

    provider = relationship("Provider", back_populates="models")


class CardTemplate(Base):
    __tablename__ = "card_templates"

    id = Column(String, primary_key=True, default=generate_uuid)
    name = Column(String, unique=True, nullable=False)
    note_type = Column(String, nullable=False)
    fields = Column(JSON, nullable=False)
    css = Column(Text, nullable=True)
    is_default = Column(Boolean, default=False)
    # For templates built from an existing Anki note type: which app source
    # (prompt/answer/formula/example question/solution/topic/extra/image)
    # lands in each Anki field. None = legacy template, exports use `fields`
    # verbatim and attach the slide image to the front.
    mapping = Column(JSON, nullable=True)
    # The note type's full field list (Anki order) as detected via
    # AnkiConnect, so .apkg exports build a model matching the user's Anki
    # and re-imports merge instead of dropping fields.
    anki_fields = Column(JSON, nullable=True)
    created_at = Column(DateTime, default=datetime.datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.datetime.utcnow, onupdate=datetime.datetime.utcnow)

    generations = relationship("Generation", back_populates="template")


class Generation(Base):
    __tablename__ = "generations"

    id = Column(String, primary_key=True, default=generate_uuid)
    title = Column(String, nullable=True)
    source_type = Column(String, nullable=False)
    source_filename = Column(String, nullable=True)
    source_text = Column(Text, nullable=True)
    provider_id = Column(String, ForeignKey("providers.id"), nullable=False, index=True)
    model_name = Column(String, nullable=False)
    template_id = Column(String, ForeignKey("card_templates.id"), nullable=False, index=True)
    deck_name = Column(String, default="Default")
    custom_prompt = Column(Text, nullable=True)
    subject_context = Column(String, nullable=True)
    status = Column(String, default="pending")
    # Progress, polled by the review page while a job runs. total_slides is 0
    # until ingestion finishes counting, so the UI shows an indeterminate bar
    # during the render phase rather than a misleading 0%.
    phase = Column(String, nullable=True)
    total_slides = Column(Integer, default=0)
    completed_slides = Column(Integer, default=0)
    cards_generated = Column(Integer, default=0)
    failed_slides = Column(Integer, default=0)
    dpi = Column(Integer, default=150)
    max_workers = Column(Integer, default=4)
    error_message = Column(Text, nullable=True)
    created_at = Column(DateTime, default=datetime.datetime.utcnow)
    # Heartbeat for liveness: every progress commit touches this row, so a
    # run whose background task died is detectable by a stale updated_at.
    updated_at = Column(DateTime, default=datetime.datetime.utcnow, onupdate=datetime.datetime.utcnow)
    completed_at = Column(DateTime, nullable=True)

    provider = relationship("Provider")
    template = relationship("CardTemplate", back_populates="generations")
    cards = relationship("Card", back_populates="generation", cascade="all, delete-orphan")


class Card(Base):
    __tablename__ = "cards"

    id = Column(String, primary_key=True, default=generate_uuid)
    # SQLite creates no index to back a foreign key, so without this every card
    # fetch, export, and cascading delete scans the whole table - including the
    # review page's 1s progress poll.
    generation_id = Column(String, ForeignKey("generations.id", ondelete="CASCADE"), nullable=False, index=True)
    slide_index = Column(Integer, nullable=True)
    fields = Column(JSON, nullable=False)
    selected = Column(Boolean, default=True)
    user_edited = Column(Boolean, default=False)
    sort_order = Column(Float, default=0.0)
    created_at = Column(DateTime, default=datetime.datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.datetime.utcnow, onupdate=datetime.datetime.utcnow)

    generation = relationship("Generation", back_populates="cards")


class ProcessedSlide(Base):
    __tablename__ = "processed_slides"

    id = Column(String, primary_key=True, default=generate_uuid)
    file_digest = Column(String, nullable=False, index=True)
    slide_index = Column(Integer, nullable=False)
    source_filename = Column(String, nullable=True)
    processed_at = Column(DateTime, default=datetime.datetime.utcnow)
