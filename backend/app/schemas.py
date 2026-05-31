from pydantic import BaseModel


class GuestRequest(BaseModel):
    device_id: str


class EmailLoginRequest(BaseModel):
    email: str


class TokenResponse(BaseModel):
    token: str


class BarcodeRequest(BaseModel):
    barcode: str
