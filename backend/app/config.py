import os
import tempfile

DATABASE_URL = os.getenv("DATABASE_URL", "sqlite:///notes2anki.db")
UPLOAD_DIR = os.getenv("UPLOAD_DIR", os.path.join(tempfile.gettempdir(), "notes2anki", "uploads"))
EXPORT_DIR = os.getenv("EXPORT_DIR", os.path.join(tempfile.gettempdir(), "notes2anki", "exports"))
HISTORY_DIR = os.getenv("HISTORY_DIR", os.path.join(tempfile.gettempdir(), "notes2anki", "history"))
# Source-slide JPEGs per generation, attached to cards in the UI and exports.
SLIDES_DIR = os.getenv("SLIDES_DIR", os.path.join(tempfile.gettempdir(), "notes2anki", "slides"))

os.makedirs(UPLOAD_DIR, exist_ok=True)
os.makedirs(EXPORT_DIR, exist_ok=True)
os.makedirs(HISTORY_DIR, exist_ok=True)
os.makedirs(SLIDES_DIR, exist_ok=True)

VISION_CAPABLE_PROVIDERS = {
    "openai", "anthropic", "gemini", "openrouter", "deepseek",
}

VISION_CAPABLE_MODEL_PREFIXES = (
    "gpt-4", "gpt-4o", "gpt-4.5", "gpt-5",
    "claude-3", "claude-3.5", "claude-3.7", "claude-4",
    "gemini-1.5", "gemini-2.0", "gemini-2.5",
    "deepseek-vl", "deepseek-r1",
)
