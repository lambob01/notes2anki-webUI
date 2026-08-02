# AGENTS.md

## What this is

`notes2anki-webui` turns lecture PPTX/PDF/TXT into Anki cards via a vision LLM. FastAPI backend + Vite/React SPA shipped as **one container on port 8080**: FastAPI serves the API under `/api` and the built SPA from `backend/static`. No CORS in prod (same-origin). `PLAN.md` is the canonical design doc + migration status — read it before touching backend code; it tracks what's still open (SSE progress, `APP_PASSWORD`).

## Commands

- Backend (must run from `backend/`, DB path is relative): `uvicorn app.main:app --port 8080`
- Frontend dev: `cd frontend && npm run dev` — Vite on :3000, proxies `/api` to `127.0.0.1:8080` (override with `BACKEND_URL`). Frontend fetches use **relative** URLs only (`frontend/src/lib/api.ts`).
- Frontend check/build: `npm run build` runs `tsc --noEmit && vite build`
- Full app: `docker compose up --build` — requires `SECRET_KEY` in `.env` (see `.env.example`). `WITH_LIBREOFFICE=false` build arg drops the ~600MB LibreOffice renderer (PPTX vision path).

To serve the SPA from FastAPI when running the backend alone, copy `frontend/dist` → `backend/static` (it's gitignored and not auto-copied).

## Data & secrets

- SQLite with WAL: `backend/notes2anki.db` in dev, `/data/notes2anki.db` in Docker. Everything (providers, templates, generations, cards) lives in the DB; uploads/slides/exports go to temp dirs by default, `/data/*` in Docker.
- Provider API keys are Fernet-encrypted with a key derived from `SECRET_KEY`. If `SECRET_KEY` is unset locally, one is auto-generated to `backend/.secret_key` (dev convenience; Docker requires it explicitly). **Never return `api_key` from an endpoint** — only `key_set`/`key_hint` (see `app/crypto.py`, `app/schemas`). Changing `SECRET_KEY` makes stored keys undecryptable (degrades to `None`; UI re-prompts).
- On startup `main.py` marks any `running`/`pending` generations as failed (in-process background tasks die with the process). Re-runs skip already-processed slides via `ProcessedSlide` (file digest + slide index), so a restarted job resumes, not duplicates.

## LLM layer

- Two adapters only (`app/llm/registry.py`): `openai_compat` and `anthropic`. Gemini uses its OpenAI-compatible surface (`…/v1beta/openai/`), so no `google-genai`. Adding a provider = adding a preset, not a new adapter.
- Structured output has three tiers (`schema` → `json_object` → `prompt_only`) in `app/llm/base.py`. A 400 (`BadRequest`) downgrades one tier; `FatalProviderError` (bad key/quota) fails fast without retries. The winning tier is cached on `Provider.json_mode_tier`.
- Template fields drive everything: each field's `description` becomes the model's instruction, and `cards_schema()` constrains output to exactly the declared keys. The prompt-only fallback relies on the salvage parser `_extract_cards_json` + `_escape_bad_latex_backslashes` in `app/services/ai_generator.py`.
- Cards use LaTeX delimiters `\(...\)` / `\[...\]`, never `$...$` or `<anki-mathjax>`.

## Export / AnkiConnect

- `.apkg` export: model and deck IDs must come from a **stable hash of the name** — Python's `hash()` is salted per process and duplicates note types on every restart.
- AnkiConnect calls run **from the browser** against `http://127.0.0.1:8765` (`frontend/src/lib/ankiconnect.ts`), never the backend. The POST must have **no custom headers** or AnkiConnect won't answer the CORS preflight. This breaks over HTTPS (mixed content); `.apkg` is the fallback.

## Notes

- No test suite and no lint/typecheck config exist — verify by booting the server and curling `/api/health`, `/api/providers/presets`, etc.
- Vision capability is decided by provider name / model prefix in `app/config.py` (`VISION_CAPABLE_*`); update both when adding a vision model.
- PPTX rendering depends on LibreOffice (`libreoffice-impress`); without it the PPTX path must not silently fall back to text-only.
