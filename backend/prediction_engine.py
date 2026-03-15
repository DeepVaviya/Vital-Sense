"""AI Prediction Engine — stress trends, fatigue risk, anomaly detection."""
import numpy as np
from datetime import datetime, timezone, timedelta

from fastapi import APIRouter, HTTPException
from bson import ObjectId

from database import registered_users_collection, user_vitals_collection
from models import PredictionResponse

router = APIRouter(prefix="/api", tags=["predictions"])


def predict_stress_trend(stress_scores: list[float]) -> tuple[str, str]:
    """
    Predict stress trend using linear regression slope.

    Returns:
        (message, direction) where direction is 'increasing', 'decreasing', or 'stable'
    """
    if len(stress_scores) < 3:
        return "Not enough data for stress prediction.", "stable"

    x = np.arange(len(stress_scores), dtype=np.float64)
    y = np.array(stress_scores, dtype=np.float64)

    # Simple linear regression
    n = len(x)
    slope = (n * np.sum(x * y) - np.sum(x) * np.sum(y)) / \
            (n * np.sum(x ** 2) - np.sum(x) ** 2 + 1e-10)

    current_avg = np.mean(stress_scores[-5:]) if len(stress_scores) >= 5 else np.mean(stress_scores)

    if slope > 1.5:
        return f"Stress likely to increase in the next hour. Current avg: {current_avg:.0f}/100.", "increasing"
    elif slope < -1.5:
        return f"Stress is decreasing. Current avg: {current_avg:.0f}/100. Keep it up!", "decreasing"
    else:
        return f"Stress levels are stable. Current avg: {current_avg:.0f}/100.", "stable"


def predict_fatigue(hr_values: list[float], hrv_values: list[float],
                    fatigue_scores: list[float]) -> tuple[str, str]:
    """
    Predict fatigue risk from HRV depression and HR drift.

    Returns:
        (message, level) where level is 'low', 'moderate', or 'high'
    """
    if len(fatigue_scores) < 3:
        return "Not enough data for fatigue prediction.", "low"

    avg_fatigue = np.mean(fatigue_scores[-10:]) if len(fatigue_scores) >= 10 else np.mean(fatigue_scores)
    avg_hrv = np.mean(hrv_values[-10:]) if len(hrv_values) >= 10 else np.mean(hrv_values) if hrv_values else 50

    if avg_fatigue > 65 or avg_hrv < 20:
        return f"High fatigue risk detected. Consider taking a break. Fatigue score: {avg_fatigue:.0f}/100.", "high"
    elif avg_fatigue > 40 or avg_hrv < 35:
        return f"Moderate fatigue building up. Fatigue score: {avg_fatigue:.0f}/100.", "moderate"
    else:
        return f"Fatigue levels are low. Fatigue score: {avg_fatigue:.0f}/100.", "low"


def detect_anomalies(hr_values: list[float], hrv_values: list[float]) -> list[str]:
    """
    Detect anomalies using Z-score method.

    Returns:
        List of anomaly alert messages.
    """
    alerts = []

    if len(hr_values) >= 5:
        hr_arr = np.array(hr_values, dtype=np.float64)
        mean_hr = np.mean(hr_arr)
        std_hr = np.std(hr_arr)
        if std_hr > 0:
            latest_z = abs(hr_arr[-1] - mean_hr) / std_hr
            if latest_z > 2.5:
                alerts.append(
                    f"Heart rate anomaly: {hr_arr[-1]:.0f} BPM is unusual "
                    f"(avg: {mean_hr:.0f} BPM, z-score: {latest_z:.1f})"
                )

        # Sudden spike detection
        if len(hr_arr) >= 3:
            delta = hr_arr[-1] - hr_arr[-3]
            if abs(delta) > 20:
                direction = "spike" if delta > 0 else "drop"
                alerts.append(f"Sudden heart rate {direction}: {delta:+.0f} BPM in last 3 readings")

    if len(hrv_values) >= 5:
        hrv_arr = np.array(hrv_values, dtype=np.float64)
        mean_hrv = np.mean(hrv_arr)
        if mean_hrv > 0:
            latest_ratio = hrv_arr[-1] / mean_hrv
            if latest_ratio < 0.4:
                alerts.append(
                    f"HRV critically low: {hrv_arr[-1]:.1f} ms "
                    f"(avg: {mean_hrv:.1f} ms). Possible high stress or fatigue."
                )

    return alerts


@router.get("/predictions/{user_id}", response_model=PredictionResponse)
async def get_predictions(user_id: str):
    """Get AI predictions for a user based on their vitals history."""
    # Verify user exists
    try:
        user = await registered_users_collection.find_one({"_id": ObjectId(user_id)})
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid user ID")

    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    # Fetch last 24 hours of vitals
    since = datetime.now(timezone.utc) - timedelta(hours=24)
    cursor = user_vitals_collection.find(
        {"user_id": user_id, "timestamp": {"$gte": since}},
    ).sort("timestamp", 1)

    hr_values = []
    hrv_values = []
    stress_scores = []
    fatigue_scores = []

    async for doc in cursor:
        if doc.get("heart_rate", 0) > 0:
            hr_values.append(doc["heart_rate"])
        if doc.get("hrv", 0) > 0:
            hrv_values.append(doc["hrv"])
        if doc.get("stress_score", 0) > 0:
            stress_scores.append(doc["stress_score"])
        if doc.get("fatigue_risk", 0) > 0:
            fatigue_scores.append(doc["fatigue_risk"])

    # Run predictions
    stress_msg, stress_dir = predict_stress_trend(stress_scores)
    fatigue_msg, fatigue_level = predict_fatigue(hr_values, hrv_values, fatigue_scores)
    anomalies = detect_anomalies(hr_values, hrv_values)

    return PredictionResponse(
        stress_trend=stress_msg,
        stress_direction=stress_dir,
        fatigue_risk_prediction=fatigue_msg,
        fatigue_level=fatigue_level,
        anomaly_alerts=anomalies,
        anomaly_count=len(anomalies),
    )
