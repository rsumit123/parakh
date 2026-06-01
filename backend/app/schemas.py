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
