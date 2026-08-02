# notes2anki-webUI

Turn lecture PPTX/PDF/TXT into Anki flashcards via a vision LLM. Self-hosted, single container.

## What it does

- Upload a lecture PPTX/PDF/TXT (or paste text), pick a provider + model + card template
- The backend renders each slide to an image, sends it (plus speaker notes) to a vision LLM
- Structured output is steered by your note type's own field definitions, with automatic tier fallback (`json_schema` → `json_object` → prompt-only) for runtimes like Ollama and LM Studio
- Review, edit, and select cards before they hit Anki — each card carries a picture of its source slide
- Export as `.apkg` (with slide images embedded) or push straight into Anki via AnkiConnect

## Quickstart (Docker)

```bash
cp .env.example .env   # set SECRET_KEY
docker compose up --build
```

Then open http://localhost:8080. For the PPTX vision path, build with `WITH_LIBREOFFICE=false` to drop the ~600MB LibreOffice dependency (text-only fallback for PPTX).

### Security

**This app has no authentication, so compose binds it to `127.0.0.1` only.** Anyone who can reach port 8080 can spend your provider API credits, read every deck you've generated, and use `POST /api/providers/test` to make the host issue arbitrary HTTP requests to anything it can route to. Don't widen that bind, port-forward it, or put it behind a reverse proxy unless something in front is authenticating requests.

Reaching it from another device safely means a private network (Tailscale/WireGuard) or auth at the proxy (mTLS, an authenticating proxy) — not exposing it directly.

## Dev

- Backend (from `backend/`): `uvicorn app.main:app --port 8080`
- Frontend: `cd frontend && npm run dev` — Vite on :3000, proxies `/api` to 127.0.0.1:8080
- The SPA is served by FastAPI itself in prod (`backend/static`); copy `frontend/dist` there when running the backend alone

## Architecture

- **FastAPI + Vite/React SPA, one container on port 8080** — no CORS in prod, no Node at runtime
- **SQLite (WAL)** stores providers, templates, generations, cards; uploads/slides/exports in `/data/*`
- **Two LLM adapters** (`app/llm/registry.py`): `openai_compat` and `anthropic` — Gemini uses the OpenAI-compatible surface
- **Provider API keys** are Fernet-encrypted with a key derived from `SECRET_KEY`; never returned to the browser

See `PLAN.md` for the design doc and `AGENTS.md` for development conventions.
