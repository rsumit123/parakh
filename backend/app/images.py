"""Detect an uploaded image's real type from its magic bytes, so the data: URL sent to
the vision model declares the right media type. Gallery picks can be PNG/WebP; strict
providers (e.g. Anthropic) reject a mismatch between declared and actual type."""
import base64


def image_mime(data: bytes) -> str:
    if data[:3] == b"\xff\xd8\xff":
        return "image/jpeg"
    if data[:8] == b"\x89PNG\r\n\x1a\n":
        return "image/png"
    if data[:4] == b"RIFF" and data[8:12] == b"WEBP":
        return "image/webp"
    if data[:6] in (b"GIF87a", b"GIF89a"):
        return "image/gif"
    return "image/jpeg"  # unknown: keep the previous default


def data_url(data: bytes) -> str:
    return f"data:{image_mime(data)};base64,{base64.b64encode(data).decode('ascii')}"
