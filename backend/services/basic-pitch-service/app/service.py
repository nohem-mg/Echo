"""Business core: BasicPitch wrapper. HTTP-independent, testable on its own.

The model is loaded once (at app startup via the lifespan), not per request.
"""

from __future__ import annotations

from functools import cached_property
from pathlib import Path

from echo_common.errors import DomainError
from echo_common.log import get_logger
from echo_common.schemas.midi import MidiSequence, NoteEvent

from .config import Settings
from .schemas import ModelInfo

logger = get_logger(__name__)


class InferenceError(DomainError):
    """Model inference failure — the CRE treats this as STOP fail-fast."""

    status_code = 500
    code = "inference_error"


def _amplitude_to_velocity(amplitude: float) -> int:
    """BasicPitch amplitude (0..1) -> MIDI velocity (1..127)."""
    return max(1, min(127, round(amplitude * 127)))


class BasicPitchService:
    def __init__(self, settings: Settings) -> None:
        self._settings = settings

    @cached_property
    def _model(self):  # type: ignore[no-untyped-def]
        # Lazy imports: the ML stack is heavy, only paid at load time.
        from basic_pitch import ICASSP_2022_MODEL_PATH
        from basic_pitch.inference import Model

        logger.info("Loading BasicPitch model", extra={"context": {}})
        return Model(ICASSP_2022_MODEL_PATH)

    def warmup(self) -> None:
        """Force the model to load (called at boot)."""
        _ = self._model

    @cached_property
    def _model_info(self) -> ModelInfo:
        try:
            from importlib.metadata import version

            bp_version = version("basic-pitch")
        except Exception:  # noqa: BLE001
            bp_version = "unknown"
        return ModelInfo(backend=self._resolve_backend(), version=bp_version)

    @staticmethod
    def _resolve_backend() -> str:
        # Best-effort: reflects the likely runtime based on what is importable.
        # Order matches BasicPitch's own backend priority on each platform.
        for name, mod in (
            ("coreml", "coremltools"),
            ("tensorflow", "tensorflow"),
            ("onnx", "onnxruntime"),
        ):
            try:
                __import__(mod)
                return name
            except Exception:  # noqa: BLE001
                continue
        return "auto"

    def convert(self, audio_path: Path) -> tuple[MidiSequence, ModelInfo]:
        s = self._settings
        try:
            from basic_pitch.inference import predict

            _model_output, _midi_data, note_events = predict(
                str(audio_path),
                model_or_model_path=self._model,
                onset_threshold=s.onset_threshold,
                frame_threshold=s.frame_threshold,
                minimum_note_length=s.minimum_note_length_ms,
                minimum_frequency=s.minimum_frequency,
                maximum_frequency=s.maximum_frequency,
            )
        except Exception as exc:  # noqa: BLE001 — any ML failure = STOP fail-fast
            logger.exception("BasicPitch inference failed")
            raise InferenceError("Audio -> MIDI conversion failed.") from exc

        return self._to_sequence(note_events), self._model_info

    @staticmethod
    def _to_sequence(note_events: list) -> MidiSequence:
        # note_events: list of (start_s, end_s, pitch_midi, amplitude, pitch_bends|None)
        notes = [
            NoteEvent(
                start_s=float(start),
                end_s=float(end),
                pitch=int(pitch),
                velocity=_amplitude_to_velocity(float(amplitude)),
                pitch_bends=list(bends) if bends is not None else None,
            )
            for (start, end, pitch, amplitude, bends) in note_events
        ]
        duration = max((n.end_s for n in notes), default=0.0)
        return MidiSequence(notes=notes, duration_s=duration, n_notes=len(notes))
