from pydantic import BaseModel


class GuestRequest(BaseModel):
    device_id: str


class GoogleLoginRequest(BaseModel):
    id_token: str


class GoogleLoginResponse(BaseModel):
    token: str
    email: str
    name: str | None = None
    avatar_url: str | None = None


class TokenResponse(BaseModel):
    token: str


class BarcodeRequest(BaseModel):
    barcode: str


class DietLogRequest(BaseModel):
    kind: str = "packaged"               # packaged | unpackaged | manual
    barcode: str | None = None
    name: str
    brand: str = ""
    quantity_g: float
    per100g: dict | None = None          # required for unpackaged/manual
    image_url: str = ""
    day: str | None = None               # client-local YYYY-MM-DD; defaults to server today


class ProfileRequest(BaseModel):
    sex: str | None = None
    age: int | None = None
    weight_kg: float | None = None
    activity: str | None = None
    goal: str | None = None
    target_overrides: dict | None = None
