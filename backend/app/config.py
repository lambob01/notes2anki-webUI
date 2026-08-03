import os

# backend/, i.e. the parent of the `app` package. Defaults anchor here rather
# than to the system temp dir: `Generation.source_filename` and the slide JPEGs
# are *durable* database references, and macOS and most Linux distros reap
# /tmp. Storing them there meant an older job failed with `File not found` -
# and exports silently lost their slide images - for no reason the UI could
# explain. Docker overrides all four via ENV, so this only affects local runs.
_BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
_DATA_DIR = os.getenv("DATA_DIR", os.path.join(_BASE_DIR, "data"))

# Anchored to backend/ for the same reason as the data dirs: relative to the
# *cwd*, this silently created a fresh empty DB wherever uvicorn happened to be
# started from, which is where the stray notes2anki.db files at the repo root
# and in frontend/ came from. Running from backend/ as documented resolves to
# the identical path, so this is a no-op for correct usage.
DATABASE_URL = os.getenv(
    "DATABASE_URL", f"sqlite:///{os.path.join(_BASE_DIR, 'notes2anki.db')}"
)
UPLOAD_DIR = os.getenv("UPLOAD_DIR", os.path.join(_DATA_DIR, "uploads"))
EXPORT_DIR = os.getenv("EXPORT_DIR", os.path.join(_DATA_DIR, "exports"))
HISTORY_DIR = os.getenv("HISTORY_DIR", os.path.join(_DATA_DIR, "history"))
# Source-slide JPEGs per generation, attached to cards in the UI and exports.
SLIDES_DIR = os.getenv("SLIDES_DIR", os.path.join(_DATA_DIR, "slides"))

os.makedirs(UPLOAD_DIR, exist_ok=True)
os.makedirs(EXPORT_DIR, exist_ok=True)
os.makedirs(HISTORY_DIR, exist_ok=True)
os.makedirs(SLIDES_DIR, exist_ok=True)

# Vision capability is NOT configured here. `VISION_CAPABLE_PROVIDERS` and
# `VISION_CAPABLE_MODEL_PREFIXES` used to live in this file, imported by
# nothing, while the live decision was `_is_vision_capable` in
# `routers/providers.py` - and the two had drifted apart. The dead copy claimed
# `deepseek-r1` (a reasoning model with no vision) and bare `gpt-4` were
# vision-capable, so wiring it back in would have mis-detected models rather
# than fixed anything. Add new vision models to `_is_vision_capable`.
