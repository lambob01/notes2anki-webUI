"""`_run_generation`'s failure handler must never raise.

It runs under FastAPI `BackgroundTasks`, where nothing catches an escaping
exception, and it is the only thing that flips a crashed run from `running` to
`failed`. If it raises, the row stays `running` and the UI spins until
`_reap_stale_running` gets to it `STALE_RUN_MINUTES` later - with the real
cause lost.

Two ways it used to raise, both pinned here:

* the initial `Generation` query throwing, leaving `gen` unbound for the
  handler that then read it (`UnboundLocalError`);
* the handler's own `db.commit()` failing, which is exactly what happens when
  the Session is already broken by whatever killed the run - the
  `This session is in 'prepared' state` failure behind TODO item 1.
"""

import logging
from unittest.mock import MagicMock

import pytest

import app.database as database
from app.routers.generate import _run_generation


@pytest.fixture
def patched_session(monkeypatch):
    """Swap in a fake Session. `_run_generation` imports SessionLocal itself."""

    def _install(session):
        monkeypatch.setattr(database, "SessionLocal", lambda: session)
        return session

    return _install


def test_initial_query_failure_does_not_escape(patched_session, caplog):
    session = patched_session(MagicMock())
    session.query.side_effect = RuntimeError("database is locked")

    with caplog.at_level(logging.ERROR):
        _run_generation("some-generation-id")  # must not raise

    session.close.assert_called_once()
    # The real cause has to survive into the log, since it can no longer be
    # written to the row - that is the whole point of not masking it.
    assert "database is locked" in caplog.text


def test_failure_while_marking_failed_does_not_escape(patched_session, caplog):
    session = patched_session(MagicMock())
    session.query.return_value.filter.return_value.first.return_value = MagicMock()
    session.commit.side_effect = RuntimeError("session is in 'prepared' state")

    with caplog.at_level(logging.ERROR):
        _run_generation("some-generation-id")  # must not raise

    session.rollback.assert_called_once()
    session.close.assert_called_once()


def test_missing_generation_row_is_a_quiet_no_op(patched_session):
    """A deleted generation is not an error; there is nothing to mark failed."""
    session = patched_session(MagicMock())
    session.query.return_value.filter.return_value.first.return_value = None

    _run_generation("deleted-generation-id")

    session.commit.assert_not_called()
    session.close.assert_called_once()
