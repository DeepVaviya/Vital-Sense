"""
Eye Analysis Module — blink detection, gaze tracking, PERCLOS, saccade detection.

Uses MediaPipe 478-landmark face mesh:
  - Eye contour landmarks for Eye Aspect Ratio (EAR) based blink detection
  - Iris landmarks (468-477) for gaze direction and stability
  - PERCLOS (Percentage of Eye Closure) for drowsiness detection
  - Saccade detection via rapid gaze shifts

References:
  - Soukupová & Čech (2016): "Eye Blink Detection Using Facial Landmarks"
  - PERCLOS standard: Dinges & Grace (1998)
"""
import numpy as np
from collections import deque


# MediaPipe Face Mesh eye landmark indices
# Left eye contour (6 points for EAR)
LEFT_EYE = {
    'inner': 133,    # inner corner (medial canthus)
    'outer': 33,     # outer corner (lateral canthus)
    'upper1': 160,   # upper lid point 1
    'upper2': 158,   # upper lid point 2
    'lower1': 144,   # lower lid point 1
    'lower2': 153,   # lower lid point 2
}

# Right eye contour (6 points for EAR)
RIGHT_EYE = {
    'inner': 362,
    'outer': 263,
    'upper1': 385,
    'upper2': 387,
    'lower1': 373,
    'lower2': 380,
}

# Iris landmarks (MediaPipe 468-477)
LEFT_IRIS = [468, 469, 470, 471, 472]   # center, top, right, bottom, left
RIGHT_IRIS = [473, 474, 475, 476, 477]  # center, top, right, bottom, left

# Additional eye landmarks for more precise tracking
LEFT_EYE_FULL = [33, 7, 163, 144, 145, 153, 154, 155, 133, 173, 157, 158, 159, 160, 161, 246]
RIGHT_EYE_FULL = [362, 382, 381, 380, 374, 373, 390, 249, 263, 466, 388, 387, 386, 385, 384, 398]

# Eyebrow landmarks for tracking
LEFT_EYEBROW = [70, 63, 105, 66, 107]
RIGHT_EYEBROW = [300, 293, 334, 296, 336]

# EAR blink thresholds
EAR_BLINK_THRESHOLD = 0.24     # Below this = eye closed (raised for better detection)
EAR_CONSEC_FRAMES = 1          # Minimum consecutive frames for a blink
PERCLOS_THRESHOLD = 0.25       # EAR below this is considered "closed" for PERCLOS


class EyeAnalyzer:
    """Per-face eye analysis: blink detection, gaze tracking, PERCLOS, saccades."""

    def __init__(self, fps: float = 15.0, buffer_seconds: int = 30):
        self.fps = fps
        self.max_samples = int(buffer_seconds * fps)

        # Blink detection state
        self._ear_buffer = deque(maxlen=self.max_samples)
        self._blink_counter = 0       # Total blinks detected
        self._consec_closed = 0       # Consecutive frames with eyes closed
        self._blink_timestamps = deque(maxlen=200)  # Frame indices of blinks
        self._frame_count = 0

        # PERCLOS state (rolling window = 60 seconds)
        self._perclos_window = int(60 * fps)
        self._eye_state_buffer = deque(maxlen=self._perclos_window)  # 1=closed, 0=open

        # Gaze tracking state
        self._gaze_x_buffer = deque(maxlen=self.max_samples)
        self._gaze_y_buffer = deque(maxlen=self.max_samples)
        self._gaze_positions = deque(maxlen=self.max_samples)

        # Saccade detection
        self._saccade_timestamps = deque(maxlen=200)
        self._prev_gaze = None
        self._saccade_threshold = 0.08  # Normalized gaze shift threshold

        # Pupil size tracking (relative)
        self._pupil_size_buffer = deque(maxlen=self.max_samples)

        # EMA smoothing for output metrics
        self._prev_blink_rate = 0.0
        self._ema_alpha = 0.3

    @staticmethod
    def _distance(p1, p2):
        """Euclidean distance between two (x, y) points."""
        return np.sqrt((p1[0] - p2[0])**2 + (p1[1] - p2[1])**2)

    def _compute_ear(self, landmarks: list, eye_indices: dict) -> float:
        """
        Compute Eye Aspect Ratio (EAR) for one eye.

        EAR = (||p2 - p6|| + ||p3 - p5||) / (2 * ||p1 - p4||)

        Where p1=outer, p2=upper1, p3=upper2, p4=inner, p5=lower2, p6=lower1
        (Soukupová & Čech, 2016)
        """
        try:
            p1 = landmarks[eye_indices['outer']]
            p2 = landmarks[eye_indices['upper1']]
            p3 = landmarks[eye_indices['upper2']]
            p4 = landmarks[eye_indices['inner']]
            p5 = landmarks[eye_indices['lower2']]
            p6 = landmarks[eye_indices['lower1']]

            # Vertical distances
            v1 = self._distance(p2, p6)
            v2 = self._distance(p3, p5)

            # Horizontal distance
            h = self._distance(p1, p4)

            if h == 0:
                return 0.0

            ear = (v1 + v2) / (2.0 * h)
            return ear
        except (IndexError, KeyError):
            return 0.0

    def _compute_gaze(self, landmarks: list) -> tuple:
        """
        Compute normalized gaze position from iris landmarks.

        Returns (gaze_x, gaze_y) normalized to [-1, 1] range where:
        - gaze_x: -1 = looking left, +1 = looking right
        - gaze_y: -1 = looking up, +1 = looking down
        """
        try:
            if len(landmarks) < 478:
                return None, None

            # Left iris center and eye corners
            l_iris = landmarks[LEFT_IRIS[0]]
            l_inner = landmarks[LEFT_EYE['inner']]
            l_outer = landmarks[LEFT_EYE['outer']]
            l_upper = landmarks[LEFT_EYE['upper2']]
            l_lower = landmarks[LEFT_EYE['lower1']]

            # Right iris center and eye corners
            r_iris = landmarks[RIGHT_IRIS[0]]
            r_inner = landmarks[RIGHT_EYE['inner']]
            r_outer = landmarks[RIGHT_EYE['outer']]
            r_upper = landmarks[RIGHT_EYE['upper2']]
            r_lower = landmarks[RIGHT_EYE['lower1']]

            # Horizontal gaze: iris position relative to eye width
            l_eye_width = self._distance(l_inner, l_outer)
            r_eye_width = self._distance(r_inner, r_outer)

            if l_eye_width == 0 or r_eye_width == 0:
                return None, None

            # Normalized horizontal position (0 = outer corner, 1 = inner corner)
            l_gaze_x = (l_iris[0] - l_outer[0]) / (l_inner[0] - l_outer[0]) if (l_inner[0] - l_outer[0]) != 0 else 0.5
            r_gaze_x = (r_iris[0] - r_outer[0]) / (r_inner[0] - r_outer[0]) if (r_inner[0] - r_outer[0]) != 0 else 0.5

            # Vertical gaze: iris position relative to eye height
            l_eye_height = self._distance(l_upper, l_lower)
            r_eye_height = self._distance(r_upper, r_lower)

            l_gaze_y = (l_iris[1] - l_upper[1]) / max(l_eye_height, 1) if l_eye_height > 0 else 0.5
            r_gaze_y = (r_iris[1] - r_upper[1]) / max(r_eye_height, 1) if r_eye_height > 0 else 0.5

            # Average both eyes and normalize to [-1, 1]
            gaze_x = ((l_gaze_x + r_gaze_x) / 2.0 - 0.5) * 2.0
            gaze_y = ((l_gaze_y + r_gaze_y) / 2.0 - 0.5) * 2.0

            # Clamp to valid range
            gaze_x = max(-1.0, min(1.0, gaze_x))
            gaze_y = max(-1.0, min(1.0, gaze_y))

            return gaze_x, gaze_y
        except (IndexError, KeyError):
            return None, None

    def _compute_pupil_size(self, landmarks: list) -> float:
        """
        Estimate relative pupil/iris size from iris landmarks.

        Uses the diameter of the iris landmark polygon as a proxy.
        Larger = more dilated (stress, cognitive load, low light).
        """
        try:
            if len(landmarks) < 478:
                return 0.0

            # Left iris diameter (horizontal: landmarks 472-470, vertical: 471-469)
            l_h = self._distance(landmarks[LEFT_IRIS[4]], landmarks[LEFT_IRIS[2]])
            l_v = self._distance(landmarks[LEFT_IRIS[1]], landmarks[LEFT_IRIS[3]])

            # Right iris diameter
            r_h = self._distance(landmarks[RIGHT_IRIS[4]], landmarks[RIGHT_IRIS[2]])
            r_v = self._distance(landmarks[RIGHT_IRIS[1]], landmarks[RIGHT_IRIS[3]])

            # Average diameter normalized by inter-eye distance for scale invariance
            eye_distance = self._distance(landmarks[LEFT_EYE['inner']], landmarks[RIGHT_EYE['inner']])
            if eye_distance == 0:
                return 0.0

            avg_diameter = (l_h + l_v + r_h + r_v) / 4.0
            return avg_diameter / eye_distance
        except (IndexError, KeyError):
            return 0.0

    def add_landmarks(self, landmarks: list):
        """
        Process one frame of face landmarks for eye analysis.

        Args:
            landmarks: list of (x, y) tuples from MediaPipe face detection (478 points)
        """
        if not landmarks or len(landmarks) < 468:
            return

        self._frame_count += 1

        # ── EAR computation (both eyes averaged) ──
        left_ear = self._compute_ear(landmarks, LEFT_EYE)
        right_ear = self._compute_ear(landmarks, RIGHT_EYE)
        avg_ear = (left_ear + right_ear) / 2.0
        self._ear_buffer.append(avg_ear)

        # ── Blink detection ──
        is_closed = avg_ear < EAR_BLINK_THRESHOLD
        self._eye_state_buffer.append(1 if is_closed else 0)

        if is_closed:
            self._consec_closed += 1
        else:
            if self._consec_closed >= EAR_CONSEC_FRAMES:
                # A blink was detected (eyes were closed for enough frames)
                self._blink_counter += 1
                self._blink_timestamps.append(self._frame_count)
            self._consec_closed = 0

        # ── Gaze tracking ──
        gaze_x, gaze_y = self._compute_gaze(landmarks)
        if gaze_x is not None:
            self._gaze_x_buffer.append(gaze_x)
            self._gaze_y_buffer.append(gaze_y)
            self._gaze_positions.append((gaze_x, gaze_y))

            # ── Saccade detection ──
            if self._prev_gaze is not None:
                dx = gaze_x - self._prev_gaze[0]
                dy = gaze_y - self._prev_gaze[1]
                shift = np.sqrt(dx**2 + dy**2)
                if shift > self._saccade_threshold:
                    self._saccade_timestamps.append(self._frame_count)
            self._prev_gaze = (gaze_x, gaze_y)

        # ── Pupil size ──
        pupil = self._compute_pupil_size(landmarks)
        if pupil > 0:
            self._pupil_size_buffer.append(pupil)

    def get_metrics(self) -> dict:
        """
        Compute all eye-based metrics from accumulated data.

        Returns:
            dict with:
            - blink_rate: blinks per minute
            - ear_avg: average Eye Aspect Ratio (current window)
            - gaze_stability: 0-1 score (1 = very stable gaze)
            - gaze_x: current horizontal gaze (-1 to 1)
            - gaze_y: current vertical gaze (-1 to 1)
            - perclos: percentage of eye closure (0-100)
            - saccade_rate: saccades per minute
            - pupil_size: relative pupil/iris diameter
            - is_blinking: whether eyes are currently closed
        """
        metrics = {
            'blink_rate': 0.0,
            'ear_avg': 0.0,
            'gaze_stability': 1.0,
            'gaze_x': 0.0,
            'gaze_y': 0.0,
            'perclos': 0.0,
            'saccade_rate': 0.0,
            'pupil_size': 0.0,
            'is_blinking': False,
        }

        if self._frame_count < 5:
            return metrics

        # ── Current EAR ──
        if self._ear_buffer:
            # Use recent window for smooth EAR
            recent_ears = list(self._ear_buffer)[-int(self.fps):]
            metrics['ear_avg'] = round(float(np.mean(recent_ears)), 3)
            metrics['is_blinking'] = self._consec_closed >= EAR_CONSEC_FRAMES

        # ── Blink rate (blinks per minute) ──
        if self._blink_timestamps:
            # Count blinks in the last 60 seconds
            window_frames = int(60 * self.fps)
            cutoff = self._frame_count - window_frames
            recent_blinks = sum(1 for t in self._blink_timestamps if t > cutoff)
            elapsed_seconds = min(self._frame_count / self.fps, 60.0)
            if elapsed_seconds > 3:  # Need at least 3 seconds of data
                raw_rate = (recent_blinks / elapsed_seconds) * 60.0
                # EMA smooth
                if self._prev_blink_rate > 0:
                    metrics['blink_rate'] = round(
                        self._ema_alpha * raw_rate + (1 - self._ema_alpha) * self._prev_blink_rate, 1
                    )
                else:
                    metrics['blink_rate'] = round(raw_rate, 1)
                self._prev_blink_rate = metrics['blink_rate']

        # ── Gaze position and stability ──
        if len(self._gaze_x_buffer) > 5:
            metrics['gaze_x'] = round(float(self._gaze_x_buffer[-1]), 3)
            metrics['gaze_y'] = round(float(self._gaze_y_buffer[-1]), 3)

            # Stability: inverse of gaze variance over recent window (lower variance = more stable)
            window = min(int(self.fps * 5), len(self._gaze_x_buffer))  # 5 second window
            recent_x = list(self._gaze_x_buffer)[-window:]
            recent_y = list(self._gaze_y_buffer)[-window:]
            variance = np.var(recent_x) + np.var(recent_y)
            # Map variance to 0-1 stability score (lower variance = higher stability)
            stability = max(0.0, 1.0 - min(variance * 20.0, 1.0))
            metrics['gaze_stability'] = round(stability, 2)

        # ── PERCLOS (Percentage of Eye Closure) ──
        if self._eye_state_buffer:
            closed_count = sum(self._eye_state_buffer)
            total = len(self._eye_state_buffer)
            metrics['perclos'] = round((closed_count / total) * 100.0, 1)

        # ── Saccade rate (saccades per minute) ──
        if self._saccade_timestamps:
            window_frames = int(60 * self.fps)
            cutoff = self._frame_count - window_frames
            recent_saccades = sum(1 for t in self._saccade_timestamps if t > cutoff)
            elapsed_seconds = min(self._frame_count / self.fps, 60.0)
            if elapsed_seconds > 3:
                metrics['saccade_rate'] = round((recent_saccades / elapsed_seconds) * 60.0, 1)

        # ── Pupil size ──
        if self._pupil_size_buffer:
            recent_pupils = list(self._pupil_size_buffer)[-int(self.fps * 2):]
            metrics['pupil_size'] = round(float(np.mean(recent_pupils)), 4)

        return metrics

    def get_tracking_points(self, landmarks: list) -> dict:
        """
        Get eye tracking points for visualization on the camera feed.

        Returns dict of named points with (x, y) coordinates for overlay rendering.
        """
        points = {}
        if not landmarks or len(landmarks) < 468:
            return points

        try:
            # Left eye corners
            points['left_eye_inner'] = landmarks[LEFT_EYE['inner']]
            points['left_eye_outer'] = landmarks[LEFT_EYE['outer']]
            points['left_eye_top'] = landmarks[LEFT_EYE['upper2']]
            points['left_eye_bottom'] = landmarks[LEFT_EYE['lower1']]

            # Right eye corners
            points['right_eye_inner'] = landmarks[RIGHT_EYE['inner']]
            points['right_eye_outer'] = landmarks[RIGHT_EYE['outer']]
            points['right_eye_top'] = landmarks[RIGHT_EYE['upper2']]
            points['right_eye_bottom'] = landmarks[RIGHT_EYE['lower1']]

            # Iris centers (if available)
            if len(landmarks) >= 478:
                points['left_iris'] = landmarks[LEFT_IRIS[0]]
                points['right_iris'] = landmarks[RIGHT_IRIS[0]]

            # Eyebrow key points
            points['left_eyebrow_mid'] = landmarks[LEFT_EYEBROW[1]]
            points['right_eyebrow_mid'] = landmarks[RIGHT_EYEBROW[1]]

        except (IndexError, KeyError):
            pass

        return points

    def reset(self):
        """Clear all state."""
        self._ear_buffer.clear()
        self._blink_counter = 0
        self._consec_closed = 0
        self._blink_timestamps.clear()
        self._frame_count = 0
        self._eye_state_buffer.clear()
        self._gaze_x_buffer.clear()
        self._gaze_y_buffer.clear()
        self._gaze_positions.clear()
        self._saccade_timestamps.clear()
        self._prev_gaze = None
        self._pupil_size_buffer.clear()
        self._prev_blink_rate = 0.0
