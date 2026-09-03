"""Core text-statistics functions."""

from __future__ import annotations

import re
from collections import Counter

_WORD_RE = re.compile(r"[^\s]+")


def word_count(text: str) -> int:
    """Count whitespace-separated words in ``text``."""
    return len(_WORD_RE.findall(text))


def char_count(text: str, *, include_whitespace: bool = True) -> int:
    """Count characters in ``text``, optionally excluding whitespace."""
    if include_whitespace:
        return len(text)
    return len(re.sub(r"\s", "", text))


def average_word_length(text: str) -> float:
    """Return the mean length of the words in ``text``, or ``0.0`` when empty."""
    words = _WORD_RE.findall(text)
    if not words:
        return 0.0
    return sum(len(word) for word in words) / len(words)


def most_common_word(text: str) -> str | None:
    """Return the most frequent lowercased word in ``text``, or ``None`` when empty."""
    words = [word.lower() for word in _WORD_RE.findall(text)]
    if not words:
        return None
    counts: Counter[str] = Counter(words)
    return counts.most_common(1)[0][0]
