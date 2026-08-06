from __future__ import annotations

import base64
import json
import re
import time
from typing import Any

from app.llm.base import (
    TIER_JSON_OBJECT,
    TIER_PROMPT_ONLY,
    TIER_SCHEMA,
    BadRequest,
    FatalProviderError,
    ProviderConfig,
    cards_schema,
    image_part,
    next_tier,
    text_part,
)
from app.llm.base import (
    AiError as _LlmError,
)
from app.llm.registry import build_client

# Long lectures are capped before the whole-document syllabus pass, so a huge
# deck cannot blow the model's input window.
MAX_CONTEXT_CHARS = 80_000


CARD_PROMPT_HEADER = """You are an expert educator and spaced repetition card writer.

Analyze the provided content and create high-quality Anki flashcards only for testable academic material.

Return a JSON object with exactly this shape:
{shape}

Each card object must contain exactly these fields:
{field_docs}

Rules:
1. If the content is a title slide, agenda, overview, logistics, decorative image, or has no testable material, return {{"cards":[]}}. Never write cards about the presenter, the course, or the lecture itself.
2. Each card must test one idea only.
3. Use plain text. Do not use Markdown, HTML, cloze syntax, or Anki-specific tags.
4. Use LaTeX for mathematical expressions in any field. Inline math must use \\(...\\), display math must use \\[...\\]. Never use $...$ or <anki-mathjax>.
5. Leave a field as an empty string when the content does not supply it. Never omit a key.
6. Populate "example question" and "solution" only when the content explicitly contains an exercise, practice problem, or worked example.
7. If the slide's key content is a diagram, chart, figure, or illustration that is best learned with image occlusion, return exactly one card and no others: its prompt must start with "RECOMMENDATION: Use Image Occlusion for " followed by a short name for the figure, and its "answer" field (or the template's back-content field) should list what to occlude (labels, regions, parts). Do not also generate text cards for that diagram - the single recommendation card replaces them all.
8. Do not invent facts. If essential context is inferred from the global lecture context rather than present in the content, append "(not in slides)" to the prompt.
9. Return valid JSON only. No code fences or explanatory text.

{global_context}
{card_count_hint}
"""

# Deliberately not a number. A fixed target fights rule 2 (one idea per card):
# too low and the model crams several facts onto one card, too high and it pads
# with filler. Let coverage decide the count instead.
CARD_COUNT_HINT = (
    "Generate exactly as many cards as the content warrants - no more, no less.\n"
    "Every distinct testable fact, definition, relationship, or formula in the\n"
    "content should be covered by at least one card. Do not merge separate ideas\n"
    "onto one card to keep the count down, and do not invent, pad, or restate\n"
    "material to make the set look fuller. Sparse content should yield few cards;\n"
    "dense content should yield many."
)

# Fallback descriptions for the fields the original CLI note type used, so
# templates created before per-field descriptions existed still guide the model.
LEGACY_FIELD_HINTS = {
    "prompt": "The question (front of the card).",
    "answer": "The answer (back of the card).",
    "formula": "Any relevant formula in LaTeX. Empty string if none.",
    "example question": "Only if the content contains an explicit practice problem or worked example, otherwise empty.",
    "solution": "The worked solution. Only populate when 'example question' is non-empty.",
    "topic": "A brief subject tag, e.g. 'Biology' or 'Machine Learning'.",
    "extra": "Supplementary context. Empty string if none.",
    "front": "The question (front of the card).",
    "back": "The answer (back of the card).",
    "text": "The full sentence with cloze deletions marked as {{c1::...}}.",
}


def build_card_prompt(
    template_fields: list[dict] | None,
    subject_context: str | None,
) -> str:
    """Compose the system prompt from the note type's own field definitions.

    A field's `description` is its instruction to the model - this is what
    makes a user-defined note type actually steer generation rather than the
    model guessing at a hardcoded field set.
    """
    fields = template_fields or [{"name": "prompt"}, {"name": "answer"}]

    field_docs = []
    for f in fields:
        name = f.get("name")
        if not name:
            continue
        desc = (
            f.get("description")
            or LEGACY_FIELD_HINTS.get(name.lower())
            or f.get("label")
            or "Content for this field."
        )
        field_docs.append(f'- "{name}": {desc}')

    names = [f.get("name") for f in fields if f.get("name")]
    shape = json.dumps({"cards": [{n: "" for n in names}]})

    return CARD_PROMPT_HEADER.format(
        shape=shape,
        field_docs="\n".join(field_docs),
        global_context=(f"Subject context: {subject_context}\n" if subject_context else ""),
        card_count_hint=CARD_COUNT_HINT,
    )


# Single exception type shared with the adapter layer, so `except AiError`
# in generate.py catches provider errors too.
AiError = _LlmError


def generate_cards_text(
    provider: ProviderConfig,
    model_name: str,
    text: str,
    template_fields: list[dict],
    custom_prompt: str | None = None,
    subject_context: str | None = None,
    global_context: str = "",
) -> list[dict]:
    prompt = build_card_prompt(template_fields, subject_context)
    if global_context.strip():
        prompt += f"\n\nGlobal lecture context:\n{global_context}"
    if custom_prompt:
        prompt = custom_prompt + "\n\n" + prompt

    # System goes as a separate argument: Anthropic takes it top-level, and the
    # OpenAI adapter re-inserts it as messages[0].
    cards = _call_llm(
        provider,
        model_name,
        [{"role": "user", "content": text}],
        system=prompt,
        field_names=_field_names(template_fields),
    )
    return _normalize_card_fields(cards, template_fields)


def generate_cards_vision(
    provider: ProviderConfig,
    model_name: str,
    image_bytes: bytes,
    notes: str,
    source_filename: str,
    slide_index: int,
    template_fields: list[dict],
    custom_prompt: str | None = None,
    subject_context: str | None = None,
    global_context: str = "",
) -> list[dict]:
    prompt = build_card_prompt(template_fields, subject_context)
    if global_context.strip():
        prompt += f"\n\nGlobal lecture context:\n{global_context}"
    if custom_prompt:
        prompt = custom_prompt + "\n\n" + prompt

    image_b64 = base64.b64encode(image_bytes).decode("utf-8")

    # Provider-neutral parts; each adapter renders them into its own wire
    # format (image_url for OpenAI, source/base64 blocks for Anthropic).
    content: list[dict] = [image_part(image_b64)]
    if notes.strip():
        content.append(text_part(f"Speaker notes:\n{notes}"))

    cards = _call_llm(
        provider,
        model_name,
        [{"role": "user", "content": content}],
        system=prompt,
        field_names=_field_names(template_fields),
    )

    for card in cards:
        card["slide_index"] = slide_index
        card["source_filename"] = source_filename

    return _normalize_card_fields(cards, template_fields)


def _call_llm(
    provider: ProviderConfig,
    model_name: str,
    messages: list,
    system: str | None = None,
    field_names: list[str] | None = None,
) -> list[dict]:
    """Run one completion, walking down the structured-output tiers on rejection.

    Every provider goes through the same two adapters (see app/llm/registry).
    A provider that rejects JSON-schema mode with a 400 is retried one tier
    down rather than failing the job, which is what makes local runtimes like
    Ollama and LM Studio usable.

    Runs on a worker thread during the slide fan-out, so `provider` must be a
    detached `ProviderConfig` and never the ORM row - see its docstring.
    """
    client = build_client(
        provider.provider_type,
        provider.api_key,
        provider.base_url,
    )

    schema = cards_schema(field_names) if field_names else None
    # Resume from the tier that last worked for this provider, so we don't
    # re-pay the 400 on every request.
    tier = provider.json_mode_tier or (
        TIER_SCHEMA if schema else TIER_JSON_OBJECT
    )

    starting_tier = tier
    last_error = ""
    for attempt in range(1, 4):
        try:
            raw = client.complete(
                model=model_name,
                system=system,
                messages=messages,
                max_tokens=4000,
                schema=schema,
                tier=tier,
                timeout=120,
            )
            if tier != starting_tier:
                # Remember the downgrade so sibling slides in this job - and,
                # once the caller persists this snapshot, every later job -
                # skip the tiers this provider rejects.
                provider.json_mode_tier = tier
            return _extract_cards_json(raw)
        except FatalProviderError:
            # Bad key, unbillable model, no quota - retrying just wastes time
            # and makes a permanent failure look like a hang.
            raise
        except BadRequest as e:
            downgraded = next_tier(tier)
            if downgraded is None:
                raise AiError(f"Request rejected: {e}")
            tier = downgraded
            last_error = str(e)
            continue
        except AiError as e:
            # Transport errors (timeouts, dropped connections) and provider
            # 5xxs are transient - a flaky gateway marks a slide failed on the
            # first hiccup otherwise, and the re-run it forces re-processes the
            # same slides from the top. Retry within this slide's attempt
            # budget instead. FatalProviderError and BadRequest are caught
            # above and keep their special handling.
            last_error = str(e)
        except Exception as e:
            last_error = str(e)
        if attempt < 3:
            time.sleep(2 * attempt)

    raise AiError(f"AI generation failed after 3 attempts: {last_error}")


def generate_global_context(
    provider: ProviderConfig, model_name: str, document_text: str
) -> str:
    if not document_text.strip():
        return ""

    # A long lecture can exceed the model's input window; the syllabus pass
    # only needs the arc of the course, so feed it a capped prefix.
    document_text = document_text[:MAX_CONTEXT_CHARS]

    prompt = (
        "Create a concise lecture syllabus and concept map from this extracted lecture text. "
        "Focus on learning objectives and major topics. Return plain text only.\n\n"
        f"{document_text}"
    )
    client = build_client(provider.provider_type, provider.api_key, provider.base_url)
    try:
        return client.complete(
            model=model_name,
            system=None,
            messages=[{"role": "user", "content": prompt}],
            max_tokens=1800,
            schema=None,
            # Plain prose, not JSON - don't ask for structured output here.
            tier=TIER_PROMPT_ONLY,
            timeout=120,
        )
    except Exception as e:
        raise AiError(f"Could not generate global context: {e}")


def _field_names(template_fields: list[dict] | None) -> list[str] | None:
    """Field names from the note type, used to constrain output to exactly
    the fields the template declares."""
    if not template_fields:
        return None
    names = [f.get("name") for f in template_fields if f.get("name")]
    return names or None


def _normalize_card_fields(cards: list[dict], template_fields: list[dict] | None) -> list[dict]:
    """Sanitize model output before it reaches the DB and Anki.

    Every declared field gets LaTeX normalized so it renders in the review UI
    and in Anki (delimiters canonicalized to \\(...\\) / \\[...\\]); the
    "formula" field additionally gets wrapped in a single display block.
    """
    from app.services.latex import format_formula, normalize_latex

    names = _field_names(template_fields) or []
    normalized = []
    for card in cards:
        cleaned = dict(card)
        for name in names:
            if name in cleaned and isinstance(cleaned[name], str):
                value = normalize_latex(cleaned[name])
                if name.lower() == "formula":
                    value = format_formula(value)
                cleaned[name] = value
        normalized.append(cleaned)
    return normalized


def _extract_cards_json(raw_text: str) -> list[dict]:
    text = raw_text.strip()
    if text.startswith("```"):
        text = re.sub(r"^```(?:json)?\s*", "", text)
        text = re.sub(r"\s*```$", "", text)

    first_json = re.search(r"[\[{]", text)
    if first_json:
        text = text[first_json.start():]

    text = _escape_bad_latex_backslashes(text)

    candidates = [text]
    for end in range(len(text), 0, -1):
        if text[end - 1] in "]}":
            trimmed = text[:end]
            candidates.extend([trimmed, f"{trimmed}]}}", f"{trimmed}}}"])
            break

    for candidate in candidates:
        try:
            parsed = json.loads(candidate)
            return _coerce_cards(parsed)
        except json.JSONDecodeError:
            continue

    raise AiError("The AI returned text that was not valid JSON.")


def _coerce_cards(parsed: Any) -> list[dict]:
    if isinstance(parsed, dict):
        cards = parsed.get("cards")
        if isinstance(cards, list):
            return [item for item in cards if isinstance(item, dict)]
        for value in parsed.values():
            if isinstance(value, list):
                return [item for item in value if isinstance(item, dict)]
        return [parsed]
    if isinstance(parsed, list):
        return [item for item in parsed if isinstance(item, dict)]
    return []


def _escape_bad_latex_backslashes(text: str) -> str:
    text = re.sub(r'(?<!\\)\\([^"\\/bfnrtu])', r"\\\\\1", text)
    text = re.sub(r"(?<!\\)\\u(?![0-9a-fA-F]{4})", r"\\\\u", text)
    text = re.sub(r"(?<!\\)\\f(?=rac|orall)", r"\\\\f", text)
    text = re.sub(r"(?<!\\)\\b(?=egin|eta|ar\b|inom|oxed|ig)", r"\\\\b", text)
    text = re.sub(r"(?<!\\)\\n(?=u\b|abla|eq\b|ot\\)", r"\\\\n", text)
    text = re.sub(r"(?<!\\)\\t(?=heta|au\b|ilde|imes|ext\{|o\b)", r"\\\\t", text)
    text = re.sub(r"(?<!\\)\\r(?=ho\b|ight|angle)", r"\\\\r", text)
    return text
