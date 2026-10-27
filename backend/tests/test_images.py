from app.images import data_url, image_mime


def test_detects_common_types():
    assert image_mime(b"\xff\xd8\xff\xe0rest") == "image/jpeg"
    assert image_mime(b"\x89PNG\r\n\x1a\nrest") == "image/png"
    assert image_mime(b"RIFF\x00\x00\x00\x00WEBPVP8 ") == "image/webp"
    assert image_mime(b"GIF89a...") == "image/gif"


def test_unknown_falls_back_to_jpeg():
    assert image_mime(b"x") == "image/jpeg"


def test_data_url_uses_detected_type():
    assert data_url(b"\x89PNG\r\n\x1a\n").startswith("data:image/png;base64,")
