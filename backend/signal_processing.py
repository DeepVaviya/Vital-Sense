"""
Signal processing: Butterworth bandpass filtering, HR estimation via both
FFT (Welch's method) and adaptive peak detection, with EMA smoothing.

The FFT path uses Welch's periodogram to find the dominant frequency in the
HR band — this is more robust than peak detection alone because it operates
in the frequency domain and is less sensitive to noise / motion artefacts.

The peak-detection path serves as a secondary estimate and for IBI-based
HRV computation downstream.
"""

import numpy as np
from scipy.signal import butter, filtfilt, find_peaks, welch


# ==============================================================
#  Butterworth bandpass filter
# ==============================================================

def butterworth_bandpass(signal: np.ndarray, lowcut: float, highcut: float,
                         fs: float, order: int = 3) -> np.ndarray:
    """Zero-phase Butterworth bandpass filter.

    Uses filtfilt (forward-backward) for zero phase distortion.
    Order 3 is a good balance between selectivity and ringing.
    """
    if len(signal) < 15:
        return signal

    nyquist = 0.5 * fs
    low = max(lowcut / nyquist, 0.01)
    high = min(highcut / nyquist, 0.99)

    if low >= high:
        return signal

    b, a = butter(order, [low, high], btype='band')

    padlen = 3 * max(len(a), len(b))
    if len(signal) <= padlen:
        return signal

    try:
        return filtfilt(b, a, signal)
    except Exception:
        return signal


# ==============================================================
#  HR estimation via FFT (Welch's method) — primary estimator
# ==============================================================

def estimate_hr_fft(signal: np.ndarray, fs: float,
                    low_hz: float = 0.75, high_hz: float = 2.5) -> float:
    """Estimate heart rate in BPM using Welch's periodogram.

    This is the same approach used by the rPPG-Toolbox's evaluation code.
    It finds the frequency with the highest spectral power within the valid
    HR band [low_hz, high_hz] and converts to BPM.

    Returns 0.0 if insufficient data.
    """
    if len(signal) < 15:
        return 0.0

    # Welch with ~4s segments, 75% overlap for smooth PSD
    nperseg = min(len(signal), int(4 * fs))
    noverlap = int(nperseg * 0.75)

    try:
        freqs, psd = welch(signal, fs=fs, nperseg=nperseg,
                           noverlap=noverlap, detrend='linear')
    except Exception:
        return 0.0

    # Mask to valid HR range
    mask = (freqs >= low_hz) & (freqs <= high_hz)
    if not np.any(mask):
        return 0.0

    valid_freqs = freqs[mask]
    valid_psd = psd[mask]

    # Dominant frequency -> BPM
    peak_freq = valid_freqs[np.argmax(valid_psd)]
    return float(peak_freq * 60.0)


# ==============================================================
#  Adaptive peak detection
# ==============================================================

def detect_peaks(signal: np.ndarray, fs: float,
                 min_bpm: float = 42, max_bpm: float = 180) -> np.ndarray:
    """Detect peaks using adaptive thresholding + Malik outlier rejection."""
    if len(signal) < 10:
        return np.array([])

    min_distance = max(int(fs * 60.0 / max_bpm), 1)
    sig_std = np.std(signal)
    sig_median = np.median(signal)

    if sig_std == 0:
        return np.array([])

    height_threshold = sig_median + 0.1 * sig_std
    prominence_threshold = max(0.15 * sig_std, 0.005)

    peaks, _ = find_peaks(
        signal,
        distance=min_distance,
        height=height_threshold,
        prominence=prominence_threshold,
    )

    if len(peaks) > 3:
        peaks = _reject_outlier_peaks(peaks, fs, min_bpm, max_bpm)

    return peaks


def _reject_outlier_peaks(peaks: np.ndarray, fs: float,
                          min_bpm: float, max_bpm: float) -> np.ndarray:
    """Reject peaks that produce physiologically implausible IBIs.

    Two-pass: absolute range filter, then Malik's 20% deviation criterion.
    """
    if len(peaks) < 3:
        return peaks

    ibis = np.diff(peaks) / fs
    min_ibi = 60.0 / max_bpm
    max_ibi = 60.0 / min_bpm

    # Pass 1: absolute range
    valid = np.ones(len(peaks), dtype=bool)
    for i in range(len(ibis)):
        if ibis[i] < min_ibi or ibis[i] > max_ibi:
            if i + 1 < len(valid):
                valid[i + 1] = False

    peaks = peaks[valid]
    if len(peaks) < 3:
        return peaks

    # Pass 2: Malik's criterion
    ibis = np.diff(peaks) / fs
    median_ibi = np.median(ibis)
    if median_ibi <= 0:
        return peaks

    valid2 = np.ones(len(peaks), dtype=bool)
    for i, ibi in enumerate(ibis):
        if abs(ibi - median_ibi) / median_ibi > 0.20:
            if i + 1 < len(valid2):
                valid2[i + 1] = False

    return peaks[valid2]


# ==============================================================
#  Hybrid HR computation: FFT primary, peak secondary, EMA smooth
# ==============================================================

def compute_heart_rate(peaks: np.ndarray, fs: float,
                       hr_history: list = None,
                       fft_hr: float = 0.0) -> float:
    """Compute heart rate with FFT-primary, peak-secondary fusion.

    Parameters
    ----------
    peaks : array of peak sample indices (from detect_peaks)
    fs : sampling rate
    hr_history : previous HR values for EMA smoothing
    fft_hr : HR estimate from Welch FFT (from estimate_hr_fft)

    Returns
    -------
    float : heart rate in BPM, or 0 if insufficient data.
    """
    # Peak-based HR
    peak_hr = 0.0
    if len(peaks) >= 2:
        ibis = np.diff(peaks) / fs
        valid_ibis = ibis[(ibis > 0.33) & (ibis < 1.43)]  # 42-180 BPM
        if len(valid_ibis) > 0:
            peak_hr = 60.0 / np.median(valid_ibis)

    # Choose best estimate: prefer FFT, but validate against peaks
    raw_bpm = 0.0
    if fft_hr > 0 and peak_hr > 0:
        # If both agree within 15 BPM, trust FFT (more stable)
        if abs(fft_hr - peak_hr) < 15:
            raw_bpm = fft_hr * 0.7 + peak_hr * 0.3
        else:
            # Disagreement — trust the one closer to recent history
            if hr_history and len(hr_history) >= 2:
                recent = hr_history[-1]
                raw_bpm = fft_hr if abs(fft_hr - recent) < abs(peak_hr - recent) else peak_hr
            else:
                raw_bpm = fft_hr  # default to FFT
    elif fft_hr > 0:
        raw_bpm = fft_hr
    elif peak_hr > 0:
        raw_bpm = peak_hr
    else:
        return 0.0

    # EMA smoothing
    if hr_history and len(hr_history) >= 2:
        alpha = 0.3
        prev_hr = hr_history[-1]
        if prev_hr > 0 and abs(raw_bpm - prev_hr) < 20:
            smoothed = alpha * raw_bpm + (1 - alpha) * prev_hr
            return round(smoothed, 1)

    return round(raw_bpm, 1)
