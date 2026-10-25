# Topic Generation — Implementation Plan

> Execute inline. Do not commit unless asked.

**Goal:** Add a Topic source that turns a plain-language request into explanatory
flashcards from model knowledge.

**Architecture:** A new `source_type="topic"` reuses the existing generation
queue, templates, review, and export paths. It branches to a dedicated prompt
builder and persists an optional target count. The frontend adds a third source
tab and surfaces topic metadata in History and Review.

## Task 1: Backend topic pipeline

**Files**
- Modify: `backend/app/models/__init__.py`
- Modify: `backend/app/schemas/__init__.py`
- Modify: `backend/app/services/card_specs.py`
- Modify: `backend/app/services/ai_generator.py`
- Modify: `backend/app/routers/generate.py`
- Create: `backend/tests/test_topic_generation.py`

- [x] Add `Generation.target_card_count` and expose it.
- [x] Add `topic` + `target_card_count` to `GenerateRequest`; add
      `source_type` to status/summary schemas.
- [x] Add `compose_topic_enrichment`.
- [x] Add `build_topic_prompt` + `generate_cards_topic`.
- [x] Branch `_run_generation` to `_process_topic`; cards have null slide
      indexes; phase is `writing`; rerun copies the count.
- [x] Tests cover request validation, stored config, prompt content, prompt
      enrichment, and the real background branch.
- [x] Verify: `python -m pytest tests/test_topic_generation.py`, full pytest,
      `ruff check .`.

## Task 2: Frontend Topic mode

**Files**
- Modify: `frontend/src/pages/Dashboard.tsx`
- Modify: `frontend/src/components/GenerationConfig.tsx`
- Modify: `frontend/src/components/HistoryTable.tsx`
- Modify: `frontend/src/components/RecentRuns.tsx`
- Modify: `frontend/src/components/layout/ActiveRunChip.tsx`
- Modify: `frontend/src/components/GenerationProgress.tsx`
- Modify: `frontend/src/pages/Review.tsx`
- Modify: `frontend/src/lib/types.ts`

- [x] Add `topic` mode, prompt box, example chips, count control, and knowledge
      notice.
- [x] Send `topic` + `target_card_count`; hide file-only settings outside File
      mode; adjust enrichment copy.
- [x] Show Topic badge in History and Recent; show source/count in Review with a
      collapsible prompt panel.
- [x] Update active-run/progress copy for the `writing` phase.
- [x] Verify: `npm run lint`, `npm run build`.

## Task 3: Final verification

- [x] Run backend tests and ruff.
- [x] Run frontend lint/build.
- [x] Rebuild static, restart the local server, smoke-test Topic mode visually.
