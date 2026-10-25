# Topic Generation — Design Spec

**Date:** 2026-10-25
**Status:** Approved

## Goal

Let a user describe the flashcards they want in plain language and have the
model write them from established knowledge, without uploading a source
document. This is distinct from Text mode, which extracts cards from supplied
notes.

## UX

- A third Dashboard source tab: **Topic**.
- Large prompt box with example prompts that fill the box.
- Card count control: Auto, 5, 10, 15, 20, or a custom 1–30.
- A quiet notice that cards come from the model's knowledge and must be
  reviewed before export.
- Title defaults to a short version of the prompt.
- File-only controls (reprocess, DPI, parallel workers) are hidden in Topic
  and Text modes.
- Enrichment remains available. In Topic mode the copy says added depth goes in
  the answer field, without slide/`(not in slides)` language.
- History shows a `Topic` badge.
- Review shows a `Topic` badge and, after the run, a collapsible prompt panel
  with the original request and target count. Topic cards have no slide image.

## Backend

- Add `source_type="topic"`. The prompt is stored in `source_text`; the
  requested count is stored in a new nullable `target_card_count` column.
- `POST /api/generate` accepts `topic` and `target_card_count`. Sending both
  `topic` and `source_text`, or a count outside 1–30, is rejected.
- A dedicated topic prompt:
  - treats the user message as a request, not source material;
  - writes explanatory, self-contained cards from established knowledge;
  - covers definitions, mechanisms, equations, examples, and misconceptions
    where relevant;
  - never invents citations, precise statistics, or quotes;
  - produces one idea per card and follows the template's declared fields.
- Count guidance: exact count when requested, with a quality escape hatch
  (fewer rather than padding); model-decided coverage when Auto.
- Topic-aware enrichment composition: same presets, but no slide-specific
  preamble.
- Reruns copy the source type, prompt, and target count.
- Schemas expose `source_type` on list/status and `target_card_count` on the
  detail response.

## Verification

- Prompt, enrichment, route-validation, and background-generation tests.
- Frontend lint/build.
- Visual smoke test of Topic mode, Review prompt panel, and History badge.
