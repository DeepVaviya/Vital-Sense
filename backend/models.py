"""Pydantic models for request/response validation."""
from pydantic import BaseModel, Field
from typing import Optional
from datetime import datetime


# ---------- Auth (legacy) ----------
class UserRegister(BaseModel):
    name: str = Field(..., min_length=2, max_length=100)
    email: str
    password: str = Field(..., min_length=6)


class UserLogin(BaseModel):
    email: str
    password: str


class UserResponse(BaseModel):
    user_id: str
    name: str
    email: str
    created_at: datetime


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: UserResponse


# ---------- Face Registration ----------
class FaceRegisterRequest(BaseModel):
    name: str = Field(..., min_length=1, max_length=100)
    age: int = Field(..., ge=1, le=150)
    face_embedding: list[float] = Field(default=[], max_length=256)
    photo_base64: Optional[str] = None


class RegisteredUserResponse(BaseModel):
    user_id: str
    name: str
    age: int
    created_at: datetime


class IdentifyFaceRequest(BaseModel):
    embedding: list[float] = Field(..., min_length=64, max_length=256)


class IdentifyFaceResponse(BaseModel):
    matched: bool
    user_id: Optional[str] = None
    name: Optional[str] = None
    confidence: float = 0.0


# ---------- Vitals ----------
class VitalsSnapshot(BaseModel):
    heart_rate: Optional[float] = None
    respiration_rate: Optional[float] = None
    hrv_rmssd: Optional[float] = None
    hrv_sdnn: Optional[float] = None
    stress_score: Optional[float] = None
    cognitive_load: Optional[str] = None
    fatigue_risk: Optional[float] = None
    mood: Optional[str] = None
    pulse_waveform: list[float] = []
    respiration_waveform: list[float] = []
    hrv_timeline: list[float] = []
    face_detected: bool = False
    message: Optional[str] = None
    timestamp: float = 0.0


class StoreVitalsRequest(BaseModel):
    user_id: str
    heart_rate: float = 0.0
    respiration_rate: float = 0.0
    hrv: float = 0.0
    stress_score: float = 0.0
    mood: str = "Neutral"
    fatigue_risk: float = 0.0


class PredictionResponse(BaseModel):
    stress_trend: str = ""
    stress_direction: str = "stable"
    fatigue_risk_prediction: str = ""
    fatigue_level: str = "low"
    anomaly_alerts: list[str] = []
    anomaly_count: int = 0
