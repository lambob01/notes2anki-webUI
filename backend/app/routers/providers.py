from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.database import get_db
from app.llm.base import AiError
# Single source of truth for presets and adapter routing - notably Gemini's
# base_url points at its OpenAI-compatible surface, so it needs no adapter.
from app.llm.registry import PROVIDER_PRESETS, build_client, kind_for
from app.models import Provider, ProviderModel
from app.schemas import (
    ProviderSchema,
    ProviderCreate,
    ProviderUpdate,
    ProviderModelSchema,
    TestProviderRequest,
    CustomModelCreate,
)

router = APIRouter()


def _is_vision_capable(provider_type: str, model_id: str) -> bool:
    vision_prefixes = (
        "gpt-4o", "gpt-4-turbo", "gpt-4.5", "gpt-5",
        "claude-3", "claude-3.5", "claude-3.7", "claude-4",
        "gemini-1.5", "gemini-2.0", "gemini-2.5",
        "deepseek-vl",
    )
    if provider_type == "groq":
        return False
    if provider_type == "gemini":
        return any(p in model_id for p in ("gemini-1.5", "gemini-2.0", "gemini-2.5"))
    if provider_type == "anthropic":
        return any(p in model_id for p in ("claude-3", "claude-3.5", "claude-3.7", "claude-4"))
    return model_id.lower().startswith(vision_prefixes)


@router.get("", response_model=list[ProviderSchema])
def list_providers(db: Session = Depends(get_db)):
    return db.query(Provider).all()


@router.post("", response_model=ProviderSchema)
def create_provider(data: ProviderCreate, db: Session = Depends(get_db)):
    if data.provider_type not in PROVIDER_PRESETS:
        raise HTTPException(400, f"Unknown provider type: {data.provider_type}")

    preset = PROVIDER_PRESETS[data.provider_type]
    base_url = data.base_url or preset["base_url"]

    provider = Provider(
        name=data.name,
        provider_type=data.provider_type,
        base_url=base_url,
        api_key=data.api_key,
        is_active=data.is_active,
    )
    db.add(provider)
    db.commit()
    db.refresh(provider)
    return provider


@router.get("/presets")
def get_presets():
    return PROVIDER_PRESETS


@router.get("/{provider_id}", response_model=ProviderSchema)
def get_provider(provider_id: str, db: Session = Depends(get_db)):
    provider = db.query(Provider).filter(Provider.id == provider_id).first()
    if not provider:
        raise HTTPException(404, "Provider not found")
    return provider


@router.put("/{provider_id}", response_model=ProviderSchema)
def update_provider(provider_id: str, data: ProviderUpdate, db: Session = Depends(get_db)):
    provider = db.query(Provider).filter(Provider.id == provider_id).first()
    if not provider:
        raise HTTPException(404, "Provider not found")
    for field, value in data.model_dump(exclude_unset=True).items():
        # The UI can no longer display the stored key, so its input renders
        # empty. Treat an empty submission as "leave the key alone" rather
        # than silently wiping a working credential; clearing is done by
        # deleting the provider.
        if field == "api_key" and not value:
            continue
        setattr(provider, field, value)
    db.commit()
    db.refresh(provider)
    return provider


@router.delete("/{provider_id}")
def delete_provider(
    provider_id: str, cascade: bool = False, db: Session = Depends(get_db)
):
    """Delete a provider.

    Past generations reference the provider by foreign key, so deleting one
    that has history raises an IntegrityError. Refuse with an explanation by
    default, or drop the dependent generations when ?cascade=true.
    """
    from app.models import Generation

    provider = db.query(Provider).filter(Provider.id == provider_id).first()
    if not provider:
        raise HTTPException(404, "Provider not found")

    dependents = (
        db.query(Generation).filter(Generation.provider_id == provider_id).count()
    )
    if dependents and not cascade:
        raise HTTPException(
            409,
            f"This provider is used by {dependents} past generation(s). "
            "Delete those first, or retry with ?cascade=true to remove them "
            "along with the provider.",
        )
    if dependents:
        for g in db.query(Generation).filter(Generation.provider_id == provider_id):
            db.delete(g)
        db.flush()

    db.delete(provider)
    db.commit()
    return {"ok": True, "deleted_generations": dependents}


@router.post("/test")
def test_connection(data: TestProviderRequest):
    if data.provider_type not in PROVIDER_PRESETS:
        raise HTTPException(400, f"Unknown provider type: {data.provider_type}")

    try:
        client = build_client(data.provider_type, data.api_key, data.base_url)
        models = client.list_models()
        return {"ok": True, "model_count": len(models)}
    except AiError as e:
        return {"ok": False, "error": str(e)}
    except Exception as e:
        return {"ok": False, "error": str(e)}


@router.post("/{provider_id}/test")
def test_saved_provider(provider_id: str, db: Session = Depends(get_db)):
    """Test a provider using its stored key.

    The unsaved-form variant above takes a key in the request body, but a
    saved provider's key is never sent to the browser, so the client can't
    echo it back - the test has to happen server-side.
    """
    provider = db.query(Provider).filter(Provider.id == provider_id).first()
    if not provider:
        raise HTTPException(404, "Provider not found")

    if provider.api_key_enc and provider.api_key is None:
        return {
            "ok": False,
            "error": "Stored API key could not be decrypted - has SECRET_KEY "
                     "changed? Re-enter the key to fix this.",
        }

    try:
        client = build_client(
            provider.provider_type, provider.api_key, provider.base_url
        )
        return {"ok": True, "model_count": len(client.list_models())}
    except Exception as e:
        return {"ok": False, "error": str(e)}


@router.post("/{provider_id}/models")
def fetch_models(provider_id: str, db: Session = Depends(get_db)):
    provider = db.query(Provider).filter(Provider.id == provider_id).first()
    if not provider:
        raise HTTPException(404, "Provider not found")
    # A local runtime (Ollama, LM Studio) legitimately has no key, so don't
    # require one - let the request fail on its own if the provider needs it.
    try:
        client = build_client(
            provider.provider_type, provider.api_key, provider.base_url
        )
        model_list = client.list_models()
    except AiError as e:
        raise HTTPException(400, f"Failed to fetch models: {e}")

    if isinstance(model_list, dict):
        model_list = list(model_list.values())
    if not isinstance(model_list, list):
        raise HTTPException(400, "Unexpected model list format from provider")

    existing_model_ids = {
        m.model_id for m in db.query(ProviderModel).filter(
            ProviderModel.provider_id == provider_id,
            ProviderModel.is_custom == False,
        ).all()
    }

    added = 0
    for item in model_list:
        model_id = item.get("id") or item.get("name") or item.get("modelId") or ""
        if not model_id:
            continue
        if model_id in existing_model_ids:
            continue
        display_name = item.get("display_name") or item.get("displayName") or model_id
        m = ProviderModel(
            provider_id=provider_id,
            model_id=model_id,
            display_name=display_name,
            is_custom=False,
            supports_vision=_is_vision_capable(provider.provider_type, model_id),
        )
        db.add(m)
        existing_model_ids.add(model_id)
        added += 1

    db.commit()
    return {"added": added, "total": len(existing_model_ids)}


@router.get("/{provider_id}/models", response_model=list[ProviderModelSchema])
def list_models(provider_id: str, db: Session = Depends(get_db)):
    return db.query(ProviderModel).filter(ProviderModel.provider_id == provider_id).all()


@router.post("/{provider_id}/models/custom", response_model=ProviderModelSchema)
def add_custom_model(provider_id: str, data: CustomModelCreate, db: Session = Depends(get_db)):
    provider = db.query(Provider).filter(Provider.id == provider_id).first()
    if not provider:
        raise HTTPException(404, "Provider not found")
    existing = db.query(ProviderModel).filter(
        ProviderModel.provider_id == provider_id,
        ProviderModel.model_id == data.model_id,
    ).first()
    if existing:
        raise HTTPException(400, "Model already exists")

    m = ProviderModel(
        provider_id=provider_id,
        model_id=data.model_id,
        display_name=data.display_name or data.model_id,
        is_custom=True,
        supports_vision=data.supports_vision or _is_vision_capable(
            provider.provider_type, data.model_id
        ),
    )
    db.add(m)
    db.commit()
    db.refresh(m)
    return m


@router.delete("/{provider_id}/models/{model_id_str}")
def delete_model(provider_id: str, model_id_str: str, db: Session = Depends(get_db)):
    m = db.query(ProviderModel).filter(
        ProviderModel.provider_id == provider_id,
        ProviderModel.id == model_id_str,
    ).first()
    if not m:
        raise HTTPException(404, "Model not found")
    db.delete(m)
    db.commit()
    return {"ok": True}
