"""OpenAI chat-completions adapter.

Covers OpenAI, DeepSeek, OpenRouter, Groq, Gemini (via its OpenAI-compatible
surface at /v1beta/openai/), and local runtimes (Ollama, LM Studio, vLLM,
LocalAI). Uses httpx directly rather than the openai SDK so that local
runtimes with partial API coverage don't trip SDK-side validation.
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


class Client:
    def __init__(self, api_key: str | None, base_url: str):
        if not base_url:
            raise AiError("An OpenAI-compatible provider requires a base URL")
        self.api_key = api_key
        self.base_url = base_url.rstrip("/")

    @property
    def _headers(self) -> dict[str, str]:
        headers = {"content-type": "application/json"}
        # Local runtimes (Ollama, LM Studio) typically need no key at all.
        if self.api_key:
            headers["Authorization"] = f"Bearer {self.api_key}"
        return headers

    def list_models(self) -> list[dict[str, Any]]:
        try:
            resp = httpx.get(f"{self.base_url}/models", headers=self._headers, timeout=15)
            resp.raise_for_status()
        except httpx.HTTPStatusError as e:
            raise AiError(f"Provider returned {e.response.status_code}: {e.response.text[:200]}")
        except Exception as e:
            raise AiError(f"Could not reach provider: {e}")
        data = resp.json()
        models = data.get("data") or data.get("models") or []
        return models if isinstance(models, list) else []

    def _to_openai_content(self, content: Any) -> Any:
        """Translate neutral parts into OpenAI content parts."""
        if isinstance(content, str):
            return content
        parts: list[dict[str, Any]] = []
        for part in content:
            if part.get("type") == "image":
                parts.append(
                    {
                        "type": "image_url",
                        "image_url": {"url": f"data:image/jpeg;base64,{part['data']}"},
                    }
                )
            else:
                parts.append({"type": "text", "text": part.get("text", "")})
        return parts

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
        wire: list[dict[str, Any]] = []
        if system:
            wire.append({"role": "system", "content": system})
        wire.extend(
            {"role": m["role"], "content": self._to_openai_content(m["content"])}
            for m in messages
        )

        body: dict[str, Any] = {
            "model": model,
            "messages": wire,
            "max_tokens": max_tokens,
        }
        if tier == TIER_SCHEMA and schema is not None:
            body["response_format"] = {
                "type": "json_schema",
                "json_schema": {"name": "cards", "strict": True, "schema": schema},
            }
        elif tier == TIER_JSON_OBJECT and json_mode:
            body["response_format"] = {"type": "json_object"}

        try:
            resp = httpx.post(
                f"{self.base_url}/chat/completions",
                headers=self._headers,
                json=body,
                timeout=httpx.Timeout(timeout, connect=15.0),
            )
        except Exception as e:
            raise AiError(f"Request failed: {e}")

        if resp.status_code == 401:
            raise FatalProviderError("Authentication failed - check the API key")
        if resp.status_code == 400:
            body = resp.text[:400]
            # A 400 naming a missing/unbillable model won't fix on retry.
            if is_fatal_provider_error(body):
                raise FatalProviderError(f"Provider rejected the request: {body}")
            # Otherwise it's usually an unsupported response_format; let the
            # caller drop a tier and retry rather than failing the whole job.
            raise BadRequest(body)
        if resp.status_code >= 400:
            body = resp.text[:400]
            # Billing, quota and model-access failures are permanent. Some
            # gateways report them as 500s, so match on the body, not the code.
            if is_fatal_provider_error(body):
                raise FatalProviderError(
                    f"Provider returned {resp.status_code}: {body}"
                )
            raise AiError(f"Provider returned {resp.status_code}: {body}")

        data = resp.json()
        choices = data.get("choices") or []
        if not choices:
            raise AiError("Provider returned no choices")
        return choices[0].get("message", {}).get("content") or ""

