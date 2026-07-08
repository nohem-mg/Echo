import hashlib
import json
import logging
import tempfile
from pathlib import Path

from fastapi import APIRouter, File, Form, UploadFile, HTTPException

from . import acoustic
from .config import settings
from .schemas import ReportResponse
from .service import ReportService

logger = logging.getLogger(__name__)
router = APIRouter()
_service = ReportService()


def _extract_acoustic_profile(audio_bytes: bytes) -> acoustic.AcousticProfile | None:
    """Key/mode/BPM from the raw audio signal (Step 4). None if decoding fails."""
    if not audio_bytes:
        return None
    with tempfile.NamedTemporaryFile(suffix=".audio", delete=False) as tmp:
        path = Path(tmp.name)
        tmp.write(audio_bytes)
    try:
        return acoustic.extract_profile(path, max_duration_s=settings.max_audio_seconds)
    except Exception:
        logger.warning("acoustic extraction failed; falling back to MIDI-provided fields", exc_info=True)
        return None
    finally:
        path.unlink(missing_ok=True)


@router.post("/api/report", response_model=ReportResponse)
async def generate_report(
    file: UploadFile = File(...),
    midiSequence: str = Form(...),
    registry_matches: str = Form("[]"),
    commercial_deltas: str = Form("[]"),
):
    try:
        midi = json.loads(midiSequence)
        reg = json.loads(registry_matches)
        com = json.loads(commercial_deltas)
    except json.JSONDecodeError as e:
        raise HTTPException(status_code=422, detail=f"Invalid JSON: {e}")

    audio_bytes = await file.read()
    fingerprint = "0x" + hashlib.sha256(audio_bytes).hexdigest()

    profile = _extract_acoustic_profile(audio_bytes)
    key = profile.key if profile else ""
    mode = profile.mode if profile else ""
    bpm = profile.bpm if profile else 0

    submitted_track = {
        "key": midi.get("key", key),
        "mode": midi.get("mode", mode),
        "BPM": midi.get("BPM", midi.get("tempo", bpm)),
        "fingerprint": midi.get("fingerprint", fingerprint),
        "n_notes": midi.get("n_notes", len(midi.get("notes", []))),
        "duration_s": midi.get("duration_s", 0.0),
    }

    result = _service.generate(submitted_track, reg, com)
    logger.info("report generated", extra={"verdict": result.verdict})
    return result
