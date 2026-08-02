"""Encryption for provider API keys at rest.

Keys are encrypted with Fernet (AES-128-CBC + HMAC) using a key derived from
SECRET_KEY. The plaintext exists only in memory when building an outbound
provider request - it is never returned by the API and never written to the
database in the clear.
"""

from __future__ import annotations

import base64
import hashlib
import logging
import os
import secrets

from cryptography.fernet import Fernet, InvalidToken

log = logging.getLogger(__name__)

_FERNET: Fernet | None = None


def _secret_key() -> str:
    """Resolve SECRET_KEY, generating a persistent one for local dev.

    In Docker, compose requires SECRET_KEY explicitly. Running the backend
    directly (tests, `uvicorn app.main:app`) shouldn't demand ceremony, so we
    fall back to a key persisted under DATA_DIR - still random per install,
    but stable across restarts so existing rows stay decryptable.
    """
    key = os.getenv("SECRET_KEY", "").strip()
    if key:
        return key

    data_dir = os.getenv("DATA_DIR") or os.path.dirname(os.path.dirname(__file__))
    key_path = os.path.join(data_dir, ".secret_key")

    if os.path.exists(key_path):
        with open(key_path) as f:
            stored = f.read().strip()
        if stored:
            return stored

    generated = secrets.token_urlsafe(32)
    try:
        os.makedirs(data_dir, exist_ok=True)
        with open(key_path, "w") as f:
            f.write(generated)
        os.chmod(key_path, 0o600)
        log.warning(
            "SECRET_KEY was not set; generated one at %s. Set SECRET_KEY "
            "explicitly in production - losing this file makes stored API "
            "keys unrecoverable.",
            key_path,
        )
    except OSError:
        log.warning(
            "SECRET_KEY not set and %s is not writable. Using an ephemeral key; "
            "stored API keys will not survive a restart.",
            key_path,
        )
    return generated


def _fernet() -> Fernet:
    global _FERNET
    if _FERNET is None:
        # Fernet needs exactly 32 url-safe base64 bytes; SECRET_KEY is
        # arbitrary text, so hash it to the right shape.
        digest = hashlib.sha256(_secret_key().encode("utf-8")).digest()
        _FERNET = Fernet(base64.urlsafe_b64encode(digest))
    return _FERNET


def encrypt(plaintext: str | None) -> str | None:
    if not plaintext:
        return None
    return _fernet().encrypt(plaintext.encode("utf-8")).decode("ascii")


def decrypt(ciphertext: str | None) -> str | None:
    """Decrypt, returning None if the value can't be read.

    A changed SECRET_KEY makes every stored key undecryptable. Returning None
    surfaces that as "no key configured" (a clear auth failure the user can
    fix by re-entering the key) rather than crashing the whole request.
    """
    if not ciphertext:
        return None
    try:
        return _fernet().decrypt(ciphertext.encode("ascii")).decode("utf-8")
    except (InvalidToken, ValueError):
        log.warning("Could not decrypt a stored API key - has SECRET_KEY changed?")
        return None


def hint(plaintext: str | None) -> str | None:
    """A non-sensitive fragment so the UI can show which key is stored."""
    if not plaintext:
        return None
    tail = plaintext[-4:] if len(plaintext) >= 4 else plaintext
    return f"...{tail}"
