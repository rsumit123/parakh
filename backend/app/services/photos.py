"""Meal photos in a private S3 bucket.

Uploads are re-encoded with Pillow before storing: that bounds size (max 1280 px,
JPEG q82), rejects non-images, applies the camera's rotation, and drops all EXIF
metadata — including the GPS location phones embed. Objects are never public; the
app shows them through short-lived presigned GET URLs.
"""
import io
import uuid

from PIL import Image, ImageOps, UnidentifiedImageError

MAX_SIDE = 1280
URL_TTL_S = 12 * 3600  # long enough for a session; refreshed on every day fetch
KEY_PREFIX = "meals/"


class PhotoError(Exception):
    """Upload is not a readable image."""


def user_prefix(identity: str) -> str:
    # identity is "user:<n>"; keys never contain ":".
    return f"{KEY_PREFIX}{identity.replace(':', '-')}/"


def normalise(image_bytes: bytes) -> bytes:
    try:
        img = Image.open(io.BytesIO(image_bytes))
        img = ImageOps.exif_transpose(img)
    except (UnidentifiedImageError, OSError) as e:
        raise PhotoError("not an image") from e
    img = img.convert("RGB")  # drops alpha / palette; JPEG needs RGB
    img.thumbnail((MAX_SIDE, MAX_SIDE))
    out = io.BytesIO()
    img.save(out, format="JPEG", quality=82, optimize=True)  # no exif= -> metadata dropped
    return out.getvalue()


class PhotoStore:
    def __init__(self, s3_client, bucket: str):
        self._s3 = s3_client
        self._bucket = bucket

    @classmethod
    def from_settings(cls, settings) -> "PhotoStore | None":
        if not settings.s3_bucket:
            return None
        import boto3
        client = boto3.client(
            "s3", region_name=settings.s3_region,
            aws_access_key_id=settings.aws_access_key_id or None,
            aws_secret_access_key=settings.aws_secret_access_key or None,
        )
        return cls(client, settings.s3_bucket)

    def save(self, identity: str, image_bytes: bytes) -> str:
        data = normalise(image_bytes)
        key = f"{user_prefix(identity)}{uuid.uuid4().hex}.jpg"
        self._s3.put_object(Bucket=self._bucket, Key=key, Body=data,
                            ContentType="image/jpeg", CacheControl="private, max-age=86400")
        return key

    def url(self, key: str) -> str:
        return self._s3.generate_presigned_url(
            "get_object", Params={"Bucket": self._bucket, "Key": key}, ExpiresIn=URL_TTL_S)

    def delete(self, key: str) -> None:
        self._s3.delete_object(Bucket=self._bucket, Key=key)
