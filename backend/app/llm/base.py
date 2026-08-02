"""Provider-agnostic LLM interface.

Two adapters cover every provider we support. OpenAI, DeepSeek, OpenRouter,
Groq, Gemini (via its OpenAI-compatible surface), and local runtimes
(Ollama, LM Studio, vLLM, LocalAI) all speak the OpenAI chat-completions
dialect. Anthropic is the only one that needs its own request shape.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Protocol


class AiError(Exception):
    pass


class BadRequest(AiError):
    """A 400 from the provider.

    Almost always an unsupported parameter (typically ``response_format`` on a
    runtime that doesn't implement it), so callers catch this specifically and
    retry one structured-output tier down instead of failing the job.
    """


class FatalProviderError(AiError):
    """An error that retrying cannot fix.

    Bad credentials, a model the account can't use, quota exhausted. Without
    this distinction every slide burns its full retry budget on an error that
    was never going to resolve, turning a fast failure into a long one that
    looks like a hang.
    """


# Substrings that mark a provider error as permanent. Matched case-insensitively
# against the response body, since providers signal these very differently.
_FATAL_MARKERS = (
    "price not configured",       # vectorengine / new-api billing not set up
    "model_price_error",
    "insufficient_quota",
    "exceeded your current quota",
    "billing",
    "not have access to model",
    "does not exist or you do not have access",
    "model_not_found",
    "invalid_api_key",
    "incorrect api key",
    "unauthorized",
    "account is not active",
)


def is_fatal_provider_error(body: str) -> bool:
    low = (body or "").lower()
    return any(marker in low for marker in _FATAL_MARKERS)


@dataclass
class ProviderConfig:
    """A detached snapshot of the `providers` row, safe to use off-thread.

    The generation fan-out calls the LLM from worker threads while the main
    thread commits per-slide progress. Handing those threads the `Provider` ORM
    instance broke runs outright: `SessionLocal` uses the default
    ``expire_on_commit=True``, so every commit expired the instance, and the
    next worker to read ``api_key`` triggered a lazy refresh - emitting SQL on
    the main thread's Session from a different thread, which a Session does not
    support. Measured on a 40-slide job with 8 workers, that was 7-26 off-thread
    statements per run and roughly 3 runs in 10 dying part-way through with
    "This session is in 'prepared' state; no further SQL can be emitted within
    this transaction" - losing every remaining slide, after paying for the ones
    already sent.

    Plain values instead, read once on the owning thread. ``json_mode_tier`` is
    the one field workers still write: a downgrade is recorded here so sibling
    slides skip the tier this provider rejects, and the main thread persists
    the final value to the row once the fan-out is done. Two workers
    downgrading concurrently is harmless - they converge on the same tier - and
    unlike the ORM attribute it touches no database.
    """

    provider_type: str
    api_key: str | None
    base_url: str | None
    json_mode_tier: str | None = None

    @classmethod
    def from_row(cls, provider) -> "ProviderConfig":
        """Snapshot a `Provider` while on the thread that owns its Session."""
        return cls(
            provider_type=provider.provider_type,
            api_key=provider.api_key,
            base_url=provider.base_url,
            json_mode_tier=provider.json_mode_tier,
        )


class ChatMessage(dict):
    """A provider-neutral message. Content is either a string or a list of
    parts, where an image part is ``{"type": "image", "data": <base64 jpeg>}``.
    Each adapter translates parts into its own wire format.
    """


def text_part(text: str) -> dict[str, Any]:
    return {"type": "text", "text": text}


def image_part(image_b64: str) -> dict[str, Any]:
    return {"type": "image", "data": image_b64}


class LLMClient(Protocol):
    """Implemented by openai_compat.Client and anthropic.Client."""

    def list_models(self) -> list[dict[str, Any]]:
        """Return raw model dicts. Callers normalize; shapes differ per provider."""
        ...

    def complete(
        self,
        *,
        model: str,
        system: str | None,
        messages: list[dict[str, Any]],
        max_tokens: int = 4000,
        schema: dict[str, Any] | None = None,
        json_mode: bool = True,
        timeout: float = 120.0,
    ) -> str:
        """Return the assistant's raw text response."""
        ...


# Structured-output tiers, most to least capable. Probed once per provider and
# cached, so a provider that rejects schemas doesn't pay the 400 on every call.
TIER_SCHEMA = "schema"
TIER_JSON_OBJECT = "json_object"
TIER_PROMPT_ONLY = "prompt_only"

TIER_ORDER = (TIER_SCHEMA, TIER_JSON_OBJECT, TIER_PROMPT_ONLY)


def next_tier(tier: str) -> str | None:
    """The next tier to try after `tier` was rejected, or None if exhausted."""
    try:
        idx = TIER_ORDER.index(tier)
    except ValueError:
        return TIER_PROMPT_ONLY
    return TIER_ORDER[idx + 1] if idx + 1 < len(TIER_ORDER) else None


def cards_schema(field_names: list[str]) -> dict[str, Any]:
    """Build a JSON Schema constraining output to the note type's exact fields.

    This is what makes note types actually drive generation: the model can only
    emit the keys the template declares.
    """
    properties = {name: {"type": "string"} for name in field_names}
    return {
        "type": "object",
        "properties": {
            "cards": {
                "type": "array",
                "items": {
                    "type": "object",
                    "properties": properties,
                    "required": field_names,
                    "additionalProperties": False,
                },
            }
        },
        "required": ["cards"],
        "additionalProperties": False,
    }
