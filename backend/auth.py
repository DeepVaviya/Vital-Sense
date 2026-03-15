"""JWT authentication: register, login, token verification."""
import os
from datetime import datetime, timedelta, timezone
from typing import Optional

from fastapi import APIRouter, HTTPException, Depends, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from jose import JWTError, jwt
import bcrypt as _bcrypt
from bson import ObjectId

from database import users_collection
from models import UserRegister, UserLogin, TokenResponse, UserResponse

router = APIRouter(prefix="/api", tags=["auth"])

SECRET_KEY = os.getenv("JWT_SECRET", "vitals-monitor-secret-key-change-in-production")
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_HOURS = 24

security = HTTPBearer()


def hash_password(password: str) -> str:
    return _bcrypt.hashpw(password.encode("utf-8"), _bcrypt.gensalt()).decode("utf-8")


def verify_password(plain: str, hashed: str) -> bool:
    return _bcrypt.checkpw(plain.encode("utf-8"), hashed.encode("utf-8"))


def create_access_token(data: dict, expires_delta: Optional[timedelta] = None) -> str:
    to_encode = data.copy()
    expire = datetime.now(timezone.utc) + (expires_delta or timedelta(hours=ACCESS_TOKEN_EXPIRE_HOURS))
    to_encode.update({"exp": expire})
    return jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)


async def get_current_user(credentials: HTTPAuthorizationCredentials = Depends(security)):
    """Dependency to extract and verify JWT token."""
    token = credentials.credentials
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        user_id: str = payload.get("sub")
        if user_id is None:
            raise HTTPException(status_code=401, detail="Invalid token")
    except JWTError:
        raise HTTPException(status_code=401, detail="Invalid token")

    user = await users_collection.find_one({"_id": ObjectId(user_id)})
    if user is None:
        raise HTTPException(status_code=401, detail="User not found")
    return user


@router.post("/register", response_model=TokenResponse)
async def register(data: UserRegister):
    existing = await users_collection.find_one({"email": data.email})
    if existing:
        raise HTTPException(status_code=400, detail="Email already registered")

    user_doc = {
        "name": data.name,
        "email": data.email,
        "password_hash": hash_password(data.password),
        "created_at": datetime.now(timezone.utc),
    }
    result = await users_collection.insert_one(user_doc)
    user_id = str(result.inserted_id)

    token = create_access_token({"sub": user_id})
    return TokenResponse(
        access_token=token,
        user=UserResponse(
            user_id=user_id,
            name=data.name,
            email=data.email,
            created_at=user_doc["created_at"],
        ),
    )


@router.post("/login", response_model=TokenResponse)
async def login(data: UserLogin):
    user = await users_collection.find_one({"email": data.email})
    if not user or not verify_password(data.password, user["password_hash"]):
        raise HTTPException(status_code=401, detail="Invalid email or password")

    user_id = str(user["_id"])
    token = create_access_token({"sub": user_id})
    return TokenResponse(
        access_token=token,
        user=UserResponse(
            user_id=user_id,
            name=user["name"],
            email=user["email"],
            created_at=user["created_at"],
        ),
    )


@router.get("/me", response_model=UserResponse)
async def me(user=Depends(get_current_user)):
    return UserResponse(
        user_id=str(user["_id"]),
        name=user["name"],
        email=user["email"],
        created_at=user["created_at"],
    )
