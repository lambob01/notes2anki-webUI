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

  *Follow-up, done:* `database.py:10` blamed macOS libsqlite3 for a segfault
  under exactly this concurrency. Re-tested by replaying the app's access
  pattern (40 slides, 8 worker threads, 2 pollers, per-slide commits on the
  main Session) 10× against **stdlib 3.43.2 — the exact accused version** —
  and 10× against pysqlite3. Both completed clean, 40/40 cards, zero errors.
  So this item, not libsqlite3, was almost certainly the real cause.

  **`pysqlite3` kept anyway.** Ten rounds of a synthetic workload cannot
  disprove a probabilistic segfault, and the failure mode is the entire server
  dying rather than one bad request. Dropping it should be driven by the real
  pipeline under real load, not this. Comments in `database.py` and
  `CLAUDE.md` updated to say what is actually known.

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

- [x] **4. No index on `cards.generation_id`.** A FK creates none in SQLite —
  verified against the dev DB, only autoindexes exist. Every card fetch,
  export, and cascade delete is a full scan. Same for `generations.provider_id`
  and `provider_models.provider_id`.

  *Fixed* with `index=True` on all four FK columns (`generations.template_id`
  had the same defect and is included). `index=True` alone was not enough:
  `create_all` skips a table that already exists, indexes and all, so the
  declaration would have reached only fresh databases — which is how these
  went missing everywhere but a clean install. `ensure_indexes()`
  (`database.py`, called from `main.py` beside `ensure_columns()`) creates
  them with `checkfirst=True`.

  Verified on the real dev DB (925 cards, 25 generations): all four indexes
  present afterwards, row counts unchanged, and the planner now reports
  `SEARCH cards USING INDEX ix_cards_generation_id` where it previously scanned.

- [x] **5. Disk grows without bound.** `delete_generation`
  (`generate.py:446`) drops the row and cascades to cards but leaves
  `SLIDES_DIR/{id}/` and `EXPORT_DIR/{id}.apkg` behind; `UPLOAD_DIR` is never
  cleaned at all. This is the hole `JOB_RETENTION_DAYS` was meant to plug.

  *Fixed at the delete path*, which is the leak; no retention sweep, since the
  client-side move deletes this router anyway.

  **`UPLOAD_DIR` is the part that needed care, not the obvious win it looks
  like.** Uploads are stored under a content-hash filename, so they are
  *shared*: on the dev DB, 25 generations reference just 4 uploads, one of
  them 20 times. Deleting the file alongside its generation would have
  destroyed the source for up to 19 others. It is refcounted instead — the
  upload goes only when the last generation referencing it does.

  Slides and exports are per-generation and deleted outright. All removals are
  best-effort: the row is already gone, so a failed unlink logs rather than
  failing the request and inviting a retry that 404s.

  Covered by `tests/test_generation_cleanup.py`, verified against `HEAD`: the
  slide-dir and orphaned-upload cases fail there and pass here, while the
  shared-upload guard passes both (it must — it is a safety property, not a
  behaviour change).

- [x] **6. `UPLOAD_DIR` defaults into the system temp dir** (`config.py:5`),
  which macOS and most Linux distros reap. `Generation.source_filename` is a
  durable DB reference to a file in volatile storage, so re-running an older
  job fails with `File not found` for no visible reason.

  **`SLIDES_DIR` had the same defect and was the worse half** — slide JPEGs are
  read at export time (`export.py:90`) and by the review UI
  (`generate.py:458`), so a reap silently stripped images out of exported
  decks, not just failed a re-run.

  *Fixed* by anchoring the defaults to `backend/data/` (a `_BASE_DIR` off
  `__file__`, overridable with `DATA_DIR`) instead of `tempfile.gettempdir()`.
  Docker sets all four paths via `ENV` so its behaviour is unchanged, and
  `data/` was already gitignored.

  **The change orphans existing data and that has to be handled, not waved
  away.** On this machine the old temp dir still held 6.2MB of uploads (all 25
  generations) and 57MB of slides (10 generations) — *not yet reaped*, so
  repointing the defaults broke review-page images and re-runs for real rows.
  Copied both into `backend/data/` and re-verified against the DB: 25/25
  uploads and 10 slide dirs resolve. Originals were left in temp rather than
  moved, so the OS can reap them and nothing is destroyed if this is wrong.
  Exports weren't migrated — `.apkg` files regenerate on demand.

  Anyone else with an existing install needs the same one-time copy; it is
  deliberately not automated, since a startup sweep of a hardcoded temp path
  is worse than a documented manual step.

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

- [x] **8. `except Exception` can raise `NameError`.** `generate.py:151-155`
  touches `gen` in the handler, but `gen` is unbound if the query on line 110
  threw. Masks the real error and leaves the row `running` for 10 minutes.

  **A second escape path sat in the same handler:** its own `db.commit()` can
  fail, which is precisely what happens when the Session is already broken by
  whatever killed the run — the `'prepared' state` failure from item 1. So the
  handler meant to record a crash could itself crash, on the crash it was
  handling.

  *Fixed* by binding `gen = None` before the `try` and wrapping the handler
  body in its own `try/except` + `rollback`, the shape
  `_persist_json_mode_tier` already uses. The original exception is now logged
  with `logger.exception` before anything else can go wrong, so the cause
  survives even when the row can't be updated.

  Covered by `tests/test_generation_failure_path.py`. Confirmed to be a real
  regression test, not a tautology: against `HEAD` both cases escape
  (`UnboundLocalError`, then `RuntimeError`), and both pass after.

- [x] **9. CSV export ignores `mapping`.** `_build_csv` (`export.py:286`) uses
  `template.fields` unconditionally while `_build_apkg` honours
  `mapping`/`anki_fields`. `CLAUDE.md` documents an invariant that the Anki
  write paths must agree — this is a third path that doesn't.

  **It disagreed on escaping too**, which the item didn't capture: `_build_csv`
  wrote values raw while `_build_apkg` ran them through `_anki_field`. Anki
  treats imported CSV values as HTML, so an unescaped `<` or `&` rendered
  differently depending on which file you imported — the same divergence the
  `_anki_field`/`escapeField` invariant exists to prevent. Both halves fixed.

  Columns now come from `_csv_columns`, shared with the `.apkg` path, and
  multi-source fields concatenate in `_SOURCE_ORDER`. `image` sources are
  skipped and documented: CSV has no media sidecar, so an `<img>` tag would
  reference a file Anki never receives.

  Measured against `HEAD` through the real endpoint: a template mapped onto a
  `ChemEng` note type exported `['prompt','answer','formula']` where it should
  have been `['Front','Back']`. Covered by `tests/test_export_csv.py`.

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

- [x] **12. `Dockerfile:42` installs `libgl1-mesa-glx`,** removed in Debian 12
  — and `python:3.12-slim` is bookworm. Unverified (no Docker daemon
  available); if correct, `docker compose up --build` fails outright. Probably
  also unnecessary: PyMuPDF doesn't need libGL, that's an OpenCV dependency.

  *Removed rather than replaced with `libgl1`* — confirmed nothing in the tree
  imports OpenCV, and PyMuPDF rasterizes without libGL.

  **A second, independent build breaker turned up next to it:**
  `requirements.txt` pinned `genanki>=0.13.3`, and **0.13.3 does not exist** —
  PyPI tops out at 0.13.1. That pin dates to the initial commit, so
  `pip install -r requirements.txt` has never resolved in a clean environment;
  the dev machine has 0.13.1 from some earlier install, which is why nobody
  noticed. Relaxed to `>=0.13.1` and verified by installing the full
  requirements into a fresh venv.

  Still no Docker daemon here, so the *build* remains unrun — but both things
  that would have failed it are now fixed and the pip half is verified
  directly.

- [ ] **13. `docker-entrypoint.sh:11`: `exec su app -c "$*"`** flattens argv
  into a string and re-parses it through a shell, so any argument containing a
  space breaks. `su` also doesn't forward SIGTERM, so `docker stop` waits the
  full timeout. `gosu`/`setpriv` with `"$@"` fixes both.

## Cleanup

- [x] **14. `VISION_CAPABLE_*` in `config.py:16-25` is dead code.** Nothing
  imports it; the live logic is `_is_vision_capable` (`providers.py:24`) with
  its own divergent list. `CLAUDE.md:87` and `AGENTS.md:39` both tell
  contributors to update the file that doesn't matter — fix the docs too.

  **Not merely dead — wrong**, which changes the fix. The unused copy claimed
  `deepseek-r1` (a reasoning model, no vision) and bare `gpt-4` were
  vision-capable, and knew nothing of the groq denylist the live function
  applies. Wiring it in — the obvious reading of "dead code" — would have
  mis-detected models rather than fixed anything.

  *Deleted*, with a comment in `config.py` naming `_is_vision_capable` as the
  single home so it doesn't grow back, and both docs repointed. Spot-checked
  after removal: `gpt-4o`→True, `gpt-4`→False, `deepseek-r1`→False,
  groq+`gpt-4o`→False, `claude-4-opus`→True.

- [x] **15. Dependency list is wrong in both directions.** `openai`,
  `anthropic`, `aiohttp`, `aiofiles`, `aiosqlite`, `python-dotenv` are
  declared and unused — the adapters use httpx directly by design
  (`openai_compat.py:5`). Meanwhile **`httpx` is not declared**, resolving
  only transitively through the SDKs. Trimming the unused ones without adding
  httpx breaks the app.

  *Fixed in one commit*, `httpx>=0.27` added as the six came out. Checked
  before removing that none were being pulled in implicitly: no
  `create_async_engine`/`sqlite+aiosqlite` anywhere (so `aiosqlite` really is
  dead), and nothing calls `load_dotenv` or passes `--env-file` — compose
  reads `.env` itself, and `uvicorn[standard]` still supplies python-dotenv
  transitively if it's ever wanted.

  Verified in a fresh venv rather than by grep alone: with all six genuinely
  absent from the environment, `app.main`, `llm.registry`, `routers.export`,
  `routers.render` and `services.document_reader` all import, and a server
  booted from that venv answered `/api/health`,
  `/api/providers/presets`, `/api/templates` and `/api/generate` with 200s.

- [x] **16. `DATABASE_URL` defaults to a relative path** (`config.py:4`).
  Evidence: stray empty `notes2anki.db` files at the repo root and in
  `frontend/` from processes started in the wrong cwd. `CLAUDE.md` works
  around it with a "must run from backend/" note; anchoring the default to the
  package directory removes the footgun.

  *Anchored* to the `_BASE_DIR` that item 6 already introduced. Verified it
  resolves to `backend/notes2anki.db` from an unrelated cwd, so running from
  `backend/` as documented is unchanged — a no-op for correct usage and a fix
  for the wrong-cwd case.

  Both stray files were confirmed empty (0 rows across every table, against
  925 cards in the real one) and deleted.

- [x] **17. `@app.on_event` is deprecated** (`main.py:44,77`) — already
  emitting warnings in the test run, slated for removal. Move to `lifespan`.

  *Moved.* Both handlers now run from an `asynccontextmanager` passed to
  `FastAPI(lifespan=...)`, called inline in the same order, matching how
  Starlette ran sync `on_event` handlers. No shutdown half: background tasks
  die with the process by design, and a crash never gets a shutdown hook
  anyway, which is why recovery happens on startup.

  A misconfigured `lifespan` fails *silently* — the app boots and startup work
  just never runs — so it was verified by behaviour, not by a clean boot:
  against a fresh DB, boot 1 creates the default template; planting a `running`
  generation and booting again marks it `failed`/`interrupted`; and the
  template is not duplicated on the second boot. Test-run warnings dropped
  10 → 6.

- [~] **18. Tooling gaps:** no backend linter (ruff would catch the unused
  imports at `generate.py:11-16` and `export.py:4-10`), no frontend lint, no
  route/integration tests, and no way to cancel a running generation.

  *Backend linter done.* `backend/ruff.toml`, ruff in `requirements-dev.txt`,
  `ruff check .` passes clean. Scoped to ruff's default `E4/E7/E9/F` — the
  point is unused imports and undefined names, not restyling. Two carve-outs
  that matter: `E712` is ignored (`Column == True` is required in SQLAlchemy
  filters, and ruff's rewrite is a different expression, which is why it marks
  the fix unsafe), and `app/__init__.py`'s `from app.main import app` carries a
  `# noqa: F401` because that import is load-bearing, not dead. It cleared 12
  unused imports.

  `I` (import sorting) is the obvious next rule — safe and autofixable, but it
  touches ~17 files, so it wants its own commit.

  *Route/integration tests started.* `tests/test_generation_cleanup.py` and
  `tests/test_export_csv.py` drive real endpoints through `TestClient`
  (`DELETE /api/generate/{id}`, `GET /api/export/{id}/csv`), which is the first
  coverage of the HTTP layer. Frontend lint and generation cancellation are
  still missing.
