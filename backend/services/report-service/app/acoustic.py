"""Key / BPM / fingerprint extraction from raw audio (never from MIDI)."""

from __future__ import annotations

import hashlib
from dataclasses import dataclass
from pathlib import Path

import librosa
import numpy as np

_KEY_NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"]
_MAJOR = np.array([6.35, 2.23, 3.48, 2.33, 4.38, 4.09, 2.52, 5.19, 2.33, 3.34, 2.33, 2.68])
_MINOR = np.array([6.33, 2.68, 3.52, 5.38, 2.60, 3.53, 2.54, 4.75, 3.98, 2.69, 3.34, 3.17])


@dataclass(frozen=True)
class AcousticProfile:
    key: str
    mode: str
    bpm: float
    fingerprint: str


def warmup() -> None:
    """Charge librosa au démarrage pour éviter un cold start >10s (limite CRE sim HTTP)."""
    import tempfile

    import soundfile as sf

    sr = 22_050
    y = np.zeros(sr, dtype=np.float32)
    with tempfile.NamedTemporaryFile(suffix=".wav", delete=False) as tmp:
        path = Path(tmp.name)
    try:
        sf.write(path, y, sr)
        extract_profile(path, max_duration_s=1.0)
    finally:
        path.unlink(missing_ok=True)


def extract_profile(path: Path, *, max_duration_s: float) -> AcousticProfile:
    y, sr = librosa.load(path, sr=22_050, mono=True, duration=max_duration_s)
    if y.size == 0:
        raise ValueError("empty audio")

    key, mode = _estimate_key_mode(y, sr)
    bpm = _estimate_bpm(y, sr)
    fingerprint = _fingerprint(y, sr)
    return AcousticProfile(key=key, mode=mode, bpm=bpm, fingerprint=fingerprint)


def _estimate_bpm(y: np.ndarray, sr: int) -> float:
    onset_env = librosa.onset.onset_strength(y=y, sr=sr)
    tempo = librosa.feature.tempo(onset_envelope=onset_env, sr=sr)
    value = float(np.atleast_1d(tempo)[0])
    return round(max(40.0, min(value, 240.0)), 1)


def _estimate_key_mode(y: np.ndarray, sr: int) -> tuple[str, str]:
    chroma = librosa.feature.chroma_cqt(y=y, sr=sr)
    mean = chroma.mean(axis=1)
    best_score = -np.inf
    best_key, best_mode = "C", "maj"
    for i, name in enumerate(_KEY_NAMES):
        major = np.correlate(mean, np.roll(_MAJOR, i))[0]
        minor = np.correlate(mean, np.roll(_MINOR, i))[0]
        if major > best_score:
            best_score, best_key, best_mode = major, name, "maj"
        if minor > best_score:
            best_score, best_key, best_mode = minor, name, "min"
    return best_key, best_mode


def _fingerprint(y: np.ndarray, sr: int) -> str:
    mfcc = librosa.feature.mfcc(y=y, sr=sr, n_mfcc=20)
    digest = hashlib.sha256(mfcc.mean(axis=1).astype(np.float32).tobytes()).hexdigest()[:16]
    return f"fp-{digest}"
