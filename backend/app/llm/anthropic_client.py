"""Anthropic Messages API adapter.

Differs from the OpenAI dialect in four ways that matter here:
  - auth is ``x-api-key`` plus a required ``anthropic-version`` header
  - the system prompt is a top-level parameter, not a message with role=system
  - images are ``{"type":"image","source":{"type":"base64",...}}``
  - ``max_tokens`` is required, not optional
"""

from __future__ import annotations

from typing import Any

import httpx

from app.llm.base import (
    AiError,
    BadRequest,
    FatalProviderError,
    is_fatal_provider_error,
    TIER_SCHEMA,
    TIER_JSON_OBJECT,
)

ANTHROPIC_VERSION = "2023-06-01"
DEFAULT_BASE_URL = "https://api.anthropic.com"


class Client:
    def __init__(self, api_key: str, base_url: str | None = None):
        if not api_key:
            raise AiError("Anthropic requires an API key")
        self.api_key = api_key
        self.base_url = (base_url or DEFAULT_BASE_URL).rstrip("/")

    @property
    def _headers(self) -> dict[str, str]:
        return {
            "x-api-key": self.api_key,
            "anthropic-version": ANTHROPIC_VERSION,
            "content-type": "application/json",
        }

    def list_models(self) -> list[dict[str, Any]]:
        url = f"{self.base_url}/v1/models"
        try:
            resp = httpx.get(url, headers=self._headers, timeout=15)
            resp.raise_for_status()
        except httpx.HTTPStatusError as e:
            raise AiError(f"Anthropic returned {e.response.status_code}: {e.response.text[:200]}")
        except Exception as e:
            raise AiError(f"Could not reach Anthropic: {e}")
        return resp.json().get("data", [])

    def _to_anthropic_content(self, content: Any) -> Any:
        """Translate neutral parts into Anthropic content blocks."""
        if isinstance(content, str):
            return content
        blocks: list[dict[str, Any]] = []
        for part in content:
            if part.get("type") == "image":
                blocks.append(
                    {
                        "type": "image",
                        "source": {
                            "type": "base64",
                            "media_type": "image/jpeg",
                            "data": part["data"],
                        },
                    }
                )
            else:
                blocks.append({"type": "text", "text": part.get("text", "")})
        return blocks

    def complete(
        self,
        *,
        model: str,
        system: str | None,
        messages: list[dict[str, Any]],
        max_tokens: int = 4000,
        schema: dict[str, Any] | None = None,
        json_mode: bool = True,
        tier: str = TIER_SCHEMA,
        timeout: float = 120.0,
    ) -> str:
        body: dict[str, Any] = {
            "model": model,
            # Required by Anthropic, unlike the OpenAI dialect where it's optional.
            "max_tokens": max_tokens,
            "messages": [
                {"role": m["role"], "content": self._to_anthropic_content(m["content"])}
                for m in messages
                # A system message would be silently ignored; it belongs top-level.
                if m["role"] != "system"
            ],
        }
        if system:
            body["system"] = system
        if schema is not None and tier == TIER_SCHEMA:
            body["output_config"] = {"format": {"type": "json_schema", "schema": schema}}

        try:
            resp = httpx.post(
                f"{self.base_url}/v1/messages",
                headers=self._headers,
                json=body,
                timeout=httpx.Timeout(timeout, connect=15.0),
            )
        except Exception as e:
            raise AiError(f"Anthropic request failed: {e}")

        if resp.status_code == 401:
            raise FatalProviderError(
                "Anthropic authentication failed - check the API key"
            )
        if resp.status_code == 400:
            body = resp.text[:400]
            if is_fatal_provider_error(body):
                raise FatalProviderError(f"Anthropic rejected the request: {body}")
            # Surfaced so the caller can drop a tier and retry rather than give up.
            raise BadRequest(body)
        if resp.status_code >= 400:
            body = resp.text[:400]
            if is_fatal_provider_error(body):
                raise FatalProviderError(f"Anthropic returned {resp.status_code}: {body}")
            raise AiError(f"Anthropic returned {resp.status_code}: {body}")

        data = resp.json()

        # A refusal is a 200 with an empty/partial content array - check before indexing.
        if data.get("stop_reason") == "refusal":
            raise AiError("Anthropic declined this request (safety refusal)")

        parts = [b.get("text", "") for b in data.get("content", []) if b.get("type") == "text"]
        if not parts:
            raise AiError("Anthropic returned no text content")
        return "".join(parts)

