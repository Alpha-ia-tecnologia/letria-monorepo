"""Bounded delivery profiles for the installed Dora voice; no pitch shifting."""
from __future__ import annotations

from dataclasses import dataclass
import re
from typing import Sequence


@dataclass(frozen=True)
class VoiceSettings:
    profile: str
    pace: str
    speed: float
    sentence_pause: float
    clause_pause: float


def voice_settings(profile: str = "reading", pace: str = "natural") -> VoiceSettings:
    if profile not in ("reading", "conversation") or pace not in ("natural", "calm"):
        raise ValueError("Unknown speech profile or pace")
    speed = 0.90 if pace == "calm" else 1.0 if profile == "conversation" else 0.96
    return VoiceSettings(profile, pace, speed, 0.32 if pace == "calm" else 0.25, 0.14 if pace == "calm" else 0.10)


def prepare_spoken_text(text: str, settings: VoiceSettings) -> str:
    """Correct only the assistant's spoken name; written learning text is exact."""
    if settings.profile != "conversation":
        return text
    return re.sub(r"\bLumi\b", "Lúmi", text)


def reading_chunks(text: str, limit: int = 240, word_limit: int | None = None) -> list[str]:
    """Preserve the written word, punctuation and explicit syllable separators."""
    chunks: list[str] = []
    for sentence in re.split(r"(?<=[.!?;])\s+|\n+", text.strip()):
        current = ""
        for word in sentence.split():
            if len(word) > (word_limit or limit):
                raise ValueError("Text contains a word that is too long")
            if current and len(current) + len(word) + 1 > limit:
                chunks.append(current)
                current = ""
            current = (current + " " + word).strip()
        if current:
            chunks.append(current)
    return chunks


def delivery_chunks(text: str, settings: VoiceSettings) -> list[str]:
    if settings.profile == "reading":
        return reading_chunks(text)
    # Keep a brief greeting or encouragement beside the following sentence.
    # 200 characters is a soft target; the original 240-character hard cap stays.
    atoms = reading_chunks(text, limit=200, word_limit=240)
    packed: list[str] = []
    current = ""
    for atom in atoms:
        candidate = (current + " " + atom).strip()
        short_context = len(current) < 40 or len(atom) < 40
        fits = len(candidate) <= 200 or (short_context and len(candidate) <= 240)
        if current and not fits:
            packed.append(current)
            current = atom
        else:
            current = candidate
    if current:
        packed.append(current)
    return packed


def pause_after(text: str, settings: VoiceSettings) -> float:
    tail = text.rstrip().rstrip(chr(34) + chr(39) + "”’)]}")
    if tail.endswith((".", "!", "?", "…")):
        return settings.sentence_pause
    if tail.endswith((",", ";", ":")):
        return settings.clause_pause
    return 0.065 if settings.pace == "calm" else 0.04


def quiet_edge_samples(samples: Sequence[float], rate: int, leading: bool) -> int:
    """Measure only near-silent edge frames, never gaps inside words.

    A conservative -66 dBFS peak threshold and 5 ms frames avoid labelling
    ordinary breath or quiet consonants as silence. Scanning is capped at 0.6 s.
    """
    frame = max(1, int(rate * 0.005))
    available = min(len(samples), int(rate * 0.6))
    quiet = 0
    for offset in range(0, available, frame):
        end = min(offset + frame, available)
        start_index = offset if leading else len(samples) - end
        end_index = end if leading else len(samples) - offset
        if any(abs(float(value)) > 0.0005 for value in samples[start_index:end_index]):
            break
        quiet = end
    return quiet


def conservative_edge_bounds(samples: Sequence[float], rate: int) -> tuple[int, int]:
    """Shorten only excessive outer silence, retaining a 60 ms safety margin."""
    head = quiet_edge_samples(samples, rate, True)
    tail = quiet_edge_samples(samples, rate, False)
    # Do not mistake an entirely quiet clip for usable speech.
    if head + tail >= len(samples):
        return 0, len(samples)
    keep = int(rate * 0.06)
    excess = int(rate * 0.08)
    start = head - keep if head > keep + excess else 0
    end = len(samples) - tail + keep if tail > keep + excess else len(samples)
    return max(0, start), min(len(samples), end)


def missing_join_silence(left: Sequence[float], right: Sequence[float], rate: int, desired: float) -> int:
    """Top up a boundary to its target; existing model pauses count toward it."""
    existing = quiet_edge_samples(left, rate, False) + quiet_edge_samples(right, rate, True)
    return max(0, int(rate * desired) - existing)
