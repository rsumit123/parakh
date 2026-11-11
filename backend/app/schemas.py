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
    photo_key: str | None = None         # from POST /diet/photo


class MealDish(BaseModel):
    name: str = Field(min_length=1, max_length=80)
    quantity_g: float = Field(gt=0, le=3000)
    per100g: dict


class MealLogRequest(BaseModel):
    """A photo meal logged as its dishes: one group, each dish its own entry."""
    day: str | None = None
    meal: Meal | None = None
    name: str = Field(default="", max_length=80)
    photo_key: str | None = None
    items: list[MealDish] = Field(min_length=1, max_length=20)


class DietEditRequest(BaseModel):
    name: str | None = None
    meal: Meal | None = None
    quantity_g: float | None = None
    macros: dict | None = None           # absolute amounts for the whole portion
    photo_key: str | None = None         # from POST /diet/photo: attach (or replace) the entry's photo


class RepeatRequest(BaseModel):
    entry_ids: list[int] = Field(min_length=1, max_length=30)
    day: str
    meal: Meal


class WeightRequest(BaseModel):
    day: str
    weight_kg: float = Field(ge=25, le=300)   # same bounds as the profile


class ProfileRequest(BaseModel):
    sex: Literal["male", "female"] | None = None
    age: int | None = Field(default=None, ge=13, le=100)
    weight_kg: float | None = Field(default=None, ge=25, le=300)
    height_cm: float | None = Field(default=None, ge=100, le=250)
    activity: Literal["sedentary", "light", "moderate", "active"] | None = None
    goal: Literal["lose", "maintain", "gain"] | None = None
    target_overrides: dict | None = None
