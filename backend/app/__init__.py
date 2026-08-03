# Re-exported so `uvicorn app:app` works. This import is also why importing
# anything under `app.` boots the whole application - see the note in
# conftest.py about redirecting DATABASE_URL before the first import.
from app.main import app  # noqa: F401
