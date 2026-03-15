"""
Gemini AI Service — face verification and health analysis using Google Gemini Vision.

Uses Gemini 2.0 Flash for:
  1. Face verification: Compare live face crop vs registered photo to confirm identity
  2. Health observation: Analyze visible health indicators from camera frame
  3. Vital signs validation: Cross-check rPPG-derived metrics

Thread-safe with async support for WebSocket integration.
"""
import os
import io
import base64
import time
import asyncio
from concurrent.futures import ThreadPoolExecutor
from typing import Optional

import cv2
import numpy as np

import google.generativeai as genai
from google.generativeai.types import HarmCategory, HarmBlockThreshold

# Gemini API configuration
GEMINI_API_KEY = os.environ.get("GEMINI_API_KEY", "AIzaSyBlD9_tYNI9JP8MidfBXH3ALZz4zSX3M5c")

# Configure the Gemini client
genai.configure(api_key=GEMINI_API_KEY)

# Use Gemini 2.0 Flash for fast multimodal processing
MODEL_NAME = "gemini-2.0-flash"

# Safety settings - allow all content for medical analysis
SAFETY_SETTINGS = {
    HarmCategory.HARM_CATEGORY_HARASSMENT: HarmBlockThreshold.BLOCK_NONE,
    HarmCategory.HARM_CATEGORY_HATE_SPEECH: HarmBlockThreshold.BLOCK_NONE,
    HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT: HarmBlockThreshold.BLOCK_NONE,
    HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT: HarmBlockThreshold.BLOCK_NONE,
}

# Rate limiting
_last_call_time = 0
MIN_CALL_INTERVAL = 1.0  # Minimum seconds between API calls

# Thread pool for blocking Gemini calls
_executor = ThreadPoolExecutor(max_workers=2)


def _frame_to_pil_image(frame: np.ndarray):
    """Convert OpenCV BGR frame to PIL Image for Gemini."""
    from PIL import Image
    rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
    return Image.fromarray(rgb)


def _crop_face(frame: np.ndarray, bbox: dict, padding: float = 0.2) -> np.ndarray:
    """Crop face region from frame with padding."""
    h, w = frame.shape[:2]
    x = int(bbox["x"])
    y = int(bbox["y"])
    bw = int(bbox["width"])
    bh = int(bbox["height"])

    # Add padding
    pad_x = int(bw * padding)
    pad_y = int(bh * padding)

    x1 = max(0, x - pad_x)
    y1 = max(0, y - pad_y)
    x2 = min(w, x + bw + pad_x)
    y2 = min(h, y + bh + pad_y)

    return frame[y1:y2, x1:x2]


class GeminiVerifier:
    """Uses Gemini Vision for accurate face verification and health analysis."""

    def __init__(self):
        self.model = genai.GenerativeModel(MODEL_NAME)
        self._verification_cache = {}  # face_id -> (result, timestamp)
        self._cache_ttl = 5.0  # Cache results for 5 seconds
        self._health_cache = {}  # timestamp -> result
        print(f"[Gemini] Initialized with model: {MODEL_NAME}")

    def verify_face_sync(self, live_face_crop: np.ndarray,
                         registered_photo_path: str,
                         registered_name: str) -> dict:
        """
        Compare live face crop against registered photo using Gemini Vision.

        Returns:
            dict with:
            - is_same_person: bool
            - confidence: str ("high", "medium", "low")
            - reasoning: str
        """
        global _last_call_time

        # Rate limiting
        now = time.time()
        elapsed = now - _last_call_time
        if elapsed < MIN_CALL_INTERVAL:
            time.sleep(MIN_CALL_INTERVAL - elapsed)

        try:
            # Load registered photo
            if not registered_photo_path or not os.path.exists(registered_photo_path):
                return {"is_same_person": False, "confidence": "low",
                        "reasoning": "No registered photo available"}

            registered_img = cv2.imread(registered_photo_path)
            if registered_img is None:
                return {"is_same_person": False, "confidence": "low",
                        "reasoning": "Could not load registered photo"}

            # Convert to PIL Images
            live_pil = _frame_to_pil_image(live_face_crop)
            reg_pil = _frame_to_pil_image(registered_img)

            # Ask Gemini to compare the two faces
            prompt = f"""You are a precise face verification system. Compare these two face images.

Image 1: Live camera capture of a person
Image 2: Registered photo of "{registered_name}"

Task: Determine if Image 1 and Image 2 show the SAME person.

Analyze carefully:
- Facial structure (bone structure, face shape)
- Eye shape and spacing
- Nose shape and size
- Mouth and lip shape
- Jawline and chin shape
- Overall facial proportions

Respond in EXACTLY this format (nothing else):
MATCH: YES or NO
CONFIDENCE: HIGH, MEDIUM, or LOW
REASON: Brief one-line explanation"""

            response = self.model.generate_content(
                [prompt, live_pil, reg_pil],
                safety_settings=SAFETY_SETTINGS,
                generation_config=genai.GenerationConfig(
                    temperature=0.1,
                    max_output_tokens=100,
                ),
            )

            _last_call_time = time.time()

            # Parse response
            text = response.text.strip()
            lines = text.split('\n')

            is_match = False
            confidence = "low"
            reason = "Could not parse response"

            for line in lines:
                line_upper = line.strip().upper()
                if line_upper.startswith('MATCH:'):
                    is_match = 'YES' in line_upper
                elif line_upper.startswith('CONFIDENCE:'):
                    if 'HIGH' in line_upper:
                        confidence = 'high'
                    elif 'MEDIUM' in line_upper:
                        confidence = 'medium'
                    else:
                        confidence = 'low'
                elif line_upper.startswith('REASON:'):
                    reason = line.split(':', 1)[1].strip() if ':' in line else line.strip()

            return {
                "is_same_person": is_match,
                "confidence": confidence,
                "reasoning": reason,
            }

        except Exception as e:
            print(f"[Gemini] Face verification error: {e}")
            return {"is_same_person": False, "confidence": "low",
                    "reasoning": f"API error: {str(e)[:50]}"}

    async def verify_face_async(self, live_face_crop: np.ndarray,
                                registered_photo_path: str,
                                registered_name: str,
                                face_id: int = 0) -> dict:
        """Async wrapper for face verification with caching."""
        # Check cache
        if face_id in self._verification_cache:
            cached_result, cached_time = self._verification_cache[face_id]
            if time.time() - cached_time < self._cache_ttl:
                return cached_result

        # Run in thread pool to avoid blocking
        loop = asyncio.get_event_loop()
        result = await loop.run_in_executor(
            _executor,
            self.verify_face_sync,
            live_face_crop,
            registered_photo_path,
            registered_name,
        )

        # Cache result
        self._verification_cache[face_id] = (result, time.time())
        return result

    def analyze_health_sync(self, frame: np.ndarray,
                            current_vitals: dict = None) -> dict:
        """
        Analyze visible health indicators from camera frame using Gemini.

        Returns dict with observable health observations and adjustments.
        """
        global _last_call_time

        now = time.time()
        elapsed = now - _last_call_time
        if elapsed < MIN_CALL_INTERVAL:
            time.sleep(MIN_CALL_INTERVAL - elapsed)

        try:
            pil_image = _frame_to_pil_image(frame)

            vitals_context = ""
            if current_vitals:
                vitals_context = f"""
Current sensor readings (from rPPG analysis):
- Heart Rate: {current_vitals.get('heart_rate', 0):.0f} BPM
- Respiration Rate: {current_vitals.get('respiration_rate', 0):.1f} BPM
- Stress Score: {current_vitals.get('stress_score', 0):.0f}/100
- Fatigue Risk: {current_vitals.get('fatigue_risk', 0):.0f}/100
"""

            prompt = f"""You are a health monitoring AI analyzing a live camera feed of a person.
{vitals_context}
Analyze the person's visible health indicators from this image. Look for:

1. SKIN_COLOR: Overall complexion (pale, normal, flushed, etc.)
2. EYE_STATE: Eyes appear (alert, tired, droopy, strained)
3. FACIAL_EXPRESSION: Overall expression (relaxed, tense, neutral, stressed)
4. BREATHING_PATTERN: Any visible breathing indicators (calm, rapid, shallow)
5. OVERALL_STATE: General appearance (healthy, fatigued, stressed, calm)

Also assess if the current sensor readings seem reasonable given what you observe.

Respond in EXACTLY this format:
SKIN: [one word]
EYES: [one word]
EXPRESSION: [one word]
BREATHING: [one word]
STATE: [one word]
HR_REASONABLE: YES or NO
RESP_REASONABLE: YES or NO
NOTES: [brief one-line observation]"""

            response = self.model.generate_content(
                [prompt, pil_image],
                safety_settings=SAFETY_SETTINGS,
                generation_config=genai.GenerationConfig(
                    temperature=0.2,
                    max_output_tokens=150,
                ),
            )

            _last_call_time = time.time()

            text = response.text.strip()
            result = {
                "skin": "normal",
                "eyes": "alert",
                "expression": "neutral",
                "breathing": "normal",
                "state": "healthy",
                "hr_reasonable": True,
                "resp_reasonable": True,
                "notes": "",
            }

            for line in text.split('\n'):
                line = line.strip()
                if ':' not in line:
                    continue
                key, val = line.split(':', 1)
                key = key.strip().upper()
                val = val.strip()

                if key == 'SKIN':
                    result['skin'] = val.lower()
                elif key == 'EYES':
                    result['eyes'] = val.lower()
                elif key == 'EXPRESSION':
                    result['expression'] = val.lower()
                elif key == 'BREATHING':
                    result['breathing'] = val.lower()
                elif key == 'STATE':
                    result['state'] = val.lower()
                elif key == 'HR_REASONABLE':
                    result['hr_reasonable'] = 'YES' in val.upper()
                elif key == 'RESP_REASONABLE':
                    result['resp_reasonable'] = 'YES' in val.upper()
                elif key == 'NOTES':
                    result['notes'] = val

            return result

        except Exception as e:
            print(f"[Gemini] Health analysis error: {e}")
            return {
                "skin": "unknown", "eyes": "unknown", "expression": "unknown",
                "breathing": "unknown", "state": "unknown",
                "hr_reasonable": True, "resp_reasonable": True,
                "notes": f"Analysis unavailable: {str(e)[:30]}",
            }

    async def analyze_health_async(self, frame: np.ndarray,
                                   current_vitals: dict = None) -> dict:
        """Async wrapper for health analysis."""
        loop = asyncio.get_event_loop()
        return await loop.run_in_executor(
            _executor,
            self.analyze_health_sync,
            frame,
            current_vitals,
        )

    def clear_cache(self):
        """Clear all caches."""
        self._verification_cache.clear()
        self._health_cache.clear()


# Singleton instance
_gemini_verifier: Optional[GeminiVerifier] = None


def get_gemini_verifier() -> GeminiVerifier:
    """Get or create the singleton GeminiVerifier instance."""
    global _gemini_verifier
    if _gemini_verifier is None:
        _gemini_verifier = GeminiVerifier()
    return _gemini_verifier
