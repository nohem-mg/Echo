"""Safe validation and materialization of incoming audio.

Shared by every service that ingests an audio upload (basic-pitch, acrcloud, ...).
We stream the upload to a temp file with a size cap, then probe the duration
BEFORE any heavy work. ``librosa`` is imported lazily so services that only need
extension/size checks don't pay for it.
"""

from __future__ import annotations

import os
import tempfile
from contextlib import contextmanager
from pathlib import Path
from typing import Iterator

from fastapi import UploadFile

from .errors import InvalidAudioError, PayloadTooLargeError, UnsupportedMediaError

_CHUNK = 1024 * 1024  # 1 MB


def _extension(filename: str | None) -> str:
    if not filename or "." not in filename:
        return ""
    return filename.rsplit(".", 1)[1].lower()


def validate_extension(upload: UploadFile, allowed: tuple[str, ...]) -> str:
    ext = _extension(upload.filename)
    if ext not in allowed:
        raise UnsupportedMediaError(
            f"Unsupported format '{ext or upload.filename}'. "
            f"Accepted formats: {', '.join(allowed)}."
        )
    return ext


@contextmanager
def persist_upload(upload: UploadFile, ext: str, max_bytes: int) -> Iterator[Path]:
    """Write the upload to a temp file with a size cap; clean up on exit."""
    fd, tmp_name = tempfile.mkstemp(suffix=f".{ext}")
    tmp = Path(tmp_name)
    written = 0
    try:
        with os.fdopen(fd, "wb") as out:
            while chunk := upload.file.read(_CHUNK):
                written += len(chunk)
                if written > max_bytes:
                    raise PayloadTooLargeError(
                        f"File too large (> {max_bytes} bytes)."
                    )
                out.write(chunk)
        if written == 0:
            raise InvalidAudioError("Empty audio file.")
        yield tmp
    finally:
        tmp.unlink(missing_ok=True)


def enforce_duration(path: Path, max_duration_s: float) -> float:
    """Probe audio duration (no full decode) and reject if out of bounds."""
    import librosa  # lazy import: heavy, not needed at boot

    try:
        duration = float(librosa.get_duration(path=str(path)))
    except Exception as exc:  # noqa: BLE001 — any failure = unreadable audio
        raise InvalidAudioError("Unreadable or corrupt audio.") from exc

    if duration > max_duration_s:
        raise InvalidAudioError(
            f"Duration {duration:.1f}s exceeds maximum {max_duration_s:.0f}s."
        )
    return duration
