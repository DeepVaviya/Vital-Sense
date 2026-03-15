"""
Derived metrics engine: Stress Score, Cognitive Load, Fatigue Risk, Mood.

All metrics computed from real physiological signals (HR, HRV time-domain,
HRV frequency-domain, respiration) PLUS eye-based metrics (blink rate,
gaze stability, PERCLOS, saccade rate) with per-face EMA smoothing.

Key features:
  - LF/HF ratio as primary stress indicator (autonomic balance)
  - pNN50 for fatigue and parasympathetic tone
  - Arousal/valence model for mood classification
  - Eye metrics (blink rate, PERCLOS, gaze stability, saccade rate) for
    fatigue, cognitive load, and attentional state
  - Per-face EMA smoothing (no global state corruption with multiple faces)
"""
import numpy as np


def _ema_smooth(ema_state: dict, key: str, raw_value: float, alpha: float = 0.25) -> float:
    """Apply exponential moving average smoothing using provided per-face state."""
    prev = ema_state.get(key)
    if prev is not None and prev > 0:
        smoothed = alpha * raw_value + (1 - alpha) * prev
    else:
        smoothed = raw_value
    ema_state[key] = smoothed
    return smoothed


def compute_stress_score(heart_rate: float, hrv_rmssd: float,
                         respiration_rate: float,
                         lf_hf_ratio: float = 0.0,
                         pnn50: float = -1.0,
                         blink_rate: float = -1.0,
                         saccade_rate: float = -1.0,
                         gaze_stability: float = -1.0,
                         ema_state: dict = None) -> float:
    """
    Compute stress score (0-100) from physiological + eye signals.

    Uses multi-factor model:
    - LF/HF ratio (primary): high ratio = sympathetic dominance = stress
    - RMSSD (secondary): low HRV = high stress
    - Heart rate elevation
    - Rapid/irregular respiration
    - pNN50 depression (low pNN50 = low parasympathetic = stress)
    - Blink rate: abnormally high blink rate correlates with stress
    - Saccade rate: high saccade rate = restlessness/anxiety = stress
    - Gaze stability: low stability = agitation

    Output is EMA-smoothed per face.
    """
    if heart_rate == 0 and hrv_rmssd == 0:
        return 0.0

    score = 35.0  # Start from lower baseline

    # ── LF/HF ratio (primary stress indicator, 25-point range) ──
    if lf_hf_ratio > 0:
        if lf_hf_ratio > 4.0:
            score += 25  # Very high sympathetic dominance
        elif lf_hf_ratio > 2.5:
            score += 18
        elif lf_hf_ratio > 1.5:
            score += 10
        elif lf_hf_ratio > 1.0:
            score += 5
        elif lf_hf_ratio < 0.5:
            score -= 10  # Strong parasympathetic = relaxed

    # ── RMSSD (secondary indicator, 20-point range) ──
    if hrv_rmssd > 0:
        if hrv_rmssd < 15:
            score += 20  # Very low HRV = definite stress
        elif hrv_rmssd < 25:
            score += 12
        elif hrv_rmssd < 40:
            score += 5
        elif hrv_rmssd > 80:
            score -= 15
        elif hrv_rmssd > 60:
            score -= 10

    # ── Heart rate component (15-point range) ──
    if heart_rate > 0:
        if heart_rate > 100:
            score += min((heart_rate - 100) * 0.6, 15)
        elif heart_rate > 85:
            score += (heart_rate - 85) * 0.5
        elif heart_rate < 60:
            score -= (60 - heart_rate) * 0.3

    # ── Respiration component (10-point range) ──
    if respiration_rate > 0:
        if respiration_rate > 22:
            score += min((respiration_rate - 22) * 1.5, 10)
        elif respiration_rate < 12:
            score -= 5  # Calm breathing

    # ── pNN50 component (10-point range) ──
    if pnn50 >= 0:
        if pnn50 < 3:
            score += 10  # Very low parasympathetic
        elif pnn50 < 10:
            score += 5
        elif pnn50 > 30:
            score -= 5  # Healthy parasympathetic tone

    # ── Eye-based stress indicators (15-point range) ──
    # High blink rate: >25 blinks/min correlates with stress (normal: 15-20)
    if blink_rate >= 0:
        if blink_rate > 30:
            score += 8
        elif blink_rate > 25:
            score += 4
        elif blink_rate < 8:
            score -= 3  # Very calm, relaxed blinking

    # High saccade rate = restlessness
    if saccade_rate >= 0:
        if saccade_rate > 60:
            score += 5
        elif saccade_rate > 40:
            score += 3

    # Low gaze stability = agitation
    if gaze_stability >= 0:
        if gaze_stability < 0.3:
            score += 4
        elif gaze_stability < 0.5:
            score += 2
        elif gaze_stability > 0.85:
            score -= 2

    raw = float(np.clip(score, 0, 100))
    if ema_state is not None:
        return round(_ema_smooth(ema_state, "stress", raw), 1)
    return round(raw, 1)


def compute_cognitive_load(heart_rate: float, hrv_rmssd: float,
                           respiration_rate: float,
                           hr_history: list = None,
                           lf_hf_ratio: float = 0.0,
                           blink_rate: float = -1.0,
                           gaze_stability: float = -1.0,
                           saccade_rate: float = -1.0,
                           pupil_size: float = -1.0) -> str:
    """
    Estimate cognitive load from physiological + eye patterns.

    Uses LF/HF ratio trend for cognitive engagement detection plus
    eye metrics for attention tracking:
    - Reduced blink rate = sustained attention (high cognitive load)
    - Lower gaze stability with high saccade = information seeking
    - Larger relative pupil size = cognitive effort

    Returns: "Low", "Medium", or "High"
    """
    if heart_rate == 0 and hrv_rmssd == 0:
        return "Low"

    load_score = 0

    # LF/HF ratio: sustained moderate elevation = mental engagement
    if lf_hf_ratio > 0:
        if lf_hf_ratio > 3.0:
            load_score += 3
        elif lf_hf_ratio > 1.5:
            load_score += 2
        elif lf_hf_ratio > 0.8:
            load_score += 1

    # HRV component
    if hrv_rmssd > 0:
        if hrv_rmssd < 25:
            load_score += 3
        elif hrv_rmssd < 50:
            load_score += 1
        else:
            load_score -= 1

    # Heart rate component
    if heart_rate > 90:
        load_score += 2
    elif heart_rate > 75:
        load_score += 1

    # Heart rate trend (increasing = engaging)
    if hr_history and len(hr_history) >= 5:
        recent = hr_history[-5:]
        slope = (recent[-1] - recent[0]) / len(recent)
        if slope > 1.0:
            load_score += 2
        elif slope > 0.5:
            load_score += 1

    # Respiration component
    if respiration_rate > 22:
        load_score += 2
    elif respiration_rate > 18:
        load_score += 1

    # ── Eye-based cognitive load indicators ──
    # Reduced blink rate during sustained attention (cognitive suppression of blinking)
    # Normal: 15-20 blinks/min. Under cognitive load: <12 blinks/min
    if blink_rate >= 0:
        if blink_rate < 8:
            load_score += 3  # Very focused attention
        elif blink_rate < 12:
            load_score += 2
        elif blink_rate > 25:
            load_score -= 1  # High blinking = less focused

    # Gaze stability: high stability = focused attention = higher cognitive load
    if gaze_stability >= 0:
        if gaze_stability > 0.85:
            load_score += 2  # Fixed gaze = concentrated
        elif gaze_stability > 0.7:
            load_score += 1
        elif gaze_stability < 0.3:
            load_score -= 1  # Wandering gaze = disengaged

    # Pupil dilation: larger pupils indicate cognitive effort
    if pupil_size > 0:
        if pupil_size > 0.35:
            load_score += 2
        elif pupil_size > 0.28:
            load_score += 1

    if load_score >= 6:
        return "High"
    elif load_score >= 3:
        return "Medium"
    else:
        return "Low"


def compute_fatigue_risk(heart_rate: float, hrv_rmssd: float, hrv_sdnn: float,
                         respiration_rate: float,
                         hr_history: list = None,
                         pnn50: float = -1.0,
                         lf_hf_ratio: float = 0.0,
                         blink_rate: float = -1.0,
                         perclos: float = -1.0,
                         ear_avg: float = -1.0,
                         gaze_stability: float = -1.0,
                         ema_state: dict = None) -> float:
    """
    Estimate fatigue risk (0-100).

    Uses HRV frequency-domain shift, pNN50 depression, HR drift,
    PLUS eye-based fatigue indicators:
    - PERCLOS > 20% = significant drowsiness (FHWA standard)
    - Low EAR average = droopy eyelids
    - High blink rate + long blink duration = fatigue
    - Low gaze stability = reduced alertness

    EMA-smoothed output per face.
    """
    if heart_rate == 0 and hrv_rmssd == 0:
        return 0.0

    risk = 25.0  # Baseline

    # ── RMSSD: low HRV → fatigue (20-point range) ──
    if hrv_rmssd > 0:
        if hrv_rmssd < 15:
            risk += 20
        elif hrv_rmssd < 25:
            risk += 12
        elif hrv_rmssd < 35:
            risk += 5
        elif hrv_rmssd > 70:
            risk -= 10

    # ── SDNN (10-point range) ──
    if hrv_sdnn > 0:
        if hrv_sdnn < 20:
            risk += 10
        elif hrv_sdnn < 30:
            risk += 5
        elif hrv_sdnn > 60:
            risk -= 5

    # ── pNN50: very low = autonomic depression → fatigue (10-point range) ──
    if pnn50 >= 0:
        if pnn50 < 3:
            risk += 10
        elif pnn50 < 10:
            risk += 5
        elif pnn50 > 25:
            risk -= 5

    # ── LF/HF: extreme values indicate fatigue (10-point range) ──
    if lf_hf_ratio > 0:
        if lf_hf_ratio > 5.0:
            risk += 10  # Extreme sympathetic = burnout fatigue
        elif lf_hf_ratio < 0.3:
            risk += 8  # Extreme parasympathetic = drowsiness

    # ── Heart rate drift (10-point range) ──
    if hr_history and len(hr_history) >= 10:
        recent = hr_history[-10:]
        variance = np.var(recent)
        if variance > 25:
            risk += 8
        drift = abs(recent[-1] - recent[0])
        if drift > 10:
            risk += 8

    # ── Irregular breathing (10-point range) ──
    if respiration_rate > 0:
        if respiration_rate < 8 or respiration_rate > 25:
            risk += 10
        elif respiration_rate < 10 or respiration_rate > 20:
            risk += 5

    # ── Eye-based fatigue indicators (25-point range) ──
    # PERCLOS: primary drowsiness metric (Dinges & Grace, 1998)
    # > 15% closed = moderate drowsiness, > 25% = severe
    if perclos >= 0:
        if perclos > 40:
            risk += 20  # Severe drowsiness
        elif perclos > 25:
            risk += 15
        elif perclos > 15:
            risk += 8
        elif perclos > 8:
            risk += 3

    # EAR: low average = droopy eyelids = fatigue
    if ear_avg > 0:
        if ear_avg < 0.18:
            risk += 8  # Very droopy eyelids
        elif ear_avg < 0.22:
            risk += 4

    # High blink rate can indicate fatigue (eye irritation, compensating for drowsiness)
    if blink_rate >= 0:
        if blink_rate > 30:
            risk += 5
        elif blink_rate > 25:
            risk += 3

    # Low gaze stability when fatigued
    if gaze_stability >= 0:
        if gaze_stability < 0.3:
            risk += 4
        elif gaze_stability < 0.5:
            risk += 2

    raw = float(np.clip(risk, 0, 100))
    if ema_state is not None:
        return round(_ema_smooth(ema_state, "fatigue", raw), 1)
    return round(raw, 1)


def compute_mood(stress_score: float, hrv_rmssd: float,
                 heart_rate: float,
                 lf_hf_ratio: float = 0.0,
                 pnn50: float = -1.0,
                 blink_rate: float = -1.0,
                 gaze_stability: float = -1.0) -> str:
    """
    Estimate mood using a 2D arousal-valence model, enhanced with eye metrics.

    Arousal  (high HR, high LF/HF, high blink rate) → Energized/Tense
    Valence  (high HRV, low stress, stable gaze) → Positive/Negative

    Combinations:
    - High valence + Low arousal → Calm
    - High valence + High arousal → Happy/Energized
    - Low valence + High arousal → Stressed/Anxious
    - Low valence + Low arousal → Sad/Fatigued
    - Middle → Neutral
    """
    if stress_score == 0 and hrv_rmssd == 0 and heart_rate == 0:
        return "Neutral"

    # ── Compute arousal dimension (-5 to +5) ──
    arousal = 0.0

    if heart_rate > 0:
        if heart_rate > 95:
            arousal += 2.5
        elif heart_rate > 80:
            arousal += 1.0
        elif heart_rate < 60:
            arousal -= 1.5
        elif heart_rate < 70:
            arousal -= 0.5

    if lf_hf_ratio > 0:
        if lf_hf_ratio > 3.0:
            arousal += 1.5
        elif lf_hf_ratio > 1.5:
            arousal += 0.5
        elif lf_hf_ratio < 0.5:
            arousal -= 1.0

    # Eye: high blink rate increases arousal dimension
    if blink_rate >= 0:
        if blink_rate > 25:
            arousal += 0.5
        elif blink_rate < 10:
            arousal -= 0.5

    # ── Compute valence dimension (-5 to +5) ──
    valence = 0.0

    # Stress is inversely related to valence
    if stress_score > 70:
        valence -= 3.0
    elif stress_score > 50:
        valence -= 1.5
    elif stress_score < 25:
        valence += 2.5
    elif stress_score < 35:
        valence += 1.0

    # High HRV = positive mood
    if hrv_rmssd > 60:
        valence += 2.0
    elif hrv_rmssd > 40:
        valence += 1.0
    elif hrv_rmssd < 15:
        valence -= 2.0
    elif hrv_rmssd < 25:
        valence -= 1.0

    # pNN50 reflects parasympathetic (relaxation)
    if pnn50 >= 0:
        if pnn50 > 25:
            valence += 0.5
        elif pnn50 < 5:
            valence -= 0.5

    # Eye: stable gaze = focused/positive; unstable = distracted/negative
    if gaze_stability >= 0:
        if gaze_stability > 0.8:
            valence += 0.5
        elif gaze_stability < 0.3:
            valence -= 0.5

    # ── Map arousal × valence to mood label ──
    if valence >= 1.5 and arousal >= 1.0:
        return "Happy"
    elif valence >= 1.0 and arousal < 1.0:
        return "Calm"
    elif valence <= -2.0 and arousal >= 1.5:
        return "Stressed"
    elif valence <= -1.0 and arousal >= 0.5:
        return "Anxious"
    elif valence <= -1.0 and arousal <= -0.5:
        return "Fatigued"
    elif valence >= 0.5:
        return "Calm"
    elif valence <= -0.5:
        return "Anxious"
    else:
        return "Neutral"
