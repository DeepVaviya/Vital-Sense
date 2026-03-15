"""
iPPG (imaging Photoplethysmography) signal extraction — production pipeline.

Implements three research-grade rPPG algorithms ported from the rPPG-Toolbox:

  POS  — Wang et al. (2017) "Algorithmic Principles of Remote PPG"
         IEEE Trans. Biomed. Eng. 64(7), 1479-1491.
         Sliding-window overlap-add with projection onto the plane
         orthogonal to the skin-tone vector.

  CHROM — De Haan & Jeanne (2013) "Robust Pulse Rate from
          Chrominance-based rPPG"
          IEEE Trans. Biomed. Eng. 60(10), 2878-2886.
          Windowed chrominance projection with Hanning taper.

  GREEN — Verkruysse et al. (2008) "Remote Plethysmographic Imaging
          Using Ambient Light"
          Opt. Express 16, 21434-21445.
          Spatial mean of the green channel (fallback).

The final BVP is an SNR-weighted fusion of POS + CHROM, with automatic
fallback to GREEN when both primaries have low signal quality.
"""

import math
import numpy as np
from collections import deque
from scipy import signal as sp_signal
from scipy import sparse


# ──────────────────────────────────────────────────────────────
# Tarvainen (2002) regularised least-squares detrending
# ──────────────────────────────────────────────────────────────

def _detrend_tarvainen(sig: np.ndarray, lam: int = 100) -> np.ndarray:
    """Remove slow trend via smoothness-prior detrending (lambda-based).

    This is the exact implementation from the rPPG-Toolbox, which uses a
    second-order difference penalty.  Much better than scipy linear detrend
    for handling gradual illumination drift.
    """
    T = len(sig)
    if T < 5:
        return sig
    I = np.identity(T)
    ones = np.ones(T)
    D = sparse.spdiags(
        np.array([ones, -2 * ones, ones]),
        np.array([0, 1, 2]),
        T - 2, T,
    ).toarray()
    return np.dot((I - np.linalg.inv(I + lam ** 2 * D.T @ D)), sig)


# ──────────────────────────────────────────────────────────────
# POS — exact match to rPPG-Toolbox POS_WANG
# ──────────────────────────────────────────────────────────────

def _pos_from_rgb(rgb: np.ndarray, fs: float) -> np.ndarray:
    """POS algorithm on an (N, 3) RGB time-series.

    Sliding window of 1.6 s, overlap-add accumulation, Tarvainen detrend,
    then 1st-order Butterworth bandpass [0.75, 2.5] Hz.
    """
    N = rgb.shape[0]
    if N < 10:
        return np.zeros(N)

    win_len = math.ceil(1.6 * fs)
    H = np.zeros(N)

    for n in range(win_len, N + 1):
        m = n - win_len
        window = rgb[m:n, :]            # (win_len, 3)
        mean_rgb = window.mean(axis=0)  # (3,)

        if np.any(mean_rgb < 1.0):
            continue

        Cn = (window / mean_rgb).T      # (3, win_len) temporal normalisation

        # Projection matrix P = [[0, 1, -1], [-2, 1, 1]]
        S = np.array([[0, 1, -1], [-2, 1, 1]]) @ Cn  # (2, win_len)

        std1 = np.std(S[1])
        if std1 < 1e-10:
            continue

        h = S[0] + (np.std(S[0]) / std1) * S[1]
        h -= h.mean()
        H[m:n] += h

    # Post-processing identical to rPPG-Toolbox
    H = _detrend_tarvainen(H, lam=100)

    nyq = fs / 2.0
    lo, hi = 0.75 / nyq, 2.5 / nyq
    if lo < hi < 1.0 and len(H) > 27:
        b, a = sp_signal.butter(1, [lo, hi], btype='bandpass')
        try:
            H = sp_signal.filtfilt(b, a, H.astype(np.float64))
        except ValueError:
            pass

    return H


# ──────────────────────────────────────────────────────────────
# CHROM — exact match to rPPG-Toolbox CHROME_DEHAAN
# ──────────────────────────────────────────────────────────────

def _chrom_from_rgb(rgb: np.ndarray, fs: float) -> np.ndarray:
    """CHROM algorithm on an (N, 3) RGB time-series.

    Windowed overlap-add (50% overlap), per-window bandpass, Hanning taper,
    alpha-ratio combination of X and Y chrominance signals.
    """
    N = rgb.shape[0]
    if N < 10:
        return np.zeros(N)

    LPF, HPF = 0.7, 2.5
    win_sec = 1.6

    nyq = fs / 2.0
    if HPF / nyq >= 1.0 or LPF / nyq >= 1.0:
        return np.zeros(N)

    B, A = sp_signal.butter(3, [LPF / nyq, HPF / nyq], btype='bandpass')

    WinL = math.ceil(win_sec * fs)
    if WinL % 2:
        WinL += 1
    if WinL < 6 or N < WinL:
        return np.zeros(N)

    NWin = max(0, (N - WinL // 2) // (WinL // 2))
    totallen = (WinL // 2) * (NWin + 1)
    S = np.zeros(totallen)

    WinS = 0
    for _ in range(NWin):
        WinM = WinS + WinL // 2
        WinE = WinS + WinL
        if WinE > N:
            break

        base = rgb[WinS:WinE, :].mean(axis=0)
        if np.any(base < 1.0):
            WinS = WinM
            continue

        norm = rgb[WinS:WinE, :] / base  # (WinL, 3) temporal normalisation

        Xs = 3.0 * norm[:, 0] - 2.0 * norm[:, 1]
        Ys = 1.5 * norm[:, 0] + norm[:, 1] - 1.5 * norm[:, 2]

        try:
            Xf = sp_signal.filtfilt(B, A, Xs)
            Yf = sp_signal.filtfilt(B, A, Ys)
        except ValueError:
            WinS = WinM
            continue

        std_y = np.std(Yf)
        alpha = np.std(Xf) / std_y if std_y > 1e-10 else 1.0

        SWin = (Xf - alpha * Yf) * sp_signal.windows.hann(WinL)

        half = WinL // 2
        if WinM <= len(S) and WinE <= len(S):
            S[WinS:WinM] += SWin[:half]
            S[WinM:WinE] = SWin[half:]

        WinS = WinM

    return S[:N]


# ──────────────────────────────────────────────────────────────
# GREEN — trivial g-channel baseline
# ──────────────────────────────────────────────────────────────

def _green_from_rgb(rgb: np.ndarray) -> np.ndarray:
    """Return the spatially-averaged green channel time-series."""
    return rgb[:, 1].copy() if rgb.shape[0] > 0 else np.zeros(0)


# ──────────────────────────────────────────────────────────────
# SNR estimator
# ──────────────────────────────────────────────────────────────

def _spectral_snr(sig: np.ndarray, fs: float,
                  lo: float = 0.75, hi: float = 2.5) -> float:
    """Spectral SNR: ratio of peak power to mean power in the HR band."""
    if len(sig) < 15:
        return 0.0

    nfft = max(256, 2 ** int(np.ceil(np.log2(len(sig)))))
    freqs = np.fft.rfftfreq(nfft, d=1.0 / fs)
    mag = np.abs(np.fft.rfft(sig, n=nfft))

    mask = (freqs >= lo) & (freqs <= hi)
    if not np.any(mask):
        return 0.0

    band = mag[mask]
    peak = np.max(band)
    mean_val = np.mean(band)
    return float(peak / mean_val) if mean_val > 1e-10 else 0.0


# ==============================================================
#  Public class — drop-in replacement for the old extractor
# ==============================================================

class IPPGSignalExtractor:
    """Maintains a sliding RGB buffer and computes rPPG via POS+CHROM fusion.

    Drop-in replacement: same add_sample / compute_chrom /
    get_signal API as the original.

    Parameters
    ----------
    buffer_seconds : int
        How many seconds of history to keep (default 30).
    fps : float
        Expected frame rate (default 15).
    """

    MIN_SECONDS_FOR_ESTIMATE = 1.5   # need >= 1.5 s of data
    GREEN_FALLBACK_SNR = 2.0         # if both POS+CHROM SNR below this, use GREEN

    def __init__(self, buffer_seconds: int = 30, fps: float = 15.0):
        self.buffer_seconds = buffer_seconds
        self.fps = fps
        self.max_samples = int(buffer_seconds * fps)

        # Raw RGB signal buffers
        self.r_buffer: deque = deque(maxlen=self.max_samples)
        self.g_buffer: deque = deque(maxlen=self.max_samples)
        self.b_buffer: deque = deque(maxlen=self.max_samples)

        # Output cache
        self.rppg_signal: deque = deque(maxlen=self.max_samples)

        # Diagnostics for quality reporting
        self.last_snr_pos = 0.0
        self.last_snr_chrom = 0.0
        self.last_method = "none"

    # ---- input ----

    def add_sample(self, rgb: np.ndarray):
        """Append one spatial-mean RGB sample (shape (3,))."""
        if rgb is None or len(rgb) != 3:
            return
        self.r_buffer.append(float(rgb[0]))
        self.g_buffer.append(float(rgb[1]))
        self.b_buffer.append(float(rgb[2]))

    # ---- core compute ----

    def compute_chrom(self) -> np.ndarray:
        """Compute the fused POS+CHROM rPPG signal from the current buffer.

        Returns
        -------
        np.ndarray
            1-D BVP signal, or empty array if data is insufficient.
        """
        n = len(self.r_buffer)
        # Need enough samples for the windowed algorithms (POS/CHROM use 1.6s windows)
        # Use a fixed minimum of 15 samples to avoid FPS-dependent gating issues
        if n < 15:
            return np.array([])

        rgb = np.column_stack([
            np.array(self.r_buffer),
            np.array(self.g_buffer),
            np.array(self.b_buffer),
        ])  # (N, 3)

        # --- Run both algorithms ---
        pos_sig = _pos_from_rgb(rgb, self.fps)
        chrom_sig = _chrom_from_rgb(rgb, self.fps)

        # Ensure equal length (CHROM may be truncated)
        L = min(len(pos_sig), len(chrom_sig), n)
        pos_sig = pos_sig[:L]
        chrom_sig = chrom_sig[:L]

        # --- SNR-weighted fusion ---
        snr_pos = _spectral_snr(pos_sig, self.fps)
        snr_chrom = _spectral_snr(chrom_sig, self.fps)
        self.last_snr_pos = snr_pos
        self.last_snr_chrom = snr_chrom

        # Fallback to GREEN if both are poor
        if snr_pos < self.GREEN_FALLBACK_SNR and snr_chrom < self.GREEN_FALLBACK_SNR:
            green_sig = _green_from_rgb(rgb)
            green_sig = _detrend_tarvainen(green_sig, lam=100)
            nyq = self.fps / 2.0
            lo, hi = 0.75 / nyq, 2.5 / nyq
            if lo < hi < 1.0 and len(green_sig) > 27:
                b, a = sp_signal.butter(2, [lo, hi], btype='bandpass')
                try:
                    green_sig = sp_signal.filtfilt(b, a, green_sig.astype(np.float64))
                except ValueError:
                    pass
            self.last_method = "GREEN"
            self.rppg_signal = deque(green_sig.tolist(), maxlen=self.max_samples)
            return green_sig

        # Weighted combination
        w_pos = max(snr_pos, 0.01)
        w_chrom = max(snr_chrom, 0.01)
        total = w_pos + w_chrom

        fused = (w_pos / total) * pos_sig + (w_chrom / total) * chrom_sig
        self.last_method = "POS+CHROM"

        self.rppg_signal = deque(fused.tolist(), maxlen=self.max_samples)
        return fused

    # ---- accessors ----

    def get_signal(self) -> np.ndarray:
        """Return the most recently computed rPPG signal."""
        return np.array(self.rppg_signal)

    @property
    def sample_count(self) -> int:
        return len(self.r_buffer)

    @property
    def signal_quality_score(self) -> float:
        """Combined SNR of the latest extraction (higher = better)."""
        return max(self.last_snr_pos, self.last_snr_chrom)

    def reset(self):
        """Clear all buffers."""
        self.r_buffer.clear()
        self.g_buffer.clear()
        self.b_buffer.clear()
        self.rppg_signal.clear()
        self.last_snr_pos = 0.0
        self.last_snr_chrom = 0.0
        self.last_method = "none"
