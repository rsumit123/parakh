"""Parsing helpers for JSON returned by LLMs."""
import re

_FENCE = re.compile(r"^```(?:json)?\s*(.*?)\s*```$", re.S)


def strip_fences(text: str) -> str:
    """Some models wrap JSON in ```json ... ``` even with response_format set; unwrap it."""
    t = (text or "").strip()
    m = _FENCE.match(t)
    return m.group(1) if m else t
