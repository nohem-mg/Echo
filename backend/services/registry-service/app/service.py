"""Business core: owns the sealed-track registry.

Write path (register): called at SEAL with the full MIDI + optional fingerprint.
We compute the skyline intervals once here (shared extraction) and store all three.
Read path (list_intervals): serves the cached features to midi-similarity-service.
"""

from __future__ import annotations

from echo_common.log import get_logger
from echo_common.midi_features import skyline_intervals
from echo_common.schemas.midi import MidiSequence

from .schemas import TrackIntervals
from .store import RegistryStore

logger = get_logger(__name__)


class RegistryService:
    def __init__(self, store: RegistryStore) -> None:
        self._store = store

    async def register(
        self, track_id: str, midi: MidiSequence, fingerprint: dict | None = None
    ) -> None:
        """Persist a sealed track: full MIDI (source of truth) + precomputed intervals
        (cached feature) + optional audio fingerprint."""
        await self._store.add(
            track_id, midi.model_dump(), skyline_intervals(midi), fingerprint
        )

    async def list_intervals(self) -> list[TrackIntervals]:
        return [
            TrackIntervals(track_id=tid, intervals=intervals)
            for tid, intervals in await self._store.all_intervals()
        ]
