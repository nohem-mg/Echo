import json
import logging
import tempfile
from pathlib import Path
from fastapi import APIRouter, File, Form, UploadFile, HTTPException
from .service import ReportService
from .schemas import ReportResponse

logger = logging.getLogger(__name__)
router = APIRouter()
_service = ReportService()

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

    submitted_track = {
        "key": midi.get("key", ""),
        "mode": midi.get("mode", ""),
        "BPM": midi.get("BPM", midi.get("tempo", 0)),
        "fingerprint": midi.get("fingerprint", ""),
        "n_notes": midi.get("n_notes", 0),
        "duration_s": midi.get("duration_s", 0.0),
    }

    result = _service.generate(submitted_track, reg, com)
    logger.info("report generated", extra={"verdict": result.verdict})
    return result
