from typing import Literal

from pydantic import BaseModel, Field


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


Meal = Literal["breakfast", "lunch", "snack", "dinner"]


class DietLogRequest(BaseModel):
    kind: str = "packaged"               # packaged | unpackaged | manual
    barcode: str | None = None
    name: str
    brand: str = ""
    quantity_g: float
    per100g: dict | None = None          # required for unpackaged/manual
    image_url: str = ""
    day: str | None = None               # client-local YYYY-MM-DD; defaults to server today
    meal: Meal | None = None


class DietEditRequest(BaseModel):
    name: str | None = None
    meal: Meal | None = None
    quantity_g: float | None = None
    macros: dict | None = None           # absolute amounts for the whole portion


class ProfileRequest(BaseModel):
    sex: Literal["male", "female"] | None = None
    age: int | None = Field(default=None, ge=13, le=100)
    weight_kg: float | None = Field(default=None, ge=25, le=300)
    height_cm: float | None = Field(default=None, ge=100, le=250)
    activity: Literal["sedentary", "light", "moderate", "active"] | None = None
    goal: Literal["lose", "maintain", "gain"] | None = None
    target_overrides: dict | None = None
