"""Face registration, identification, and vitals storage API."""
import os
import base64
import numpy as np
import cv2
from datetime import datetime, timezone, timedelta
from typing import Optional

from fastapi import APIRouter, HTTPException, Query
from bson import ObjectId

from database import registered_users_collection, user_vitals_collection
from models import (
    FaceRegisterRequest, RegisteredUserResponse,
    IdentifyFaceRequest, IdentifyFaceResponse,
    StoreVitalsRequest,
)
from face_detection import FaceDetector, compute_geometric_embedding

router = APIRouter(prefix="/api", tags=["face-registration"])

PHOTOS_DIR = os.path.join(os.path.dirname(__file__), "photos")
os.makedirs(PHOTOS_DIR, exist_ok=True)

# Geometric embeddings are highly discriminative — use a high threshold
SIMILARITY_THRESHOLD = 0.82

# Shared detector for registration photo processing
_registration_detector = None


def _get_registration_detector() -> FaceDetector:
    """Lazily initialized single-face detector for registration photos."""
    global _registration_detector
    if _registration_detector is None:
        _registration_detector = FaceDetector(max_faces=1)
    return _registration_detector


def cosine_similarity(a: list[float], b: list[float]) -> float:
    """Compute cosine similarity between two embedding vectors."""
    if not a or not b or len(a) != len(b):
        return 0.0
    a_np = np.array(a, dtype=np.float64)
    b_np = np.array(b, dtype=np.float64)
    norm_a = np.linalg.norm(a_np)
    norm_b = np.linalg.norm(b_np)
    if norm_a == 0 or norm_b == 0:
        return 0.0
    return float(np.dot(a_np, b_np) / (norm_a * norm_b))


def _compute_embedding_from_photo(photo_base64: str) -> list[float]:
    """
    Detect face landmarks in a base64 photo and compute geometric embedding.
    Returns empty list if no face detected.
    """
    try:
        photo_data = photo_base64
        if "," in photo_data:
            photo_data = photo_data.split(",", 1)[1]
        img_bytes = base64.b64decode(photo_data)
        nparr = np.frombuffer(img_bytes, np.uint8)
        frame = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
        if frame is None:
            return []

        detector = _get_registration_detector()
        landmarks = detector.detect(frame)
        if not landmarks:
            return []

        return compute_geometric_embedding(landmarks)
    except Exception as e:
        print(f"[WARN] Could not compute embedding from photo: {e}")
        return []


@router.post("/register-face", response_model=RegisteredUserResponse)
async def register_face(data: FaceRegisterRequest):
    """Register a new user with face embedding computed from their photo."""
    # Save photo if provided
    photo_path = None
    if data.photo_base64:
        try:
            photo_data = data.photo_base64
            if "," in photo_data:
                photo_data = photo_data.split(",", 1)[1]
            img_bytes = base64.b64decode(photo_data)
            filename = f"{data.name.lower().replace(' ', '_')}_{int(datetime.now().timestamp())}.jpg"
            photo_path = os.path.join(PHOTOS_DIR, filename)
            with open(photo_path, "wb") as f:
                f.write(img_bytes)
        except Exception as e:
            print(f"[WARN] Could not save photo: {e}")

    # Compute geometric face embedding from the uploaded photo
    # Falls back to client-sent embedding if photo processing fails
    geo_embedding = []
    if data.photo_base64:
        geo_embedding = _compute_embedding_from_photo(data.photo_base64)

    if not geo_embedding:
        # Fallback: use client-sent embedding (pixel-based)
        geo_embedding = data.face_embedding
        print(f"[WARN] Using client-sent embedding for {data.name} (geometric extraction failed)")
    else:
        print(f"[OK] Computed geometric embedding for {data.name} ({len(geo_embedding)}-dim)")

    user_doc = {
        "name": data.name,
        "age": data.age,
        "face_embedding": geo_embedding,
        "photo_path": photo_path,
        "created_at": datetime.now(timezone.utc),
    }

    result = await registered_users_collection.insert_one(user_doc)
    user_id = str(result.inserted_id)

    return RegisteredUserResponse(
        user_id=user_id,
        name=data.name,
        age=data.age,
        created_at=user_doc["created_at"],
    )


@router.get("/registered-users")
async def list_registered_users():
    """List all registered users (without embeddings)."""
    users = []
    async for doc in registered_users_collection.find({}, {"face_embedding": 0}):
        users.append({
            "user_id": str(doc["_id"]),
            "name": doc["name"],
            "age": doc.get("age", 0),
            "created_at": doc["created_at"].isoformat() if doc.get("created_at") else None,
        })
    return users


@router.get("/registered-users/{user_id}")
async def get_registered_user(user_id: str):
    """Get a single registered user (without embedding)."""
    try:
        doc = await registered_users_collection.find_one(
            {"_id": ObjectId(user_id)}, {"face_embedding": 0}
        )
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid user ID")

    if not doc:
        raise HTTPException(status_code=404, detail="User not found")

    return {
        "user_id": str(doc["_id"]),
        "name": doc["name"],
        "age": doc.get("age", 0),
        "created_at": doc["created_at"].isoformat() if doc.get("created_at") else None,
    }


@router.get("/registered-users-embeddings")
async def list_registered_users_with_embeddings():
    """List all registered users WITH embeddings (for backend face matching)."""
    users = []
    async for doc in registered_users_collection.find({}):
        users.append({
            "user_id": str(doc["_id"]),
            "name": doc["name"],
            "age": doc.get("age", 0),
            "face_embedding": doc.get("face_embedding", []),
            "photo_path": doc.get("photo_path", ""),
        })
    return users


@router.post("/identify-face", response_model=IdentifyFaceResponse)
async def identify_face(data: IdentifyFaceRequest):
    """Identify a face by comparing embedding against stored users."""
    best_match = None
    best_similarity = 0.0

    async for doc in registered_users_collection.find({}):
        stored_embedding = doc.get("face_embedding", [])
        if not stored_embedding:
            continue
        sim = cosine_similarity(data.embedding, stored_embedding)
        if sim > best_similarity:
            best_similarity = sim
            best_match = doc

    if best_match and best_similarity >= SIMILARITY_THRESHOLD:
        return IdentifyFaceResponse(
            matched=True,
            user_id=str(best_match["_id"]),
            name=best_match["name"],
            confidence=round(best_similarity, 4),
        )

    return IdentifyFaceResponse(
        matched=False,
        name="Unknown User",
        confidence=round(best_similarity, 4),
    )


@router.post("/recompute-embeddings")
async def recompute_embeddings():
    """
    Re-compute geometric face embeddings for all registered users from their stored photos.
    Call this after upgrading from pixel-based to geometric embeddings.
    """
    updated = 0
    failed = 0
    async for doc in registered_users_collection.find({}):
        photo_path = doc.get("photo_path")
        if not photo_path or not os.path.exists(photo_path):
            failed += 1
            continue
        try:
            frame = cv2.imread(photo_path)
            if frame is None:
                failed += 1
                continue
            detector = _get_registration_detector()
            landmarks = detector.detect(frame)
            if not landmarks:
                failed += 1
                continue
            embedding = compute_geometric_embedding(landmarks)
            if not embedding:
                failed += 1
                continue
            await registered_users_collection.update_one(
                {"_id": doc["_id"]},
                {"$set": {"face_embedding": embedding}}
            )
            updated += 1
            print(f"[MIGRATE] Re-computed embedding for {doc['name']}")
        except Exception as e:
            print(f"[MIGRATE] Failed for {doc.get('name')}: {e}")
            failed += 1

    return {"updated": updated, "failed": failed}


@router.post("/store-vitals")
async def store_vitals(data: StoreVitalsRequest):
    """Store a vitals snapshot for a recognized user."""
    # Verify user exists
    try:
        user = await registered_users_collection.find_one({"_id": ObjectId(data.user_id)})
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid user ID")

    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    vitals_doc = {
        "user_id": data.user_id,
        "timestamp": datetime.now(timezone.utc),
        "heart_rate": data.heart_rate,
        "respiration_rate": data.respiration_rate,
        "hrv": data.hrv,
        "stress_score": data.stress_score,
        "mood": data.mood,
        "fatigue_risk": data.fatigue_risk,
    }

    await user_vitals_collection.insert_one(vitals_doc)
    return {"status": "stored", "user_id": data.user_id}


@router.get("/analytics/{user_id}")
async def get_analytics(
    user_id: str,
    range: str = Query("daily", pattern="^(daily|weekly|monthly)$"),
):
    """Get historical vitals data for a user."""
    # Compute date range
    now = datetime.now(timezone.utc)
    if range == "daily":
        start = now - timedelta(days=1)
    elif range == "weekly":
        start = now - timedelta(weeks=1)
    else:
        start = now - timedelta(days=30)

    cursor = user_vitals_collection.find(
        {"user_id": user_id, "timestamp": {"$gte": start}},
        {"_id": 0}
    ).sort("timestamp", 1)

    records = []
    async for doc in cursor:
        records.append({
            "timestamp": doc["timestamp"].isoformat(),
            "heart_rate": doc.get("heart_rate", 0),
            "respiration_rate": doc.get("respiration_rate", 0),
            "hrv": doc.get("hrv", 0),
            "stress_score": doc.get("stress_score", 0),
            "mood": doc.get("mood", "Neutral"),
            "fatigue_risk": doc.get("fatigue_risk", 0),
        })

    return {"user_id": user_id, "range": range, "records": records}
