import json
import logging
import re
from groq import Groq
from .config import settings
from .schemas import ReportResponse, SubmittedTrack, SimilarTrack

logger = logging.getLogger(__name__)

PROMPT_SYSTEM = """You are an AI music IP agent with the final authority to approve or block an on-chain SEAL.
Your decision is binding and non-bypassable. You speak directly to the artist in English.

STRICT RULES:
- NO titles, NO bold, NO markdown, NO bullet points, NO lists
- Maximum 2 short paragraphs, 2-3 sentences each
- Start directly with the content
- Only mention what is in the data. Never invent similarities, scores, or links.
- Only include a SoundCloud link if explicitly provided in the data.
- Be specific: name the track, cite the actual scores.

LEGAL FRAMEWORK — analytical method:
- Melodic patterns (hook_intervals) are the most protectable element. Each matched interval represents a specific sequence of notes that can constitute infringement.
- Rhythm alone is rarely protectable unless combined with a distinctive melodic pattern.
- Global overlap measures how much of the submitted track overlaps with the existing one — high overlap on a short track (few notes) is more significant than on a long track.
- Hook percentage measures how much of the hook specifically matches — a hook is the most distinctive and therefore most protectable part of a composition.
- Common chord progressions, feel, and groove are NOT protectable regardless of score.
- Assess protectability by asking: is the similarity in a specific, original melodic sequence? Or is it in a generic rhythmic pattern or common progression?"""


class ReportService:
    def __init__(self):
        self.client = Groq(api_key=settings.groq_api_key) if settings.groq_api_key else None

    def generate(
        self,
        submitted_track: dict,
        registry_matches: list,
        commercial_deltas: list,
    ) -> ReportResponse:
        similar_tracks = self._build_similar_tracks(registry_matches, commercial_deltas)
        best_score = max((t.score for t in similar_tracks), default=0)
        verdict = "SIMILAR" if best_score >= 75 else "CLEAN"

        ai_summary = self._call_groq(submitted_track, similar_tracks, verdict)
        can_seal = self._compute_can_seal(similar_tracks, verdict)

        return ReportResponse(
            verdict=verdict,
            submitted_track=SubmittedTrack(**submitted_track) if submitted_track else SubmittedTrack(),
            similar_tracks=similar_tracks,
            ai_summary=ai_summary,
            can_seal=can_seal,
        )

    def _compute_can_seal(self, similar_tracks: list[SimilarTrack], verdict: str) -> bool:
        """Deterministic evaluation of similarity rules to approve or block the SEAL."""
        if verdict == "SIMILAR":
            return False
            
        for t in similar_tracks:
            # High similarity in both melody and rhythm
            if t.melody > 70 and t.rhythm > 70:
                return False
                
            # Overall similarity exceeds the maximum allowed threshold
            if t.score > 75:
                return False
                
        return True

    def _build_similar_tracks(self, registry_matches: list, commercial_deltas: list) -> list[SimilarTrack]:
        tracks = []
        rank = 1

        for m in registry_matches:
            tracks.append(SimilarTrack(
                rank=rank,
                title=m.get("title", f"Track #{m.get('track_id', '?')}"),
                source="Private Registry",
                score=m.get("similarity_score", 0),
                melody=m.get("melodic", 0),
                rhythm=m.get("rhythmic", 0),
                structure=m.get("structural", 0),
                key=m.get("key", ""),
                BPM=m.get("BPM", 0),
                soundcloud_url=m.get("soundcloud_url", ""),
                hook_intervals=m.get("hook_intervals", 0),
                global_overlap=m.get("global_overlap", 0),
                hook=m.get("hook", 0),
            ))
            rank += 1

        for d in commercial_deltas:
            score = (d.get("melodic", 0) + d.get("rhythmic", 0) + d.get("structural", 0)) / 3
            tracks.append(SimilarTrack(
                rank=rank,
                title=d.get("title", d.get("ISRC", "?")),
                source="ACRCloud",
                score=round(score, 1),
                melody=d.get("melodic", 0),
                rhythm=d.get("rhythmic", 0),
                structure=d.get("structural", 0),
                key=d.get("key", ""),
                BPM=d.get("BPM", 0),
                soundcloud_url=d.get("soundcloud_url", ""),
            ))
            rank += 1

        return sorted(tracks, key=lambda t: t.score, reverse=True)

    def _call_groq(self, submitted_track: dict, similar_tracks: list[SimilarTrack], verdict: str) -> str:
        if not similar_tracks:
            return "No significant similarity detected. Your track is original and eligible for SEAL."

        if self.client is None:
            return self._fallback_summary(submitted_track, similar_tracks, verdict)

        tracks_str = "\n".join([
            f"- {t.title} ({t.source}): overall {t.score}%, "
            f"melody {t.melody}%, rhythm {t.rhythm}%, structure {t.structure}%"
            + (f", hook {t.hook}%, hook_intervals matched: {t.hook_intervals}, global_overlap: {t.global_overlap}%" if t.source == "Private Registry" else "")
            + (f" — listen: {t.soundcloud_url}" if t.soundcloud_url else "")
            for t in similar_tracks[:3]
        ])

        user_prompt = f"""Track submitted: {submitted_track.get('key', '?')} {submitted_track.get('mode', '')}, {submitted_track.get('BPM', '?')} BPM — {submitted_track.get('n_notes', '?')} notes, {submitted_track.get('duration_s', '?')}s
Algorithm verdict: {verdict}

{f"Similarities detected:{chr(10)}{tracks_str}" if similar_tracks else "No similarity detected by the algorithm."}

Analyze the similarities against the legal framework. Pay special attention to hook_intervals — each matched interval is a melodic pattern, the most protectable element in copyright law. Explain what matches, whether it is protectable, and why the SEAL is approved or blocked."""

        logger.info("Calling Groq", extra={"model": settings.groq_model, "similar_count": len(similar_tracks)})

        try:
            response = self.client.chat.completions.create(
                model=settings.groq_model,
                max_tokens=settings.groq_max_tokens,
                messages=[
                    {"role": "system", "content": PROMPT_SYSTEM},
                    {"role": "user", "content": user_prompt},
                ],
                temperature=0.3,
            )
        except Exception as exc:
            logger.warning("Groq summary failed; using deterministic fallback", extra={"error": str(exc)})
            return self._fallback_summary(submitted_track, similar_tracks, verdict)

        text = response.choices[0].message.content.strip()
        # Strip markdown formatting to ensure clean text output
        text = re.sub(r'\*\*[^*]+\*\*\n?', '', text).strip()
        
        return text

    def _fallback_summary(self, submitted_track: dict, similar_tracks: list[SimilarTrack], verdict: str) -> str:
        top = similar_tracks[0] if similar_tracks else None
        if not top:
            return "No significant similarity detected. Your track is original and eligible for SEAL."

        decision = "blocked from SEAL" if verdict == "SIMILAR" else "eligible for SEAL"
        return (
            f"Mocked AI summary. Top match: {top.title} from {top.source} at {top.score}% overall "
            f"similarity, with melody {top.melody}%, rhythm {top.rhythm}%, and structure {top.structure}%. "
            f"The deterministic verdict is {verdict}, so the track is {decision}."
        )
