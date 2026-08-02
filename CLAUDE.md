# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

`AGENTS.md` covers the same ground for other agent tools — keep the two in sync when conventions change. `PLAN.md` is the canonical design doc and migration status (it tracks what's still open: SSE progress, `APP_PASSWORD`); read it before non-trivial backend work.

## Commands

```bash
# Backend — must run from backend/, DATABASE_URL defaults to a relative sqlite path
cd backend && uvicorn app.main:app --port 8080

# Frontend dev — Vite on :3000, proxies /api to 127.0.0.1:8080 (override with BACKEND_URL)
cd frontend && npm run dev

# Typecheck + build (`tsc --noEmit && vite build`)
cd frontend && npm run build

# Backend tests — from backend/, after `pip install -r requirements-dev.txt`
cd backend && python -m pytest
cd backend && python -m pytest tests/test_latex.py::test_format_formula_wraps_bare_formula

# Full app — needs SECRET_KEY in .env (see .env.example)
docker compose up --build
# Build with WITH_LIBREOFFICE=false to drop the ~600MB LibreOffice layer (kills the PPTX vision path)
```

Backend tests cover only the pure logic that breaks silently — the JSON salvage parser, LaTeX normalization, and the slide-skipping heuristics. There is no route/integration coverage and no backend linter, so verify wiring changes by booting uvicorn and curling: `/api/health`, `/api/providers/presets`, `/api/templates`.

`backend/conftest.py` redirects `DATABASE_URL` and the data dirs at a temp directory **before the first `app` import**, because `app/__init__.py` does `from app.main import app` — importing anything under `app.` boots the whole application (`create_all`, `ensure_columns`, the legacy-key encryption pass). Without that redirect, running the tests migrates the developer's real `backend/notes2anki.db`.

To serve the SPA from FastAPI when running the backend alone, copy `frontend/dist` → `backend/static` (gitignored, not auto-copied).

## Architecture

**One FastAPI process on port 8080** serves `/api/*` and the built Vite SPA from `backend/static` (`main.py` mounts the SPA fallback *last* so it never shadows an API route; `api/` paths still 404 as JSON). Same-origin in prod, so CORS is opt-in via `CORS_ORIGINS` and `frontend/src/lib/api.ts` uses **relative URLs only**.

### Generation pipeline (`routers/generate.py` → `services/` → `llm/`)

1. `routers/notes.py` stores the upload under a content-hash filename in `UPLOAD_DIR` and reports whether that file's slides were already processed.
2. `POST /api/generate/from-file` creates a `Generation` row and hands `_run_generation` to FastAPI `BackgroundTasks` — **in-process**, so it dies with the server (see recovery below).
3. `services/document_reader.py` extracts text (PyMuPDF / python-pptx / python-docx) and renders slides to JPEG. PPTX goes LibreOffice → PDF → PyMuPDF rasterize; PDF goes straight to PyMuPDF. Title/agenda slides are skipped here — `_is_title_or_blank` must consult `has_visual` first, or a figure-only slide (no text layer at all) gets dropped before the vision model ever sees it, silently and with nothing in the UI to say so.
4. Whole-document text feeds one `generate_global_context` "syllabus" pass (capped at `MAX_CONTEXT_CHARS`), injected into every per-slide prompt.
5. A `ThreadPoolExecutor` fans out over pending slides; each calls `generate_cards_vision` (image + speaker notes). Progress is committed per slide, which also acts as the liveness heartbeat. **Worker threads get a detached `ProviderConfig` snapshot, never the `Provider` ORM row** — `SessionLocal` uses the default `expire_on_commit=True`, so each per-slide commit expires the row and the next worker's `provider.api_key` read would lazy-load it, emitting SQL on the main thread's Session from another thread. That aborted roughly 3 runs in 10 with `This session is in 'prepared' state`, losing every remaining slide after the failure. Anything else that needs DB state inside a worker must be snapshotted the same way.
6. Cards land in `cards` with `selected`/`sort_order`/`user_edited`; the review page polls the generation row for `phase`/`completed_slides`.

**Templates drive everything.** `CardTemplate.fields` is a JSON list of `{name, label, description, visible}`. Each field's `description` becomes that field's instruction in the system prompt (`build_card_prompt`), and the same names generate the JSON Schema (`cards_schema`), the review grid columns, the genanki model, and the CSV column order. `LEGACY_FIELD_HINTS` in `ai_generator.py` backfills descriptions for pre-existing templates.

### LLM layer (`app/llm/`)

Two adapters only, routed by `registry.py`: `openai_compat` and `anthropic`. Gemini uses its OpenAI-compatible surface (`…/v1beta/openai`), so there's no `google-genai` dep. **Adding a provider means adding a preset to `PROVIDER_PRESETS`, not a new adapter.**

Structured output has three tiers (`schema` → `json_object` → `prompt_only`, `base.py`). A `BadRequest` (400) downgrades one tier and the winner is cached on `Provider.json_mode_tier`, so a runtime that rejects schemas doesn't re-pay the 400 forever. `FatalProviderError` (bad key, no quota, unbillable model — matched on `_FATAL_MARKERS`) fails fast with no retries and cancels the rest of the job's slides. Other errors get 3 attempts with backoff.

The prompt-only tier depends on the salvage parser `_extract_cards_json` + `_escape_bad_latex_backslashes` in `ai_generator.py` — it's what makes Ollama/LM Studio usable. Don't "simplify" it.

Cards must use LaTeX delimiters `\(...\)` / `\[...\]` — never `$...$` or `<anki-mathjax>`. `services/latex.py` normalizes on the way in.

### Persistence

SQLite + WAL, `foreign_keys=ON`. `backend/notes2anki.db` in dev, `/data/notes2anki.db` in Docker. **`pysqlite3` is used instead of the stdlib module** — the macOS system libsqlite3 segfaults under concurrent access from the background task plus status polling. Treat that attribution as unconfirmed: the generation fan-out was also using one Session across threads (see pipeline step 5), which is the documented-unsafe pattern that crash is consistent with. Now that it's fixed, whether `pysqlite3` is still needed is worth re-testing rather than assuming.

Schema changes: `Base.metadata.create_all` + `ensure_columns()` (an additive `ALTER TABLE ADD COLUMN` sweep in `database.py`, with an explicit `DEFAULT` so pre-existing rows don't fail response validation). No Alembic — anything destructive needs a real migration tool.

`ProcessedSlide` dedups on (file SHA-256, slide index), so a re-run resumes rather than duplicating. `force=true` bypasses it.

### Crash/liveness recovery

Background tasks die with the process, so a `running` row would otherwise spin forever in the UI. Two guards: `main.py` startup marks all `running`/`pending` generations failed; `_reap_stale_running` (called on every generation GET) fails rows untouched for `STALE_RUN_MINUTES`.

### Secrets

`Provider.api_key` is a Python property over the Fernet-encrypted `api_key_enc` column (`crypto.py`, key derived from `SECRET_KEY`; auto-generated to `backend/.secret_key` in dev, required in Docker). **Never return `api_key` from an endpoint** — schemas expose only `key_set`/`key_hint`. Because the browser can't echo the key back, testing a *saved* provider is `POST /api/providers/{id}/test`, and an empty `api_key` on update is ignored so it can't wipe a working credential. Changing `SECRET_KEY` makes stored keys undecryptable (degrades to `None`, UI re-prompts).

### Export & AnkiConnect

`.apkg` export (`routers/export.py`) derives model and deck ids from `_stable_id` (md5 of the name). Python's `hash()` is salted per process — using it duplicates the note type in Anki on every restart.

**There are two write paths into Anki and they must produce identical cards**: `_anki_field` in `routers/export.py` and `escapeField` in `frontend/src/lib/ankiconnect.ts`. Both HTML-escape exactly `&`, `<`, `>` (Python's `html.escape(quote=False)`) and leave LaTeX delimiters intact; the `<img>` tags the exporters author themselves are the only unescaped markup. Change one and you change what a deck looks like depending on whether it arrived by `.apkg` or by sync.

`CardTemplate.mapping` + `anki_fields` support exporting into the user's own note type: multiple app sources (prompt/answer/formula/…/image) can be concatenated into one Anki field in `_SOURCE_ORDER`. A `mapping` of `None` means a legacy template — export uses `fields` verbatim and prepends the slide image to the front.

AnkiConnect calls run **from the browser** against `http://127.0.0.1:8765` (`frontend/src/lib/ankiconnect.ts`), never the backend. The POST must carry **no custom headers** or AnkiConnect won't answer the CORS preflight. This breaks over HTTPS (mixed content); `.apkg` is the fallback.

### Vision capability

Decided by provider name / model prefix in `app/config.py` (`VISION_CAPABLE_PROVIDERS`, `VISION_CAPABLE_MODEL_PREFIXES`) — update both when adding a vision model.

## Frontend

React 18 + react-router + TanStack Query + Tailwind, `@/` aliased to `src/`. Pages: `Dashboard` (upload + config + start), `History`, `Review/:id` (poll progress, edit/select cards, export), `Settings` (providers, models, templates — the largest file at ~670 lines). KaTeX renders card LaTeX via `components/Latex.tsx`.
