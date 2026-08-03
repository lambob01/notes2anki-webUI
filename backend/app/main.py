import os
from contextlib import asynccontextmanager

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

from app.database import (
    Base,
    engine,
    SessionLocal,
    encrypt_legacy_api_keys,
    ensure_columns,
    ensure_indexes,
)
from app.routers import providers, templates, notes, generate, cards, export, render

Base.metadata.create_all(bind=engine)
ensure_columns()
ensure_indexes()
encrypt_legacy_api_keys()

@asynccontextmanager
async def lifespan(app: FastAPI):
    """Startup work, in order. Replaces the deprecated `@app.on_event`.

    Both are sync and run inline, as Starlette ran sync `on_event` handlers -
    they are short, local-SQLite, and must finish before the first request is
    served. There is no shutdown half; generation background tasks die with the
    process by design, and `reconcile_orphaned_generations` cleans up after
    them on the way back up rather than on the way down, because a crash never
    gets a shutdown hook.
    """
    create_default_template()
    reconcile_orphaned_generations()
    yield


app = FastAPI(title="notes2anki-webui", version="0.1.0", lifespan=lifespan)

# The SPA is served by this same process, so browser requests are same-origin
# and need no CORS grant. CORS_ORIGINS stays available for the split
# frontend/backend dev setup (vite on :3000 proxying to uvicorn on :8080).
_cors_origins = [o for o in os.getenv("CORS_ORIGINS", "").split(",") if o.strip()]
if _cors_origins:
    app.add_middleware(
        CORSMiddleware,
        allow_origins=_cors_origins,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

app.include_router(providers.router, prefix="/api/providers", tags=["providers"])
app.include_router(templates.router, prefix="/api/templates", tags=["templates"])
app.include_router(notes.router, prefix="/api/notes", tags=["notes"])
app.include_router(generate.router, prefix="/api/generate", tags=["generate"])
app.include_router(cards.router, prefix="/api/cards", tags=["cards"])
app.include_router(export.router, prefix="/api/export", tags=["export"])
# The stateless render endpoint the client-side app talks to. Additive for now:
# the routers above still serve the existing server-side app, and get removed
# once the browser owns generation. See "Client-side direction" in PLAN.md.
app.include_router(render.router, prefix="/api/render", tags=["render"])


def create_default_template():
    from app.models import CardTemplate
    db = SessionLocal()
    try:
        existing = db.query(CardTemplate).first()
        if not existing:
            default = CardTemplate(
                name="Notes2Anki Default",
                note_type="Basic",
                fields=[
                    {"name": "prompt", "label": "Front / Prompt", "visible": True},
                    {"name": "answer", "label": "Back / Answer", "visible": True},
                    {"name": "formula", "label": "Formula", "visible": True},
                    {"name": "example question", "label": "Example Question", "visible": True},
                    {"name": "solution", "label": "Solution", "visible": True},
                    {"name": "extra", "label": "Extra", "visible": True},
                    {"name": "topic", "label": "Topic", "visible": True},
                ],
                css=(
                    ".card { font-family: Arial, sans-serif; font-size: 20px; text-align: left; "
                    "color: #111; background: #fff; line-height: 1.45; } "
                    "img { max-width: 100%; height: auto; } "
                    "small { color: #666; }"
                ),
                is_default=True,
            )
            db.add(default)
            db.commit()
    finally:
        db.close()


def reconcile_orphaned_generations():
    """Fail jobs left mid-flight by a previous process.

    Generation runs in an in-process background task, so a restart or crash
    abandons anything still `running` - and with nothing to update it, the row
    stays `running` forever and the UI spins indefinitely. A fresh process
    means none of those tasks exist any more, so mark them failed.
    """
    import datetime as dt

    from app.models import Generation

    db = SessionLocal()
    try:
        orphans = (
            db.query(Generation)
            .filter(Generation.status.in_(["running", "pending"]))
            .all()
        )
        for g in orphans:
            g.status = "failed"
            g.phase = "interrupted"
            g.completed_at = dt.datetime.utcnow()
            g.error_message = (
                (g.error_message or "")
                + "\nGeneration was interrupted by a server restart. "
                "Start it again to finish the remaining slides - already "
                "processed slides are skipped."
            ).strip()
        if orphans:
            db.commit()
            import logging

            logging.getLogger(__name__).warning(
                "Marked %d interrupted generation(s) as failed.", len(orphans)
            )
    finally:
        db.close()


@app.get("/api/health")
def health():
    return {"status": "ok"}


# ---------------------------------------------------------------------------
# Static SPA
#
# Mounted last so it never shadows an /api route. In the Docker image the Vite
# build is copied to /app/static; running the backend alone (no build present)
# just skips this and serves the API only.
# ---------------------------------------------------------------------------
STATIC_DIR = os.getenv(
    "STATIC_DIR", os.path.join(os.path.dirname(os.path.dirname(__file__)), "static")
)

if os.path.isdir(STATIC_DIR):
    app.mount(
        "/assets",
        StaticFiles(directory=os.path.join(STATIC_DIR, "assets")),
        name="assets",
    )

    _INDEX = os.path.join(STATIC_DIR, "index.html")

    @app.get("/{full_path:path}", include_in_schema=False)
    def spa_fallback(full_path: str):
        """Serve index.html for client-side routes.

        react-router owns paths like /review/<id>, so a refresh or a direct
        link must still return the SPA shell rather than a 404. Real files
        (favicon, etc.) are served if they exist; unknown /api paths keep
        returning JSON 404s rather than silently yielding HTML.
        """
        if full_path.startswith("api/"):
            raise HTTPException(status_code=404, detail="Not found")

        candidate = os.path.normpath(os.path.join(STATIC_DIR, full_path))
        # Guard against traversal via ../ in the URL path.
        if (
            full_path
            and candidate.startswith(os.path.abspath(STATIC_DIR))
            and os.path.isfile(candidate)
        ):
            return FileResponse(candidate)

        return FileResponse(_INDEX)
