import hashlib
import json
import logging
from fastapi import APIRouter, File, Form, UploadFile, HTTPException
from .service import ReportService
from .schemas import ReportResponse

logger = logging.getLogger(__name__)
router = APIRouter()
_service = ReportService()

_NOTE_NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"]
_MAJOR_PROFILE = [6.35, 2.23, 3.48, 2.33, 4.38, 4.09, 2.52, 5.19, 2.39, 3.66, 2.29, 2.88]
_MINOR_PROFILE = [6.33, 2.68, 3.52, 5.38, 2.60, 3.53, 2.54, 4.75, 3.98, 2.69, 3.34, 3.17]


def _estimate_bpm(notes: list) -> float:
    if len(notes) < 2:
        return 0
    onsets = sorted(n["start_s"] for n in notes if "start_s" in n)
    iois = [b - a for a, b in zip(onsets, onsets[1:]) if b - a > 0.05]
    if not iois:
        return 0
    median_ioi = sorted(iois)[len(iois) // 2]
    bpm = 60.0 / median_ioi
    while bpm < 60:
        bpm *= 2
    while bpm > 220:
        bpm /= 2
    return round(bpm, 1)


def _estimate_key(notes: list) -> tuple[str, str]:
    if not notes:
        return "", ""
    hist = [0.0] * 12
    for n in notes:
        if "pitch" in n:
            hist[n["pitch"] % 12] += 1
    total = sum(hist) or 1
    hist = [h / total for h in hist]

    def corr(h, profile):
        mh = sum(h) / 12
        mp = sum(profile) / 12
        num = sum((h[i] - mh) * (profile[i] - mp) for i in range(12))
        dh = sum((h[i] - mh) ** 2 for i in range(12)) ** 0.5
        dp = sum((profile[i] - mp) ** 2 for i in range(12)) ** 0.5
        return num / (dh * dp) if dh and dp else 0

    best, best_key, best_mode = -2.0, "", ""
    for root in range(12):
        rot = hist[root:] + hist[:root]
        for score, mode in [(corr(rot, _MAJOR_PROFILE), "maj"), (corr(rot, _MINOR_PROFILE), "min")]:
            if score > best:
                best, best_key, best_mode = score, _NOTE_NAMES[root], mode
    return best_key, best_mode


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

    notes = midi.get("notes", [])
    key, mode = _estimate_key(notes)
    bpm = _estimate_bpm(notes)

    submitted_track = {
        "key": midi.get("key", key),
        "mode": midi.get("mode", mode),
        "BPM": midi.get("BPM", midi.get("tempo", bpm)),
        "fingerprint": midi.get("fingerprint", fingerprint),
        "n_notes": midi.get("n_notes", len(notes)),
        "duration_s": midi.get("duration_s", 0.0),
    }

    result = _service.generate(submitted_track, reg, com)
    logger.info("report generated", extra={"verdict": result.verdict})
    return result
