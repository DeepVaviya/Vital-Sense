"""MongoDB async database connection using Motor."""
import os
from motor.motor_asyncio import AsyncIOMotorClient

MONGO_URL = os.getenv(
    "MONGO_URL",
    "mongodb+srv://abhipatil:Abhi%4012345@cluster0.wsqqrss.mongodb.net/"
)
DB_NAME = os.getenv("DB_NAME", "vital_monitor")

client = AsyncIOMotorClient(MONGO_URL, serverSelectionTimeoutMS=5000)
db = client[DB_NAME]

# Collections
users_collection = db["users"]
sessions_collection = db["sessions"]
vitals_collection = db["vitals_history"]
registered_users_collection = db["registered_users"]
user_vitals_collection = db["user_vitals"]


async def init_db():
    """Create indexes on startup. Non-fatal if MongoDB is unreachable."""
    try:
        await users_collection.create_index("email", unique=True)
        await sessions_collection.create_index("user_id")
        await vitals_collection.create_index([("session_id", 1), ("timestamp", 1)])
        # Face-registered users
        await registered_users_collection.create_index("name")
        # Per-user vitals history
        await user_vitals_collection.create_index([("user_id", 1), ("timestamp", -1)])
        await user_vitals_collection.create_index("timestamp")
        print("[OK] MongoDB connected and indexes created")
    except Exception as e:
        print(f"[WARN] MongoDB not available: {e}")
        print("       Auth features will fail until MongoDB is running.")
