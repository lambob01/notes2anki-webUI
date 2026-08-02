"""Provider presets and adapter routing."""

from __future__ import annotations

from app.llm import anthropic_client, openai_compat
from app.llm.base import AiError

KIND_OPENAI = "openai_compat"
KIND_ANTHROPIC = "anthropic"

# base_url is the default; users can override it (required for `custom`).
# Gemini deliberately uses its OpenAI-compatible surface so it needs no third
# adapter and no google-genai dependency.
PROVIDER_PRESETS: dict[str, dict] = {
    "openai": {
        "base_url": "https://api.openai.com/v1",
        "kind": KIND_OPENAI,
        "label": "OpenAI",
    },
    "anthropic": {
        "base_url": "https://api.anthropic.com",
        "kind": KIND_ANTHROPIC,
        "label": "Anthropic",
    },
    "gemini": {
        "base_url": "https://generativelanguage.googleapis.com/v1beta/openai",
        "kind": KIND_OPENAI,
        "label": "Google Gemini",
    },
    "deepseek": {
        "base_url": "https://api.deepseek.com/v1",
        "kind": KIND_OPENAI,
        "label": "DeepSeek",
    },
    "openrouter": {
        "base_url": "https://openrouter.ai/api/v1",
        "kind": KIND_OPENAI,
        "label": "OpenRouter",
    },
    "groq": {
        "base_url": "https://api.groq.com/openai/v1",
        "kind": KIND_OPENAI,
        "label": "Groq",
    },
    "ollama": {
        "base_url": "http://localhost:11434/v1",
        "kind": KIND_OPENAI,
        "label": "Ollama (local)",
    },
    "lmstudio": {
        "base_url": "http://localhost:1234/v1",
        "kind": KIND_OPENAI,
        "label": "LM Studio (local)",
    },
    "custom": {
        "base_url": "",
        "kind": KIND_OPENAI,
        "label": "Custom (OpenAI-compatible)",
    },
}


def kind_for(provider_type: str) -> str:
    preset = PROVIDER_PRESETS.get(provider_type)
    if not preset:
        raise AiError(f"Unknown provider type: {provider_type}")
    return preset["kind"]


def build_client(provider_type: str, api_key: str | None, base_url: str | None):
    """Return an adapter satisfying the LLMClient protocol."""
    preset = PROVIDER_PRESETS.get(provider_type)
    if not preset:
        raise AiError(f"Unknown provider type: {provider_type}")

    resolved_url = (base_url or preset["base_url"]).rstrip("/")

    if preset["kind"] == KIND_ANTHROPIC:
        return anthropic_client.Client(api_key=api_key or "", base_url=resolved_url)
    return openai_compat.Client(api_key=api_key, base_url=resolved_url)
