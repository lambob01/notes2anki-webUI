# TODO — audit findings

Ranked backlog from a full read of the backend, LLM layer, export/AnkiConnect
paths, and frontend data flow. `PLAN.md` remains the design doc; this is the
defect list.

Mark an item `[x]` only once it has been verified, not just written.

## Critical

- [x] **1. Generation fan-out shares one SQLAlchemy Session across threads.**
  `routers/generate.py` handed the `Provider` ORM instance to every worker;
  `ai_generator.py` read `provider_type` / `api_key` / `json_mode_tier` off it
  and *wrote* the tier back. The main thread commits after each slide, and
  `SessionLocal` uses the default `expire_on_commit=True`, so the next worker
  to touch an attribute triggered a lazy refresh — SQL on the main thread's
  Session from another thread.

  **Confirmed, not theoretical.** Driving the real `_run_generation` (40
  slides, 8 workers, fake LLM client) with a `before_cursor_execute` listener
  recording the emitting thread:

  | | worker-thread SQL on the main Session | outcome over 10 runs |
  |---|---|---|
  | before | 7–26 statements | **3/10 aborted** |
  | after | 0 | 10/10 clean |

  The three failures died mid-generation with `This session is in 'prepared'
  state; no further SQL can be emitted within this transaction`, at 18/40,
  10/40 and 31/40 slides — every remaining slide lost, and the API spend on
  the completed ones already burned.

  *Fixed by* `ProviderConfig` (`llm/base.py`): a detached snapshot taken on
  the owning thread. Workers record a tier downgrade on the snapshot;
  `_persist_json_mode_tier` writes it back once, in a `finally` that cannot
  raise into a failing run. Covered by `tests/test_provider_config.py`.

  *Follow-up:* `database.py:10` blames macOS libsqlite3 for a segfault under
  exactly this concurrency. That attribution is now unconfirmed — re-test
  whether the `pysqlite3` dependency is still needed. (Noted in `CLAUDE.md`.)

- [x] **2. `APP_PASSWORD` is advertised but does not exist.** Wired in
  `docker-compose.yml`, documented in `.env.example` as "require a password to
  reach the UI"; no backend code ever read it, so setting it protected nothing.

  *Resolved by decision, not by implementing it.* No login gate is wanted, so
  the setting is gone from both files rather than left as a false promise, and
  `.env.example` now says so explicitly to stop it being re-added. The exposure
  it pretended to cover is closed instead by binding compose to
  `127.0.0.1:8080:8080`, with the reasoning in the compose comment and a
  Security section in the README.

  Note this changes deployment: a reverse proxy must now run on the same host
  and target `127.0.0.1:8080`. Widening the bind puts an unauthenticated app
  holding live API keys back on the network.

## High

- [ ] **3. Every generation response ships every card.**
  `schemas/__init__.py:176` puts `cards` on `GenerationSchema`, used by both
  `GET /api/generate/{id}` and `GET /api/generate`. Review polls the former
  every 1000ms with `refetchIntervalInBackground` (`Review.tsx:22-30`);
  History (`History.tsx:9`) pulls every card of every generation to render
  rows that show none of them. *Fix:* drop `cards` from the list response and
  add a slim status endpoint for the poll (or land SSE, `PLAN.md` step 5).

- [ ] **4. No index on `cards.generation_id`.** A FK creates none in SQLite —
  verified against the dev DB, only autoindexes exist. Every card fetch,
  export, and cascade delete is a full scan. Same for `generations.provider_id`
  and `provider_models.provider_id`.

- [ ] **5. Disk grows without bound.** `delete_generation`
  (`generate.py:446`) drops the row and cascades to cards but leaves
  `SLIDES_DIR/{id}/` and `EXPORT_DIR/{id}.apkg` behind; `UPLOAD_DIR` is never
  cleaned at all. This is the hole `JOB_RETENTION_DAYS` was meant to plug.

- [ ] **6. `UPLOAD_DIR` defaults into the system temp dir** (`config.py:5`),
  which macOS and most Linux distros reap. `Generation.source_filename` is a
  durable DB reference to a file in volatile storage, so re-running an older
  job fails with `File not found` for no visible reason.

- [~] **7. SSRF surface.** `POST /api/providers/test` (`providers.py:133`)
  takes an arbitrary `base_url` and reports the outcome; `fetch_models`
  returns body content, so the server is a probe for anything it can route to.

  *Mitigated, not fixed.* The loopback bind from item 2 means it is no longer
  reachable off-host, which is the whole of the practical risk. Deliberately
  **not** patched with a private-IP blocklist: the `ollama` and `lmstudio`
  presets legitimately point at `http://localhost:11434` and `:1234`, so a
  blocklist that stopped the SSRF would also break local-runtime support. A
  user-supplied base URL is inherently this shape.

  It goes away for real in the client-side move — once the browser makes the
  LLM calls, "localhost" means *the user's own machine*, which is both correct
  and harmless. Don't spend effort patching it server-side first.

## Medium

- [ ] **8. `except Exception` can raise `NameError`.** `generate.py:151-155`
  touches `gen` in the handler, but `gen` is unbound if the query on line 110
  threw. Masks the real error and leaves the row `running` for 10 minutes.

- [ ] **9. CSV export ignores `mapping`.** `_build_csv` (`export.py:286`) uses
  `template.fields` unconditionally while `_build_apkg` honours
  `mapping`/`anki_fields`. `CLAUDE.md` documents an invariant that the Anki
  write paths must agree — this is a third path that doesn't.

- [ ] **10. `_reap_stale_running` runs on every GET** (`generate.py:433,442`),
  so the 1s poll issues a scan plus a commit whenever it finds anything.
  Belongs on a periodic task, not the read path.

- [~] **11. Unbounded upload into memory.** `notes.py:30` does
  `await file.read()` with no size cap, then hashes the same content twice
  (lines 31, 45). Also uses `SessionLocal` directly instead of
  `Depends(get_db)`, and returns the server-side `filepath` to the browser.

  The replacement path is already correct: `/api/render` streams to disk with a
  `MAX_UPLOAD_MB` cap. `notes.py` dies with the server-side generation flow, so
  fix it only if that flow outlives expectations.

- [ ] **12. `Dockerfile:42` installs `libgl1-mesa-glx`,** removed in Debian 12
  — and `python:3.12-slim` is bookworm. Unverified (no Docker daemon
  available); if correct, `docker compose up --build` fails outright. Probably
  also unnecessary: PyMuPDF doesn't need libGL, that's an OpenCV dependency.

- [ ] **13. `docker-entrypoint.sh:11`: `exec su app -c "$*"`** flattens argv
  into a string and re-parses it through a shell, so any argument containing a
  space breaks. `su` also doesn't forward SIGTERM, so `docker stop` waits the
  full timeout. `gosu`/`setpriv` with `"$@"` fixes both.

## Cleanup

- [ ] **14. `VISION_CAPABLE_*` in `config.py:16-25` is dead code.** Nothing
  imports it; the live logic is `_is_vision_capable` (`providers.py:24`) with
  its own divergent list. `CLAUDE.md:87` and `AGENTS.md:39` both tell
  contributors to update the file that doesn't matter — fix the docs too.

- [ ] **15. Dependency list is wrong in both directions.** `openai`,
  `anthropic`, `aiohttp`, `aiofiles`, `aiosqlite`, `python-dotenv` are
  declared and unused — the adapters use httpx directly by design
  (`openai_compat.py:5`). Meanwhile **`httpx` is not declared**, resolving
  only transitively through the SDKs. Trimming the unused ones without adding
  httpx breaks the app.

- [ ] **16. `DATABASE_URL` defaults to a relative path** (`config.py:4`).
  Evidence: stray empty `notes2anki.db` files at the repo root and in
  `frontend/` from processes started in the wrong cwd. `CLAUDE.md` works
  around it with a "must run from backend/" note; anchoring the default to the
  package directory removes the footgun.

- [ ] **17. `@app.on_event` is deprecated** (`main.py:44,77`) — already
  emitting warnings in the test run, slated for removal. Move to `lifespan`.

- [ ] **18. Tooling gaps:** no backend linter (ruff would catch the unused
  imports at `generate.py:11-16` and `export.py:4-10`), no frontend lint, no
  route/integration tests, and no way to cancel a running generation.
