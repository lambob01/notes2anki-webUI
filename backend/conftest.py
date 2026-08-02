"""Test bootstrap.

`app/__init__.py` does `from app.main import app`, so importing *anything*
under `app.` boots the entire application at import time: `create_all`, the
`ensure_columns` migration sweep, and the legacy-API-key encryption pass all
run. Left alone those point at `backend/notes2anki.db` - the developer's real
database - because DATABASE_URL defaults to a relative path and tests run from
`backend/`. Redirect every path at a temp directory before the first import.

conftest.py is imported before any test module, and nothing here imports `app`,
so the environment is set by the time the first `from app...` runs.
"""

import os
import tempfile
from pathlib import Path

_TMP = Path(tempfile.mkdtemp(prefix="notes2anki_tests_"))

# setdefault, not assignment: CI can point these somewhere else.
os.environ.setdefault("DATABASE_URL", f"sqlite:///{_TMP / 'test.db'}")
os.environ.setdefault("SECRET_KEY", "test-key-never-encrypts-real-provider-keys")
os.environ.setdefault("UPLOAD_DIR", str(_TMP / "uploads"))
os.environ.setdefault("EXPORT_DIR", str(_TMP / "exports"))
os.environ.setdefault("HISTORY_DIR", str(_TMP / "history"))
os.environ.setdefault("SLIDES_DIR", str(_TMP / "slides"))
