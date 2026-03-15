"""
Heart Rate Variability (HRV) analysis — time-domain and frequency-domain.

Time-domain:
    RMSSD = sqrt(mean((IBI[n] - IBI[n-1])^2))
    SDNN  = std(IBI)
    pNN50 = % of successive IBIs differing by > 50 ms

Frequency-domain (Lomb-Scargle periodogram):
    LF power  (0.04 – 0.15 Hz) — sympathetic + parasympathetic
    HF power  (0.15 – 0.40 Hz) — parasympathetic (vagal)
    LF/HF ratio — autonomic balance indicator
"""
import numpy as np


def compute_ibi(peaks: np.ndarray, fs: float) -> np.ndarray:
    """
    Compute inter-beat intervals (IBI) from peak indices.

    Args:
        peaks: array of peak sample indices
        fs: sampling rate in Hz

    Returns:
        Array of IBI values in milliseconds, outlier-rejected.
    """
    if len(peaks) < 2:
        return np.array([])

    ibis_sec = np.diff(peaks) / fs
    # Filter physiologically plausible IBIs (40-200 BPM → 0.30-1.50 sec)
    valid = ibis_sec[(ibis_sec > 0.30) & (ibis_sec < 1.50)]

    if len(valid) < 2:
        return valid * 1000.0

    # Outlier rejection: remove IBIs > 2 std devs from median
    median_ibi = np.median(valid)
    std_ibi = np.std(valid)
    if std_ibi > 0:
        mask = np.abs(valid - median_ibi) < 2.0 * std_ibi
        valid = valid[mask]

    return valid * 1000.0  # Convert to ms


def compute_rmssd(ibis_ms: np.ndarray) -> float:
    """
    Compute RMSSD (Root Mean Square of Successive Differences).

    RMSSD = sqrt(mean((IBI[n] - IBI[n-1])^2))

    Args:
        ibis_ms: array of IBI in milliseconds

    Returns:
        RMSSD in ms, or 0 if insufficient data.
    """
    if len(ibis_ms) < 2:
        return 0.0

    successive_diffs = np.diff(ibis_ms)
    rmssd = np.sqrt(np.mean(successive_diffs ** 2))
    # Clamp to realistic range (healthy adults: 10-150 ms)
    rmssd = min(rmssd, 150.0)
    return round(float(rmssd), 2)


def compute_sdnn(ibis_ms: np.ndarray) -> float:
    """
    Compute SDNN (Standard Deviation of NN intervals).

    SDNN = std(IBI)

    Args:
        ibis_ms: array of IBI in milliseconds

    Returns:
        SDNN in ms, or 0 if insufficient data.
    """
    if len(ibis_ms) < 2:
        return 0.0

    sdnn = np.std(ibis_ms, ddof=1)
    # Clamp to realistic range (healthy adults: 10-200 ms)
    sdnn = min(sdnn, 200.0)
    return round(float(sdnn), 2)


def compute_pnn50(ibis_ms: np.ndarray) -> float:
    """
    Compute pNN50: percentage of successive IBI differences > 50 ms.

    A standard HRV time-domain metric reflecting parasympathetic activity.

    Args:
        ibis_ms: array of IBI in milliseconds

    Returns:
        pNN50 as a percentage (0-100), or 0 if insufficient data.
    """
    if len(ibis_ms) < 2:
        return 0.0

    successive_diffs = np.abs(np.diff(ibis_ms))
    nn50_count = np.sum(successive_diffs > 50.0)
    pnn50 = (nn50_count / len(successive_diffs)) * 100.0
    return round(float(pnn50), 2)


def compute_frequency_domain(ibis_ms: np.ndarray) -> dict:
    """
    Compute frequency-domain HRV metrics using Lomb-Scargle periodogram.

    Lomb-Scargle is preferred over FFT for IBI series because IBIs are
    unevenly spaced in time (each represents a different duration).

    Returns:
        dict with 'lf_power', 'hf_power', 'lf_hf_ratio'
    """
    result = {"lf_power": 0.0, "hf_power": 0.0, "lf_hf_ratio": 0.0}

    if len(ibis_ms) < 6:
        return result

    # Create cumulative time axis from IBIs (in seconds)
    ibis_sec = ibis_ms / 1000.0
    t = np.cumsum(ibis_sec)
    t = t - t[0]  # Start from zero

    # IBI values centered around mean
    ibi_centered = ibis_sec - np.mean(ibis_sec)

    # Frequency range to evaluate (0.01 to 0.5 Hz)
    freqs = np.linspace(0.01, 0.5, 500)
    angular_freqs = 2 * np.pi * freqs

    # Lomb-Scargle periodogram (manual implementation for stability)
    power = np.zeros(len(freqs))
    for i, w in enumerate(angular_freqs):
        # Compute tau (time offset for lomb-scargle)
        tau = np.arctan2(np.sum(np.sin(2 * w * t)),
                         np.sum(np.cos(2 * w * t))) / (2 * w)

        cos_term = np.cos(w * (t - tau))
        sin_term = np.sin(w * (t - tau))

        cos_sum_sq = np.sum(cos_term ** 2)
        sin_sum_sq = np.sum(sin_term ** 2)

        if cos_sum_sq > 0 and sin_sum_sq > 0:
            power[i] = (
                (np.sum(ibi_centered * cos_term) ** 2) / cos_sum_sq +
                (np.sum(ibi_centered * sin_term) ** 2) / sin_sum_sq
            ) / 2.0

    # Integrate power in LF and HF bands
    df = freqs[1] - freqs[0]

    lf_mask = (freqs >= 0.04) & (freqs <= 0.15)
    hf_mask = (freqs >= 0.15) & (freqs <= 0.40)

    lf_power = np.sum(power[lf_mask]) * df
    hf_power = np.sum(power[hf_mask]) * df

    lf_hf_ratio = (lf_power / hf_power) if hf_power > 0 else 0.0

    result["lf_power"] = round(float(lf_power), 4)
    result["hf_power"] = round(float(hf_power), 4)
    result["lf_hf_ratio"] = round(float(lf_hf_ratio), 2)

    return result


def compute_hrv(peaks: np.ndarray, fs: float) -> dict:
    """
    Compute all HRV metrics (time-domain + frequency-domain) from peak indices.

    Returns:
        dict with 'rmssd', 'sdnn', 'pnn50', 'lf_power', 'hf_power',
        'lf_hf_ratio', 'ibi_mean', 'ibi_count'
    """
    ibis = compute_ibi(peaks, fs)

    # Time-domain
    rmssd = compute_rmssd(ibis)
    sdnn = compute_sdnn(ibis)
    pnn50 = compute_pnn50(ibis)

    # Frequency-domain
    freq = compute_frequency_domain(ibis)

    return {
        "rmssd": rmssd,
        "sdnn": sdnn,
        "pnn50": pnn50,
        "lf_power": freq["lf_power"],
        "hf_power": freq["hf_power"],
        "lf_hf_ratio": freq["lf_hf_ratio"],
        "ibi_mean": round(float(np.mean(ibis)), 2) if len(ibis) > 0 else 0.0,
        "ibi_count": len(ibis),
    }
