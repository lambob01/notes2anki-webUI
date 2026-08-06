"""The detached provider snapshot handed to generation worker threads.

`_run_generation` fans out over slides with a ThreadPoolExecutor while the main
thread commits per-slide progress. `SessionLocal` uses the default
`expire_on_commit=True`, so passing the `Provider` ORM row into those workers
meant each commit expired it and the next worker's `provider.api_key` read
lazy-loaded - running SQL on the main thread's Session from another thread. A
Session is not thread-safe, and SQLite is opened with `check_same_thread=False`,
so that races in C rather than raising anything legible.

These tests pin the invariant that makes it safe: the snapshot holds plain
values and never touches the database again.
"""

import threading

from app.database import SessionLocal
from app.llm.base import TIER_JSON_OBJECT, TIER_PROMPT_ONLY, ProviderConfig
from app.models import Provider


def _saved_provider(db, **kwargs) -> Provider:
    provider = Provider(
        name="test",
        provider_type="openai",
        base_url="https://example.invalid/v1",
        api_key="sk-secret-key",
        **kwargs,
    )
    db.add(provider)
    db.commit()
    db.refresh(provider)
    return provider


def test_snapshot_survives_a_commit_that_expires_the_row() -> None:
    """The bug, reproduced at its source.

    After a commit every ORM attribute is expired and the next read hits the
    database. The snapshot must have already captured everything, so a worker
    can run to completion without the Session being involved at all.
    """
    db = SessionLocal()
    try:
        provider = _saved_provider(db)
        cfg = ProviderConfig.from_row(provider)

        # What the per-slide progress commits do to `provider`.
        db.commit()

        # Close the Session outright: any lazy load from here on would raise.
        # The snapshot must not care.
        db.close()

        assert cfg.provider_type == "openai"
        assert cfg.api_key == "sk-secret-key"
        assert cfg.base_url == "https://example.invalid/v1"
    finally:
        db.close()


def test_snapshot_reads_are_safe_from_another_thread() -> None:
    """A worker thread reads the config while the owning thread commits."""
    db = SessionLocal()
    try:
        provider = _saved_provider(db, json_mode_tier=TIER_JSON_OBJECT)
        cfg = ProviderConfig.from_row(provider)

        seen: list[tuple[str, str | None]] = []
        errors: list[BaseException] = []
        start = threading.Event()

        def worker() -> None:
            try:
                start.wait(timeout=5)
                for _ in range(50):
                    seen.append((cfg.api_key, cfg.json_mode_tier))
            except BaseException as exc:  # pragma: no cover - failure path
                errors.append(exc)

        thread = threading.Thread(target=worker)
        thread.start()
        start.set()
        for _ in range(50):
            provider.name = f"test-{_}"
            db.commit()
        thread.join(timeout=10)

        assert not errors
        assert seen == [("sk-secret-key", TIER_JSON_OBJECT)] * 50
    finally:
        db.close()


def test_negotiated_tier_is_written_back_to_the_row() -> None:
    """Workers downgrade on the snapshot; the caller persists it once.

    Without the write-back the tier probe is per-run rather than cached, so
    every later job re-pays the 400 on every slide.
    """
    from app.routers.generate import _persist_json_mode_tier

    db = SessionLocal()
    try:
        provider = _saved_provider(db)
        cfg = ProviderConfig.from_row(provider)
        assert provider.json_mode_tier is None

        # What _call_llm does on a worker thread after a BadRequest.
        cfg.json_mode_tier = TIER_PROMPT_ONLY

        _persist_json_mode_tier(db, provider, cfg)

        db.expire_all()
        assert provider.json_mode_tier == TIER_PROMPT_ONLY
    finally:
        db.close()


def test_tier_write_back_never_raises_into_a_failing_run() -> None:
    """It runs in a `finally`, so a broken Session must not mask the real error."""
    from app.routers.generate import _persist_json_mode_tier

    db = SessionLocal()
    try:
        provider = _saved_provider(db)
        cfg = ProviderConfig.from_row(provider)
        cfg.json_mode_tier = TIER_PROMPT_ONLY
    finally:
        db.close()

    # A closed Session is the stand-in for one left unusable by the exception
    # that failed the generation.
    class _BrokenSession:
        def commit(self) -> None:
            raise RuntimeError("session is not usable")

        def rollback(self) -> None:
            pass

    _persist_json_mode_tier(_BrokenSession(), provider, cfg)
