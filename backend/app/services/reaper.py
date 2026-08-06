"""Fail generations whose background task silently died - on a timer, not the read path.

A generation runs in an in-process background task. If that task dies without
raising (killed thread, interpreter quirk), its row stays `running` forever and
the review page polls a phantom "Generating..." that never resolves. This used
to be swept on every generation GET - the 1s poll paid for a scan plus a commit
each tick. It now runs from a periodic lifespan task instead, so a GET is a
pure read.
"""

from __future__ import annotations

import asyncio
import datetime as dt
import logging

from app.database import SessionLocal
from app.models import Generation

# A live job commits progress (bumping `updated_at`) at least once per slide,
# and a slide's worst case is a full 3-attempt retry cycle. Anything quiet
# longer than this has no live task behind it.
STALE_RUN_MINUTES = 10

REAP_INTERVAL_SECONDS = 60


def reap_stale_running(db) -> None:
    """Fail a run whose background task has silently died.

    Any `running`/`pending` row untouched for STALE_RUN_MINUTES has no live task
    - the task updates the row at least once per slide - so mark it failed and
    let the user re-run.
    """
    cutoff = dt.datetime.utcnow() - dt.timedelta(minutes=STALE_RUN_MINUTES)
    stale = (
        db.query(Generation)
        .filter(
            Generation.status.in_(["running", "pending"]),
            Generation.updated_at < cutoff,
        )
        .all()
    )
    if not stale:
        return
    for gen in stale:
        gen.status = "failed"
        gen.phase = "failed"
        gen.completed_at = dt.datetime.utcnow()
        gen.error_message = (
            f"Generation stopped unexpectedly - no progress for "
            f"{STALE_RUN_MINUTES} minutes. Run it again; slides already "
            "processed are skipped."
        )
    db.commit()


def _sweep_once() -> None:
    db = SessionLocal()
    try:
        reap_stale_running(db)
    except Exception:
        # The sweep runs forever in the background; one bad sweep must not kill
        # the task (and the app's event loop) any more than it used to be able
        # to fail a request.
        logging.getLogger(__name__).exception("stale-run reaper sweep failed")
    finally:
        db.close()


async def stale_reaper_loop() -> None:
    while True:
        await asyncio.sleep(REAP_INTERVAL_SECONDS)
        await asyncio.to_thread(_sweep_once)
