"""Business core: compare a submission against the private registry (Step 2B).

Pure compute: it owns no data. The registry (sealed tracks) lives in registry-service;
this service fetches the cached intervals from it and scores the query against them.
The intervals provider is injected, so tests supply a stub and never hit the network.
"""

from __future__ import annotations

from typing import Awaitable, Callable

from echo_common.log import get_logger
from echo_common.midi_features import skyline_intervals
from echo_common.schemas.midi import MidiSequence

from .config import Settings
from .schemas import RegistryMatch
from .similarity import score_intervals

logger = get_logger(__name__)

# Provider returns the registry's cached features: list of (track_id, intervals).
IntervalsProvider = Callable[[], Awaitable[list[tuple[str, list[int]]]]]


class MidiSimilarityService:
    def __init__(self, intervals_provider: IntervalsProvider, settings: Settings) -> None:
        self._intervals = intervals_provider
        self._s = settings

    async def compare(self, midi: MidiSequence) -> list[RegistryMatch]:
        """Score the submission against every registered track (full scan; small registry)."""
        query = skyline_intervals(midi)
        matches: list[RegistryMatch] = []
        for track_id, intervals in await self._intervals():
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
