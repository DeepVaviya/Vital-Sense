"""
FastAPI main application entry point.

- REST endpoints for auth + face registration
- WebSocket endpoint for real-time frame processing
- CORS middleware
"""
import json
import asyncio
import traceback
import numpy as np
from contextlib import asynccontextmanager


class NumpySafeEncoder(json.JSONEncoder):
    """JSON encoder that handles numpy types transparently."""
    def default(self, obj):
        if isinstance(obj, (np.integer,)):
            return int(obj)
        if isinstance(obj, (np.floating,)):
            return float(obj)
        if isinstance(obj, (np.bool_,)):
            return bool(obj)
        if isinstance(obj, np.ndarray):
            return obj.tolist()
        return super().default(obj)

from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from database import init_db, registered_users_collection
from auth import router as auth_router
from face_registration import router as face_router
from prediction_engine import router as prediction_router
from camera_processor import CameraProcessor


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Startup / shutdown events."""
    await init_db()
    print("[OK] Database initialized")
    yield
    print("[STOP] Shutting down")


app = FastAPI(
    title="Vital Monitor API",
    description="Real-time contactless physiological monitoring",
    version="2.0.0",
    lifespan=lifespan,
)

# CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Auth routes (legacy)
app.include_router(auth_router)
# Face registration + vitals storage routes
app.include_router(face_router)
# Prediction engine routes
app.include_router(prediction_router)


@app.get("/api/health")
async def health():
    return {"status": "ok", "service": "vital-monitor", "version": "2.0.0"}


# @app.post("/api/ai-suggestions")
# async def ai_suggestions(vitals: dict):
#     """Use Groq AI (Llama 3) to analyze vital signs and provide health suggestions."""
#     try:
#         import httpx
#         import json as json_mod

#         GROQ_API_KEY = "YOUR_GROQ_API_KEY"
#         GROQ_URL = "https://api.groq.com/openai/v1/chat/completions"

#         hr = vitals.get("heart_rate", 0)
#         rr = vitals.get("respiration_rate", 0)
#         hrv = vitals.get("hrv_rmssd", 0)
#         stress = vitals.get("stress_score", 0)
#         fatigue = vitals.get("fatigue_risk", 0)
#         mood_val = vitals.get("mood", "Unknown")
#         cognitive = vitals.get("cognitive_load", "Unknown")
#         blink_rate = vitals.get("blink_rate", 0)
#         gaze_stability = vitals.get("gaze_stability", 0)
#         perclos = vitals.get("perclos", 0)

#         prompt = f"""You are a caring health advisor AI integrated into a real-time vital signs monitoring system.
# Analyze these vital sign readings and provide HELPFUL, BENEFICIAL, and ACTIONABLE health suggestions.

# Current Vital Signs:
# - Heart Rate: {hr} BPM (normal range: 60-100 BPM)
# - Respiration Rate: {rr} BPM (normal range: 12-20 BPM)
# - HRV RMSSD: {hrv} ms (higher is better, normal: 20-80 ms)
# - Stress Score: {stress}/100 (lower is better, <30 = relaxed)
# - Fatigue Risk: {fatigue}/100 (lower is better, <30 = alert)
# - Mood: {mood_val}
# - Cognitive Load: {cognitive}
# - Blink Rate: {blink_rate}/min (normal: 15-20/min)
# - Gaze Stability: {gaze_stability}% (higher is better)
# - PERCLOS (drowsiness): {perclos}% (normal: <20%)

# Return ONLY valid JSON (no markdown, no code fences, no extra text):
# {{
#   "overall_status": "healthy" or "caution" or "alert",
#   "overall_summary": "A warm, encouraging 1-sentence assessment of their health",
#   "suggestions": [
#     {{
#       "metric": "name of the metric",
#       "status": "normal" or "low" or "high" or "critical",
#       "value": "current value with unit",
#       "suggestion": "specific, helpful, actionable advice that benefits the user",
#       "icon": "heart" or "wind" or "brain" or "eye" or "zap" or "shield"
#     }}
#   ]
# }}

# Important rules:
# - Be warm, encouraging, and helpful. Not clinical or scary.
# - Only include metrics that need attention (abnormal values).
# - If ALL metrics are normal, return 1 positive encouraging suggestion.
# - For abnormal breathing: suggest the 4-7-8 breathing technique (inhale 4s, hold 7s, exhale 8s) or box breathing (4-4-4-4).
# - For high stress: suggest deep breathing, taking a short walk, or progressive muscle relaxation.
# - For high fatigue: suggest a 5-minute break, drinking water, stretching, or stepping outside.
# - For elevated heart rate: suggest sitting comfortably, slow deep breaths, drinking cool water.
# - For low HRV: suggest consistent sleep schedule, reducing caffeine, mindfulness meditation.
# - For eye strain (low blink rate or gaze stability): suggest the 20-20-20 rule (every 20 min, look at something 20 feet away for 20 seconds).
# - For drowsiness (high PERCLOS): suggest standing up, splashing cold water on face, or a brief walk.
# - Maximum 5 suggestions, keep them SHORT, SPECIFIC, and BENEFICIAL.
# - Each suggestion should include a clear action the user can do RIGHT NOW."""

#         async with httpx.AsyncClient(timeout=30.0) as client:
#             resp = await client.post(
#                 GROQ_URL,
#                 headers={
#                     "Authorization": f"Bearer {GROQ_API_KEY}",
#                     "Content-Type": "application/json",
#                 },
#                 json={
#                     "model": "llama-3.3-70b-versatile",
#                     "messages": [
#                         {"role": "system", "content": "You are a health advisor AI. Always respond with valid JSON only."},
#                         {"role": "user", "content": prompt},
#                     ],
#                     "temperature": 0.3,
#                     "max_tokens": 800,
#                 },
#             )
#             resp.raise_for_status()
#             data = resp.json()

#         text = data["choices"][0]["message"]["content"].strip()
#         # Clean markdown code fences if present
#         if text.startswith("```"):
#             text = text.split("\n", 1)[1] if "\n" in text else text[3:]
#         if text.endswith("```"):
#             text = text[:-3]
#         text = text.strip()

#         result = json_mod.loads(text)
#         print(f"[AI Suggestions] OK Groq returned {len(result.get('suggestions', []))} suggestions")
#         return result

#     except Exception as e:
#         print(f"[AI Suggestions] Error: {e}")
#         traceback.print_exc()
#         return {
#             "overall_status": "unknown",
#             "overall_summary": "AI analysis temporarily unavailable",
#             "suggestions": [{
#                 "metric": "System",
#                 "status": "normal",
#                 "value": "",
#                 "suggestion": f"Could not generate AI suggestions: {str(e)[:80]}",
#                 "icon": "brain",
#             }]
#         }


@app.websocket("/ws/monitor")
async def monitor_websocket(websocket: WebSocket):
    """
    WebSocket endpoint for real-time frame processing.

    Client sends base64-encoded JPEG frames.
    Server responds with JSON vitals data.
    """
    await websocket.accept()

    # Load registered users for face identification
    reg_users = []
    try:
        async for doc in registered_users_collection.find({}):
            reg_users.append({
                "user_id": str(doc["_id"]),
                "name": doc["name"],
                "face_embedding": doc.get("face_embedding", []),
                "photo_path": doc.get("photo_path", ""),
            })
    except Exception:
        pass

    processor = CameraProcessor(fps=10.0, registered_users=reg_users)
    print(f"[WS] WebSocket client connected ({len(reg_users)} registered users loaded)")

    try:
        while True:
            # Receive frame data from client
            data = await websocket.receive_text()

            # Process frame through the full CV pipeline
            # Run in executor to avoid blocking the event loop
            try:
                loop = asyncio.get_running_loop()
                result = await loop.run_in_executor(None, processor.process_frame, data)
                await websocket.send_text(json.dumps(result, cls=NumpySafeEncoder))
            except WebSocketDisconnect:
                raise  # Re-raise to outer handler
            except Exception as e:
                # Single frame error — log and continue, don't crash the connection
                print(f"[WS] Frame processing error (skipping): {e}")
                traceback.print_exc()

    except WebSocketDisconnect:
        print("[WS] WebSocket client disconnected")
    except Exception as e:
        print(f"[WS ERROR] {e}")
        traceback.print_exc()
    finally:
        processor.cleanup()
        print("[WS] Processor cleaned up")


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
