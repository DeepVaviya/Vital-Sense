"""
Respiration rate detection — dual-channel approach.

Channel 1: Facial landmark vertical micro-motion (existing)
    Tracks nose, chin, forehead, jaw vertical displacement.

Channel 2: BVP-derived respiratory signal (NEW)
    Breathing modulates the pulse waveform via Respiratory Sinus
    Arrhythmia (RSA) — the heart rate speeds up during inhalation
    and slows during exhalation.  We extract the respiratory
    envelope by bandpass-filtering the rPPG BVP signal in the
    breathing band [0.15–0.5 Hz] (9–30 BPM).

The final respiration rate fuses both channels by confidence-weighted
selection, making it responsive to both visible breathing motion AND
physiological breathing that only shows up in the pulse signal.
"""
import numpy as np
from collections import deque
from signal_processing import butterworth_bandpass
from scipy.signal import find_peaks, welch


class RespirationDetector:
    """Detect respiration rate from landmark motion + BVP envelope."""

    def __init__(self, buffer_seconds: int = 30, fps: float = 15.0):
        self.fps = fps
        self.max_samples = int(buffer_seconds * fps)

        # Channel 1: Landmark vertical motion
        self.nose_y_buffer = deque(maxlen=self.max_samples)
        self.chin_y_buffer = deque(maxlen=self.max_samples)
        self.forehead_y_buffer = deque(maxlen=self.max_samples)
        self.cumulative_signal = deque(maxlen=self.max_samples)

        # Channel 2: BVP-derived respiratory signal
        self.bvp_buffer = deque(maxlen=self.max_samples)

        # Landmark indices
        self.nose_tip_idx = 1
        self.chin_idx = 152
        self.forehead_idx = 10
        self.left_jaw_idx = 234
        self.right_jaw_idx = 454

        # EMA state
        self._prev_rate = 0.0
        self._ema_alpha = 0.25

    def add_landmarks(self, landmarks: list):
        """Track vertical position of facial landmarks for breathing motion."""
        if landmarks is None or len(landmarks) < 200:
            return

        nose_y = landmarks[self.nose_tip_idx][1]
        chin_y = landmarks[self.chin_idx][1]
        forehead_y = landmarks[self.forehead_idx][1]

        self.nose_y_buffer.append(nose_y)
        self.chin_y_buffer.append(chin_y)
        self.forehead_y_buffer.append(forehead_y)

        if len(self.nose_y_buffer) >= 2:
            baseline_count = min(5, len(self.nose_y_buffer))
            nose_baseline = sum(list(self.nose_y_buffer)[:baseline_count]) / baseline_count
            chin_baseline = sum(list(self.chin_y_buffer)[:baseline_count]) / baseline_count
            forehead_baseline = sum(list(self.forehead_y_buffer)[:baseline_count]) / baseline_count

            disp_nose = nose_y - nose_baseline
            disp_chin = chin_y - chin_baseline
            disp_forehead = forehead_y - forehead_baseline

            if len(landmarks) > max(self.left_jaw_idx, self.right_jaw_idx):
                left_jaw_y = landmarks[self.left_jaw_idx][1]
                right_jaw_y = landmarks[self.right_jaw_idx][1]
                disp_jaw = ((left_jaw_y + right_jaw_y) / 2.0) - chin_baseline
                combined = 0.2 * disp_nose + 0.3 * disp_chin + 0.2 * disp_forehead + 0.3 * disp_jaw
            else:
                combined = 0.3 * disp_nose + 0.4 * disp_chin + 0.3 * disp_forehead

            self.cumulative_signal.append(combined)
        else:
            self.cumulative_signal.append(0.0)

    def add_bvp_sample(self, bvp_value: float):
        """Add a single BVP (pulse waveform) sample for respiratory extraction."""
        self.bvp_buffer.append(float(bvp_value))

    def add_bvp_signal(self, bvp_array: np.ndarray):
        """Replace the BVP buffer with the latest rPPG signal for respiratory analysis."""
        self.bvp_buffer = deque(bvp_array.tolist(), maxlen=self.max_samples)

    # ── Respiration from BVP (Respiratory Sinus Arrhythmia) ──

    def _bvp_respiration_rate(self) -> tuple:
        """Extract respiration rate from BVP signal using RSA.

        Breathing modulates the pulse amplitude and inter-beat intervals.
        We bandpass-filter the BVP in the respiratory band [0.15, 0.5] Hz
        and find the dominant frequency.

        Returns:
            (rate_bpm, confidence)
        """
        sig = np.array(self.bvp_buffer)
        min_len = int(self.fps * 8)  # need >=8s of BVP
        if len(sig) < min_len:
            return 0.0, 0.0

        # Bandpass in respiratory band: 0.15–0.5 Hz (9–30 BPM)
        resp_sig = butterworth_bandpass(sig, 0.15, 0.5, self.fps, order=2)
        if len(resp_sig) < 20:
            return 0.0, 0.0

        # Welch periodogram for robust frequency estimation
        nperseg = min(len(resp_sig), int(8 * self.fps))
        noverlap = int(nperseg * 0.75)
        try:
            freqs, psd = welch(resp_sig, fs=self.fps, nperseg=nperseg,
                               noverlap=noverlap, detrend='linear')
        except Exception:
            return 0.0, 0.0

        mask = (freqs >= 0.15) & (freqs <= 0.5)
        if not np.any(mask):
            return 0.0, 0.0

        valid_freqs = freqs[mask]
        valid_psd = psd[mask]

        peak_idx = np.argmax(valid_psd)
        peak_freq = valid_freqs[peak_idx]
        peak_power = valid_psd[peak_idx]

        mean_power = np.mean(valid_psd)
        snr = peak_power / (mean_power + 1e-10)

        bpm = peak_freq * 60.0
        if bpm < 6 or bpm > 30:
            return 0.0, 0.0

        return bpm, snr

    # ── Respiration from landmarks ──

    def _fft_respiration_rate(self, filtered: np.ndarray) -> tuple:
        """FFT-based respiration rate from landmark motion."""
        n = len(filtered)
        if n < int(self.fps * 5):
            return 0.0, 0.0

        windowed = filtered * np.hanning(n)
        fft = np.fft.rfft(windowed)
        freqs = np.fft.rfftfreq(n, d=1.0 / self.fps)

        mask = (freqs >= 0.1) & (freqs <= 0.5)
        if not np.any(mask):
            return 0.0, 0.0

        magnitudes = np.abs(fft[mask])
        breathing_freqs = freqs[mask]

        if len(magnitudes) == 0 or np.max(magnitudes) == 0:
            return 0.0, 0.0

        dominant_idx = np.argmax(magnitudes)
        dominant_freq = breathing_freqs[dominant_idx]
        peak_mag = magnitudes[dominant_idx]

        noise_mags = np.delete(magnitudes, dominant_idx)
        mean_noise = np.mean(noise_mags) if len(noise_mags) > 0 else 1.0
        snr = peak_mag / (mean_noise + 1e-10)

        bpm = dominant_freq * 60.0
        return bpm, snr

    def _peak_count_respiration_rate(self, filtered: np.ndarray) -> tuple:
        """Peak-counting respiration rate from landmark motion."""
        n = len(filtered)
        if n < int(self.fps * 5):
            return 0.0, 0.0

        min_distance = int(self.fps * 2)
        sig_std = np.std(filtered)
        peaks, _ = find_peaks(
            filtered,
            distance=min_distance,
            prominence=0.01 * sig_std if sig_std > 0 else 0,
        )

        if len(peaks) < 2:
            return 0.0, 0.0

        intervals = np.diff(peaks) / self.fps
        valid = intervals[(intervals > 2.0) & (intervals < 10.0)]

        if len(valid) == 0:
            return 0.0, 0.0

        mean_interval = np.mean(valid)
        bpm = 60.0 / mean_interval

        cv = np.std(valid) / mean_interval if mean_interval > 0 else 1.0
        confidence = max(0, 1.0 - cv)

        return bpm, confidence

    # ── Fused respiration rate ──

    def compute_respiration_rate(self) -> float:
        """Compute respiration rate fusing landmark motion + BVP-derived RSA.

        Returns breaths/min, or 0 if insufficient data.
        """
        # Channel 1: Landmark motion
        landmark_rate, landmark_conf = 0.0, 0.0
        signal = np.array(self.cumulative_signal)
        if len(signal) >= int(self.fps * 5):
            filtered = butterworth_bandpass(signal, 0.1, 0.5, self.fps, order=3)
            if len(filtered) >= 10:
                fft_rate, fft_conf = self._fft_respiration_rate(filtered)
                peak_rate, peak_conf = self._peak_count_respiration_rate(filtered)
                if fft_conf >= peak_conf and fft_rate > 0:
                    landmark_rate, landmark_conf = fft_rate, fft_conf
                elif peak_rate > 0:
                    landmark_rate, landmark_conf = peak_rate, peak_conf
                elif fft_rate > 0:
                    landmark_rate, landmark_conf = fft_rate, fft_conf

        # Channel 2: BVP-derived (RSA)
        bvp_rate, bvp_conf = self._bvp_respiration_rate()

        # Fuse: pick the channel with higher confidence
        raw_rate = 0.0
        if bvp_rate > 0 and landmark_rate > 0:
            # Both available — confidence-weighted average
            total = bvp_conf + landmark_conf
            if total > 0:
                raw_rate = (bvp_conf * bvp_rate + landmark_conf * landmark_rate) / total
            else:
                raw_rate = bvp_rate
        elif bvp_rate > 0:
            raw_rate = bvp_rate
        elif landmark_rate > 0:
            raw_rate = landmark_rate
        else:
            return 0.0

        if raw_rate < 6 or raw_rate > 30:
            return 0.0

        # EMA smoothing
        if self._prev_rate > 0:
            smoothed = self._ema_alpha * raw_rate + (1 - self._ema_alpha) * self._prev_rate
        else:
            smoothed = raw_rate

        self._prev_rate = smoothed
        return round(smoothed, 1)

    def get_waveform(self, n_points: int = 150) -> list:
        """Return recent respiration waveform for visualization.

        Prefers BVP-derived respiratory waveform (smoother, more responsive),
        falls back to landmark motion.
        """
        # Try BVP-derived waveform first
        bvp_sig = np.array(self.bvp_buffer)
        if len(bvp_sig) >= 30:
            resp = butterworth_bandpass(bvp_sig, 0.15, 0.5, self.fps, order=2)
            if len(resp) >= 15:
                return resp[-n_points:].tolist()

        # Fallback: landmark motion
        signal = np.array(self.cumulative_signal)
        if len(signal) < 15:
            return []
        filtered = butterworth_bandpass(signal, 0.1, 0.5, self.fps, order=3)
        return filtered[-n_points:].tolist()

    def reset(self):
        self.nose_y_buffer.clear()
        self.chin_y_buffer.clear()
        self.forehead_y_buffer.clear()
        self.cumulative_signal.clear()
        self.bvp_buffer.clear()
        self._prev_rate = 0.0
