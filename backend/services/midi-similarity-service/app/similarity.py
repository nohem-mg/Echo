"""Compositional similarity between two MIDI sequences (Step 2B core).

Pure functions, no I/O — deterministic and reproducible (TEE-friendly).

Pipeline (see backend/docs/reference/music-plagiarism-cases.md for the rationale):
  1. skyline melody  — BasicPitch gives a blended polyphonic note cloud (it does NOT
     separate instruments), so we approximate the lead line by keeping the highest
     pitch at each onset.
  2. intervals       — differences between consecutive melody pitches. Transposition-
     invariant: shifting to another key doesn't change them.
  3. two signals:
       - global overlap : cosine over interval n-grams (substantial overall reuse)
       - hook           : longest local alignment (Smith-Waterman) = a distinctive
                          copied phrase, gated by a minimum length so coincidental
                          short runs (the "4 notes" problem) never trigger.
  4. anti-banality     — trivial patterns (scales, chromatic lines, repeated notes,
     e.g. Stairway / Dark Horse) are discarded so commonplace material never flags.

The final score is max(global, hook): either substantial overall reuse OR a distinctive
copied phrase is enough. Both sub-scores are returned for explainability.
"""

from __future__ import annotations

from collections import Counter
from dataclasses import dataclass
from math import sqrt

from echo_common.schemas.midi import MidiSequence

_NGRAM = 3
_MIN_HOOK = 5         # min aligned intervals (=6 notes) to count as a hook
_HOOK_REF = 12        # aligned intervals that map to a full-strength hook (100)
_ONSET_EPS = 0.03     # notes within 30ms share an onset (chord) -> keep the top pitch


@dataclass(frozen=True)
class Score:
    similarity: float       # headline 0-100
    global_overlap: float   # 0-100
    hook: float             # 0-100
    hook_intervals: int     # length of the distinctive matched phrase


def skyline_intervals(seq: MidiSequence) -> list[int]:
    """Extract the melodic line (highest pitch per onset) as an interval sequence."""
    notes = sorted(seq.notes, key=lambda n: (n.start_s, -n.pitch))
    melody: list[int] = []
    last_onset = None
    for n in notes:
        if last_onset is None or n.start_s - last_onset > _ONSET_EPS:
            melody.append(n.pitch)        # new onset -> its highest note (skyline)
            last_onset = n.start_s
    return [melody[i + 1] - melody[i] for i in range(len(melody) - 1)]


def _is_trivial(pattern: tuple[int, ...]) -> bool:
    """Commonplace, unprotectable shapes (scales, chromatic lines, repeated notes)."""
    distinct = set(pattern)
    if len(distinct) <= 1:
        return True                              # repeated note / constant step
    if distinct <= {1, 2} or distinct <= {-1, -2}:
        return True                              # ascending/descending diatonic-or-chromatic run
    return False


def _ngram_counts(intervals: list[int]) -> Counter[tuple[int, ...]]:
    counts: Counter[tuple[int, ...]] = Counter()
    for i in range(len(intervals) - _NGRAM + 1):
        gram = tuple(intervals[i : i + _NGRAM])
        if not _is_trivial(gram):                # drop commonplace fragments
            counts[gram] += 1
    return counts


def _cosine(a: Counter, b: Counter) -> float:
    if not a or not b:
        return 0.0
    dot = sum(c * b.get(g, 0) for g, c in a.items())
    na, nb = sqrt(sum(c * c for c in a.values())), sqrt(sum(c * c for c in b.values()))
    return dot / (na * nb) if na and nb else 0.0


def _best_local_match(a: list[int], b: list[int]) -> list[int]:
    """Smith-Waterman local alignment; returns the matched interval run (tolerates gaps)."""
    MATCH, MISMATCH, GAP = 2, -1, -2
    n, m = len(a), len(b)
    if n == 0 or m == 0:
        return []
    h = [[0] * (m + 1) for _ in range(n + 1)]
    ptr = [[0] * (m + 1) for _ in range(n + 1)]   # 1 diag, 2 up, 3 left
    best = (0, 0, 0)
    for i in range(1, n + 1):
        for j in range(1, m + 1):
            diag = h[i - 1][j - 1] + (MATCH if a[i - 1] == b[j - 1] else MISMATCH)
            up, left = h[i - 1][j] + GAP, h[i][j - 1] + GAP
            cell = max(0, diag, up, left)
            h[i][j] = cell
            ptr[i][j] = 1 if cell == diag else 2 if cell == up else 3 if cell == left else 0
            if cell > best[0]:
                best = (cell, i, j)
    _, i, j = best
    matched: list[int] = []
    while i > 0 and j > 0 and h[i][j] > 0:
        if ptr[i][j] == 1:
            if a[i - 1] == b[j - 1]:
                matched.append(a[i - 1])
            i, j = i - 1, j - 1
        elif ptr[i][j] == 2:
            i -= 1
        elif ptr[i][j] == 3:
            j -= 1
        else:
            break
    matched.reverse()
    return matched


def score_intervals(a: list[int], b: list[int]) -> Score:
    """Score two interval sequences (already extracted via skyline)."""
    global_overlap = _cosine(_ngram_counts(a), _ngram_counts(b)) * 100

    matched = _best_local_match(a, b)
    if len(matched) >= _MIN_HOOK and not _is_trivial(tuple(matched)):
        hook = min(1.0, len(matched) / _HOOK_REF) * 100
        hook_len = len(matched)
    else:
        hook, hook_len = 0.0, 0

    return Score(
        similarity=round(max(global_overlap, hook), 2),
        global_overlap=round(global_overlap, 2),
        hook=round(hook, 2),
        hook_intervals=hook_len,
    )
