from pydantic import BaseModel

class SubmittedTrack(BaseModel):
    key: str = ""
    mode: str = ""
    BPM: float = 0
    fingerprint: str = ""
    n_notes: int = 0
    duration_s: float = 0

class SimilarTrack(BaseModel):
    rank: int = 0
    title: str = ""
    source: str = ""
    score: float = 0
    melody: float = 0
    rhythm: float = 0
    structure: float = 0
    key: str = ""
    BPM: float = 0
    soundcloud_url: str = ""
    hook_intervals: int = 0
    global_overlap: float = 0
    hook: float = 0

class ReportResponse(BaseModel):
    verdict: str
    submitted_track: SubmittedTrack
    similar_tracks: list[SimilarTrack]
    ai_summary: str
    can_seal: bool
