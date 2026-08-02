# notes2anki-webui — Migration Plan

## Context

`lambob01/notes2anki` is a working CLI that turns lecture PPTX/PDF into Anki cards: it renders each slide to a 150-DPI JPEG (LibreOffice → PDF → PyMuPDF), sends the image plus speaker notes to a vision LLM, and pushes results into a running Anki desktop via AnkiConnect. It's locked to one provider (`vectorengine.ai`), one custom note type (`ChemEng`), and requires Anki open on the same machine, with no chance to review a bad card before it lands in your collection.

This repo is the self-hosted web replacement. **A working FastAPI + Next.js implementation already exists here** — this document is the migration from what's on disk to the target architecture, not a from-scratch build.

### What already works

Verified by booting the backend and hitting it directly:

- **~1,100 lines of functioning FastAPI** across `providers`, `templates`, `notes`, `generate`, `cards`, `export` routers. `/api/health`, `/api/providers/presets`, and `/api/templates` all respond correctly.
- **Data model is sound and worth keeping.** `CardTemplate` (fields JSON + css), `Generation`, `Card` (with `selected`, `sort_order`, `user_edited`), `ProviderModel`, `ProcessedSlide`. SQLite with WAL and `foreign_keys=ON`.
- **The valuable CLI logic is already ported**: `generate_global_context` (whole-deck syllabus pass), the `ThreadPoolExecutor` fan-out over slides, `ProcessedSlide` dedup keyed on file digest + slide index, and `_extract_cards_json` / `_escape_bad_latex_backslashes` (the salvage parser).
- **Model auto-discovery works** for all three response shapes (`data` / `models` / `model`), with custom-model entry and persistence in `provider_models`.
- **Full Next.js App Router frontend**: `settings/`, `history/`, `review/[id]/` pages plus `CardReviewGrid`, `FileDropZone`, `GenerationConfig`, `ExportPanel`.

### The gaps

| # | Gap | Evidence |
|---|---|---|
| 1 | **Anthropic and Gemini don't generate at all** | `ai_generator.py:159,163` — both `_call_*` functions are stubs that `raise AiError("not yet implemented")` |
| 2 | **Note types don't drive the prompt** | `CARD_PROMPT` hardcodes `prompt/answer/formula/example question/solution/topic`; `template_fields` is passed in but never used to shape output |
| 3 | **No structured output** | Prompt-only JSON, relying entirely on the salvage parser — no `response_format` / `output_config` |
| 4 | ~~API keys stored in plaintext~~ | **DONE** - Fernet-encrypted at rest; `ProviderSchema` returned the raw key to every browser |
| 5 | ~~Two containers, wrong ports~~ | **DONE** - single container on 8080, FastAPI serves the Vite SPA |
| 6 | ~~PPTX vision path broken in Docker~~ | **DONE** - `libreoffice-impress` added behind `WITH_LIBREOFFICE` build arg |
| 7 | **No AnkiConnect integration** | Module D spec item, entirely absent |
| 8 | ~~No auth, `allow_origins=["*"]`~~ | **WON'T FIX** - CORS is opt-in via `CORS_ORIGINS`; the `APP_PASSWORD` gate was dropped, and the app is bound to loopback instead (see step 3) |
| 9 | **No progress feedback** | Generation runs as a background task with no SSE/polling channel; the UI can't show per-slide progress |
| 10 | ~~Vision path crashed for every provider~~ | **FIXED** - `CARD_COUNT_HINT.format(target_card_count=…)` raised `KeyError: 'target_count'` before any LLM call |
| 11 | ~~`.apkg` export returned HTTP 500~~ | **FIXED** - `gen.note_type` doesn't exist (it's on `CardTemplate`); `genanki.NOTE_TYPE_BASIC` isn't a real constant |
| 12 | ~~Anki re-import duplicated note types~~ | **FIXED** - model/deck ids came from `hash()`, which is salted per process, so they changed on every restart |

## Target architecture

**FastAPI + React SPA in one container on port 8080.** Vite builds the SPA at image build time; FastAPI serves the static bundle at `/` and the API under `/api`. One process, one port, no CORS, no Node at runtime. This is the change from the current two-container Next.js setup.

**Two provider adapters, not four.** OpenAI, DeepSeek, OpenRouter, Groq, LocalAI, Ollama, LM Studio, and vLLM all speak `POST /v1/chat/completions` + `GET /v1/models`. **Gemini also exposes an OpenAI-compatible surface** at `https://generativelanguage.googleapis.com/v1beta/openai/`, so it uses that same adapter and the `google-genai` dependency is dropped. Anthropic is the only genuine second adapter:

| | OpenAI-compatible | Anthropic |
|---|---|---|
| Chat | `POST {base}/chat/completions` | `POST {base}/v1/messages` |
| Models | `GET {base}/models` | `GET {base}/v1/models` |
| Auth | `Authorization: Bearer <key>` | `x-api-key` + `anthropic-version: 2023-06-01` |
| System prompt | `messages[0].role = "system"` | top-level `system` param |
| Image part | `{"type":"image_url","image_url":{"url":"data:image/jpeg;base64,…"}}` | `{"type":"image","source":{"type":"base64","media_type":"image/jpeg","data":"…"}}` |
| Structured JSON | `response_format:{"type":"json_schema","json_schema":{…,"strict":true}}` | `output_config:{"format":{"type":"json_schema","schema":{…}}}` |
| Token cap | `max_tokens` | `max_tokens` (**required**) |

Both satisfy one protocol so `generate.py` stays provider-agnostic:

```python
class LLMClient(Protocol):
    async def list_models(self) -> list[str]: ...
    async def generate(self, *, system: str, text: str,
                       image_b64: str | None, schema: dict) -> list[dict]: ...
```

**Structured output in three tiers**, probed once per provider and cached on the row:

1. **JSON Schema** (`response_format` / `output_config.format`) — guarantees valid, correctly-keyed output.
2. **JSON object** (`{"type":"json_object"}`) — for providers that reject a schema.
3. **Prompt-only + salvage** — the existing `_extract_cards_json`. Keep it; it's what makes Ollama and LM Studio usable.

**Note types drive everything.** `CardTemplate.fields` gains a `description` per field, which is injected into the system prompt as that field's instruction — this is the "dynamic prompt mapping" spec item. The same list then generates the JSON Schema, the `genanki.Model` field list, the review grid columns, and the CSV column order. Replaces the hardcoded `CARD_PROMPT` field set.

## Migration steps

Ordered by value. Steps 1–3 are backend-only and independently testable; 4 is the big frontend move.

**1. Anthropic adapter + Gemini via OpenAI-compat** *(fixes gap 1 — two of six spec'd providers are dead)*
Create `app/llm/{base,openai_compat,anthropic,presets}.py` implementing `LLMClient`. Move request-building out of `ai_generator.py`, leaving it as prompt assembly + parsing. Repoint the `gemini` preset at `…/v1beta/openai/` and route it through `openai_compat`; drop `google-genai` from requirements.

**2. Field-driven prompts + JSON schema** *(fixes gaps 2 and 3)*
Add `description` to the template field schema. Build the system prompt and a JSON Schema (`required`, `additionalProperties: false`) from `template_fields`. Implement tier probing, storing the winner on `Provider.json_mode_tier`. Seed **Basic** (Front/Back), **Cloze** (`model_type=genanki.Model.CLOZE`), and keep the existing 7-field template as **Lecture** so current collections stay compatible.

**3. Encrypt keys, scope CORS, optional password** — ✅ **DONE** (`APP_PASSWORD` dropped, see below)
`app/crypto.py` derives a Fernet key from `SECRET_KEY` (auto-generated into `DATA_DIR/.secret_key` for local dev, required by compose). `Provider.api_key` is now a Python property over an encrypted `api_key_enc` column, so every existing call site kept working unchanged; the old plaintext column is mapped aside as `legacy_api_key` purely so a startup migration can encrypt existing rows and blank it. `ProviderSchema` exposes only `key_set` + `key_hint` — never the key. An undecryptable key (changed `SECRET_KEY`) degrades to `None` with a red "re-enter it" state in the UI rather than crashing. Because the browser can no longer echo the key back, connection testing for a *saved* provider moved to `POST /api/providers/{id}/test`, and an empty `api_key` on update is ignored so it can't silently wipe a working credential.

`APP_PASSWORD` will not be built. It was listed in `docker-compose.yml` and `.env.example` as though it gated the UI, but nothing ever read it, so setting it protected nothing — worse than having no such setting at all. A login gate isn't wanted, so both references are removed and compose now binds `127.0.0.1:8080:8080`: the app has no authentication and must not be reachable off-host. A reverse proxy has to run on the same host and target loopback.

Longer term this stops mattering, because the LLM calls and all stored state move into the browser — see "Client-side direction" below.

**4. Next.js → Vite React SPA, one container** — ✅ **DONE**
Ported to Vite + React + Tailwind + react-router. The Next coupling was only 6 imports across 4 files (`next/link`, `useRouter`, `usePathname`, `useParams`) plus 9 `'use client'` directives; every component came over unchanged. `lib/api.ts` already used relative URLs, so it needed only the dead SSR branch removed. FastAPI now serves the built SPA from `STATIC_DIR` with a history fallback so deep links survive a refresh, and `/api/*` still returns JSON 404s rather than the HTML shell. Single multi-stage Dockerfile (`node:22-alpine` → `python:3.12-slim`), non-root uid 1000, healthcheck, and `libreoffice-impress` behind `WITH_LIBREOFFICE` (~600MB on a ~250MB base). Compose collapsed to one service on 8080.

**5. SSE progress** *(fixes gap 9)*
`GET /api/generate/{id}/events` streaming per-slide progress; Review page consumes it so cards appear incrementally instead of after a blind wait.

**6. AnkiConnect + export polish** *(fixes gap 7)*
`frontend/src/lib/ankiconnect.ts` calling `http://127.0.0.1:8765` from the browser: `createDeck` → `storeMediaFile` per image (content-hashed `notes2anki_{md5[:12]}.jpg`, as the CLI does) → batched `addNotes` with `allowDuplicate:false`, plus `modelNames`/`createModel` so a missing note type is created rather than erroring. Settings page shows a connection test and the exact `webCorsOriginList` JSON to paste. For `.apkg`, derive model and deck IDs from a stable name hash so re-imports merge instead of duplicating.

> Caveat to surface in the UI: if the app is ever served over HTTPS, the browser blocks the plaintext call to `127.0.0.1:8765` as mixed content. Over plain HTTP on a LAN it works; `.apkg` download is always the fallback.

## Verification

- **Adapters** — add an Anthropic provider and a Gemini provider; `POST /api/providers/{id}/models` returns non-empty for both, and a real generation produces cards from each. Point one provider at local Ollama to exercise the `/models`-missing fallback and the prompt-only JSON tier.
- **Field-driven output** — create a template with an unusual field set (e.g. `Term`/`Definition`/`Mnemonic`) and confirm returned cards carry exactly those keys.
- **Ingestion, no LLM** — upload a real lecture PDF and PPTX; assert chunk count matches page/slide count and rendered JPEGs are non-empty (open one). Verify the PPTX path uses LibreOffice inside the container rather than silently falling back.
- **Export round-trip** — the real test. `.apkg` is a zip containing a SQLite `collection.anki2`:
  ```bash
  python -c "
  import zipfile,sqlite3,tempfile,os,sys
  z=zipfile.ZipFile(sys.argv[1]); d=tempfile.mkdtemp(); z.extractall(d)
  c=sqlite3.connect(os.path.join(d,'collection.anki2'))
  print('notes:', c.execute('select count(*) from notes').fetchone()[0])
  print('media:', len([k for k in z.namelist() if k.isdigit()]))
  " out.apkg
  ```
  Then import into real Anki and confirm fields land correctly, MathJax renders as `\[ … \]` rather than literal `<anki-mathjax>` tags, and slide images appear.
- **AnkiConnect** — with Anki open and the origin allowlisted, drive the browser: load Review, select a subset, Sync, confirm via console that `addNotes` returned note IDs, then verify the notes exist in Anki's browser.
- **Secrets** — confirm no endpoint returns a plaintext key and that `sqlite3 … "select api_key_enc from providers"` shows ciphertext.
- **Docker** — `docker compose up --build`, one end-to-end job at `http://localhost:8080`, then `down && up` and confirm providers, templates, and model history survived.

## Client-side direction

The server-side architecture above works, but it has a structural problem: it is
a networked service holding usable LLM API keys with **no authentication**, and
the only safe deployment is therefore loopback-only. That rules out the thing it
is actually wanted for — opening it from a phone or a second machine — without
dragging in a VPN or a login, both of which were considered and rejected.

The fix is to move the state and the LLM calls into the browser, leaving the
server as the one thing a browser genuinely cannot do.

**Target shape**

| | today | target |
|---|---|---|
| Provider API keys | server, Fernet-encrypted | browser storage only |
| Generations, cards | server SQLite | IndexedDB |
| Uploaded files, slide images | `/data/*`, kept | browser; server deletes after converting |
| Who calls the LLM | server | browser |
| Server endpoints | 6 routers | `POST /render` |

`POST /render` takes a `.pptx`/`.pdf`, returns one JPEG per slide, keeps
nothing. `document_reader.py` moves behind it essentially unchanged — the
LibreOffice → PDF → PyMuPDF path, the title/blank heuristics, `has_visual`, all
of it. That file is the hardest part of this codebase and it does not get
rewritten.

Everything else moves to TypeScript: the two LLM adapters (~280 lines, thin),
prompt assembly, the `_extract_cards_json` salvage parser, `latex.py`
normalization, and `.apkg` generation (sql.js + JSZip — an `.apkg` is a zip
around a SQLite `collection.anki2`). The React UI, the AnkiConnect client, and
KaTeX rendering are already browser code and carry over.

**What this buys.** A stranger who finds the URL can convert a PowerPoint.
That's the whole attack: no keys to spend, no decks to read, no outbound
requests to abuse (which retires item 7 in `TODO.md`). The app can then be
served from anywhere — static host, GitHub Pages — and opened from any device
with no login and no VPN.

**Accepted tradeoffs**

- **Decks are per-browser.** Generate on the laptop, they are not on the phone.
  Confirmed as acceptable; do not add a sync server to "fix" it without
  revisiting the whole decision, because that reintroduces exactly the
  authentication problem this removes.
- **The render endpoint is unauthenticated compute.** It holds nothing, so the
  exposure is CPU, not data. Run it with a file-size cap, a request timeout, no
  network egress, and container resource limits: it feeds untrusted input to
  LibreOffice, which has a CVE history.

**De-risk before building.** Two unknowns can each invalidate the design, and
both are hours to test, not weeks:

1. **Which providers answer a browser `fetch`.** Anthropic supports it behind an
   explicit `anthropic-dangerous-direct-browser-access: true` header; OpenRouter
   supports it and proxies to everything else. Direct OpenAI and Gemini are
   genuinely unclear — published sources contradict each other. Test with a
   deliberately invalid key: an HTTP 401 coming back means CORS allowed the
   call, a thrown `TypeError` means it was blocked. OpenRouter alone is enough
   to make the design viable, so this decides provider support, not feasibility.
2. **Whether sql.js can build an `.apkg` real Anki imports.** Use the export
   round-trip check in Verification above, then import into Anki for real.
