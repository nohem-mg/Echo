"""Business core: compare a submission against the private registry (Step 2B).

HTTP-independent and testable: the registry store is injected, so tests use the
in-memory backend and never touch a database.
"""

from __future__ import annotations

from echo_common.log import get_logger
from echo_common.schemas.midi import MidiSequence

from .config import Settings
from .schemas import RegistryMatch
from .similarity import score_intervals, skyline_intervals
from .store import RegistryStore

logger = get_logger(__name__)


class MidiSimilarityService:
    def __init__(self, store: RegistryStore, settings: Settings) -> None:
        self._store = store
        self._s = settings

    async def register(self, track_id: str, midi: MidiSequence) -> None:
        """Add a track's melodic line to the private registry."""
        await self._store.add(track_id, skyline_intervals(midi))

    async def compare(self, midi: MidiSequence) -> list[RegistryMatch]:
        """Score the submission against every registered track (full scan; small registry)."""
        query = skyline_intervals(midi)
        matches: list[RegistryMatch] = []
        for track_id, intervals in await self._store.all():
            s = score_intervals(query, intervals)
            if s.similarity >= self._s.similarity_floor:
                matches.append(
                    RegistryMatch(
                        track_id=track_id,
                        similarity_score=s.similarity,
                        global_overlap=s.global_overlap,
                        hook=s.hook,
                        hook_intervals=s.hook_intervals,
                    )
                )
        matches.sort(key=lambda m: m.similarity_score, reverse=True)
        return matches[: self._s.top_n]
