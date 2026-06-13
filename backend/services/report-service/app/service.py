"""Step 4 — rank matches, extract acoustic profile, emit final verdict."""

from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path

from echo_common.schemas.midi import MidiSequence

from .acoustic import AcousticProfile, extract_profile
from .config import Settings
from .schemas import (
    CommercialDeltaIn,
    RegistryMatchIn,
    ReportResponse,
    SimilarTrack,
    SubmittedTrack,
)


@dataclass(frozen=True)
class _Candidate:
    title: str
    source: str
    score: float
    melody: float
    rhythm: float
    structure: float
    key_label: str
    bpm: float


class ReportService:
    def __init__(self, settings: Settings) -> None:
        self._settings = settings

    def build_report(
        self,
        audio_path: Path,
        *,
        midi_sequence: MidiSequence,
        registry_matches: list[RegistryMatchIn],
        commercial_deltas: list[CommercialDeltaIn],
        request_id: str,
    ) -> ReportResponse:
        _ = midi_sequence  # melodic context for future enrichment (Step 3 metadata)
        profile = extract_profile(
            audio_path,
            max_duration_s=self._settings.max_analysis_seconds,
        )
        submitted = SubmittedTrack(
            key=profile.key,
            mode=profile.mode,
            BPM=profile.bpm,
            fingerprint=profile.fingerprint,
        )
        candidates = self._collect_candidates(
            profile, registry_matches, commercial_deltas
        )
        candidates.sort(key=lambda c: c.score, reverse=True)
        similar_tracks = [
            SimilarTrack(
                rank=i + 1,
                title=c.title,
                source=c.source,  # type: ignore[arg-type]
                score=round(c.score, 1),
                melody=round(c.melody, 1),
                rhythm=round(c.rhythm, 1),
                structure=round(c.structure, 1),
                key=c.key_label,
                BPM=c.bpm,
            )
            for i, c in enumerate(candidates[:10])
        ]
        top_score = similar_tracks[0].score if similar_tracks else 0.0
        verdict = (
            "SIMILAR"
            if top_score >= self._settings.similar_threshold
            else "CLEAN"
        )
        ai_summary = self._summary(verdict, top_score, similar_tracks)
        return ReportResponse(
            verdict=verdict,
            submitted_track=submitted,
            similar_tracks=similar_tracks,
            ai_summary=ai_summary,
            request_id=request_id,
        )

    def _collect_candidates(
        self,
        profile: AcousticProfile,
        registry_matches: list[RegistryMatchIn],
        commercial_deltas: list[CommercialDeltaIn],
    ) -> list[_Candidate]:
        key_label = f"{profile.key} {profile.mode}"
        out: list[_Candidate] = []
        for match in registry_matches:
            score = match.similarity_score
            out.append(
                _Candidate(
                    title=f"{match.track_id[:10]}… [SEALED]",
                    source="Registre privé",
                    score=score,
                    melody=score,
                    rhythm=round(score * 0.92, 1),
                    structure=round(score * 0.88, 1),
                    key_label=key_label,
                    bpm=profile.bpm,
                )
            )
        for delta in commercial_deltas:
            score = (delta.melodic + delta.rhythmic + delta.structural) / 3.0
            out.append(
                _Candidate(
                    title=f"ISRC {delta.ISRC}",
                    source="ACRCloud",
                    score=score,
                    melody=delta.melodic,
                    rhythm=delta.rhythmic,
                    structure=delta.structural,
                    key_label=key_label,
                    bpm=profile.bpm,
                )
            )
        return out

    @staticmethod
    def _summary(
        verdict: str, top_score: float, similar_tracks: list[SimilarTrack]
    ) -> str:
        if verdict == "CLEAN":
            return "Aucune similarité significative (<75%). Track éligible au SEAL."
        title = similar_tracks[0].title if similar_tracks else "une track connue"
        return (
            f"Similarité significative ({top_score:.0f}%) avec {title}. "
            "Rapport affiché à l'artiste, aucune écriture on-chain."
        )
