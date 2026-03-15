"""Face detection using MediaPipe Face Landmarker (Tasks API).

Supports multi-face detection for identifying multiple users in camera.
"""
import os
import cv2
import numpy as np
import mediapipe as mp
from mediapipe.tasks.python import BaseOptions
from mediapipe.tasks.python.vision import (
    FaceLandmarker,
    FaceLandmarkerOptions,
    RunningMode,
)

# Path to the face landmarker model
MODEL_PATH = os.path.join(os.path.dirname(__file__), "face_landmarker.task")


class FaceDetector:
    """Detects facial landmarks using MediaPipe Face Landmarker (Tasks API)."""

    def __init__(self, max_faces: int = 5):
        options = FaceLandmarkerOptions(
            base_options=BaseOptions(model_asset_path=MODEL_PATH),
            running_mode=RunningMode.IMAGE,
            num_faces=max_faces,
            min_face_detection_confidence=0.4,
            min_face_presence_confidence=0.4,
            min_tracking_confidence=0.4,
            output_face_blendshapes=False,
            output_facial_transformation_matrixes=False,
        )
        self.landmarker = FaceLandmarker.create_from_options(options)

    def detect(self, frame: np.ndarray):
        """
        Detect face landmarks in a BGR frame (single face, backward compatible).

        Returns:
            landmarks: list of (x, y) pixel coordinates for 478 landmarks, or None
        """
        results = self.detect_multi(frame)
        if not results:
            return None
        return results[0]

    def detect_multi(self, frame: np.ndarray) -> list:
        """
        Detect all faces in a BGR frame.

        Returns:
            List of landmark sets. Each set is a list of (x, y) pixel coordinates.
            Returns empty list if no faces found.
        """
        # Convert BGR to RGB
        rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)

        # Create MediaPipe Image
        mp_image = mp.Image(image_format=mp.ImageFormat.SRGB, data=rgb)

        # Detect landmarks
        result = self.landmarker.detect(mp_image)

        if not result.face_landmarks or len(result.face_landmarks) == 0:
            return []

        h, w = frame.shape[:2]
        all_faces = []
        for face in result.face_landmarks:
            landmarks = []
            for lm in face:
                landmarks.append((int(lm.x * w), int(lm.y * h)))
            all_faces.append(landmarks)

        return all_faces

    def get_face_bbox(self, landmarks: list) -> dict:
        """
        Compute bounding box from face landmarks.

        Returns:
            dict with x, y, width, height (in pixels)
        """
        if not landmarks:
            return {"x": 0, "y": 0, "width": 0, "height": 0}

        xs = [lm[0] for lm in landmarks]
        ys = [lm[1] for lm in landmarks]

        x_min = min(xs)
        y_min = min(ys)
        x_max = max(xs)
        y_max = max(ys)

        # Add padding
        pad_x = int((x_max - x_min) * 0.1)
        pad_y = int((y_max - y_min) * 0.1)

        return {
            "x": max(0, x_min - pad_x),
            "y": max(0, y_min - pad_y),
            "width": (x_max - x_min) + 2 * pad_x,
            "height": (y_max - y_min) + 2 * pad_y,
        }

    def get_roi_points(self, landmarks: list) -> dict:
        """
        Get signal extraction ROI points for visualization.

        Returns:
            dict with forehead, left_cheek, right_cheek center coordinates
        """
        if not landmarks or len(landmarks) < 400:
            return {}

        # Forehead center (landmark 10)
        forehead = landmarks[10]
        # Left cheek center (landmark 117)
        left_cheek = landmarks[117]
        # Right cheek center (landmark 346)
        right_cheek = landmarks[346]

        return {
            "forehead": {"x": forehead[0], "y": forehead[1]},
            "left_cheek": {"x": left_cheek[0], "y": left_cheek[1]},
            "right_cheek": {"x": right_cheek[0], "y": right_cheek[1]},
        }

    def close(self):
        if self.landmarker:
            self.landmarker.close()


# ── Geometric face embedding from MediaPipe landmarks ──────────────────
# Uses structural facial ratios (invariant to lighting, skin-tone, position).
# 46 key landmarks → aligned & scaled by inter-ocular distance → 92-dim + 55 distances = 147-dim

# Key landmark indices covering distinct facial structure
_KEY_LANDMARKS = [
    # Face contour / jaw (16 pts)
    10, 338, 297, 332, 284, 251, 389, 356,
    127, 162, 21, 54, 103, 67, 109, 152,
    # Eyes (8 pts)
    33, 133, 159, 145,   # left eye: inner, outer, top, bottom
    362, 263, 386, 374,  # right eye: inner, outer, top, bottom
    # Eyebrows (6 pts)
    70, 63, 105,         # left eyebrow: inner, mid, outer
    300, 293, 334,       # right eyebrow: inner, mid, outer
    # Nose (5 pts)
    1, 6, 4, 48, 278,   # tip, bridge, bottom-center, left nostril, right nostril
    # Mouth (6 pts)
    61, 291, 0, 17, 13, 14,  # left, right, top-lip-center, bottom-lip, upper, lower
    # Ears (2 pts)
    234, 454,
    # Extra structure (3 pts)
    168, 8, 175,         # nose top, forehead mid, chin bottom
]

# Pairs for pairwise distance features (structural ratios)
_DISTANCE_PAIRS = [
    (33, 133), (362, 263),     # left eye width, right eye width
    (159, 145), (386, 374),    # left eye height, right eye height
    (33, 362),                 # inter-eye inner corners
    (133, 263),                # inter-eye outer corners
    (70, 105), (300, 334),     # eyebrow span left, right
    (70, 33), (300, 362),      # eyebrow-to-eye left, right
    (1, 6), (1, 4),            # nose length, nose tip to bottom
    (48, 278),                 # nostril width
    (61, 291),                 # mouth width
    (0, 17), (13, 14),         # lip height, lip thickness
    (10, 152),                 # face height (forehead to chin)
    (234, 454),                # face width (ear to ear)
    (1, 152),                  # nose to chin
    (10, 6),                   # forehead to nose bridge
    (6, 1),                    # nose bridge to nose tip
    (33, 61), (362, 291),      # eye to mouth corner left, right
    (133, 48), (263, 278),     # eye outer to nostril left, right
    (10, 33), (10, 362),       # forehead to eye left, right
    (152, 61), (152, 291),     # chin to mouth corner left, right
    (159, 70), (386, 300),     # eye top to eyebrow inner left, right
    (63, 159), (293, 386),     # eyebrow mid to eye top left, right
    (4, 13), (4, 14),          # nose bottom to lips
    (168, 1),                  # nose bridge top to tip
    (8, 10),                   # forehead points
    (175, 152),                # chin bottom to chin
    (61, 48), (291, 278),      # mouth corner to nostril left, right
    (0, 61), (0, 291),         # top lip center to mouth corners
    (17, 152),                 # bottom lip to chin
    (33, 263), (133, 362),     # cross-eye distances
    (70, 300), (105, 334),     # cross-eyebrow distances
    (234, 152), (454, 152),    # ear to chin
    (234, 10), (454, 10),      # ear to forehead
]


def compute_geometric_embedding(landmarks: list) -> list:
    """
    Compute a geometric face embedding from MediaPipe 478-landmark positions.

    The embedding is invariant to:
    - Position (centered on eye midpoint)
    - Scale (normalized by inter-ocular distance)
    - Lighting / skin tone (uses geometry only, no pixel colors)

    Returns:
        list of floats (147-dim), or empty list if landmarks insufficient.
    """
    if not landmarks or len(landmarks) < 468:
        return []

    pts = np.array(landmarks, dtype=np.float64)

    # Compute eye centers
    left_eye = (pts[33] + pts[133]) / 2.0
    right_eye = (pts[362] + pts[263]) / 2.0

    # Inter-ocular distance for scale normalization
    iod = np.linalg.norm(right_eye - left_eye)
    if iod < 1.0:
        return []

    # Center on eye midpoint, normalize by IOD
    center = (left_eye + right_eye) / 2.0

    # Normalized key landmark positions (46 × 2 = 92 features)
    embedding = []
    for idx in _KEY_LANDMARKS:
        if idx >= len(pts):
            embedding.extend([0.0, 0.0])
            continue
        norm_pt = (pts[idx] - center) / iod
        embedding.append(float(norm_pt[0]))
        embedding.append(float(norm_pt[1]))

    # Pairwise distances between structural pairs (55 features)
    for i, j in _DISTANCE_PAIRS:
        if i >= len(pts) or j >= len(pts):
            embedding.append(0.0)
            continue
        d = np.linalg.norm(pts[i] - pts[j]) / iod
        embedding.append(float(d))

    # L2-normalize the full vector
    emb = np.array(embedding, dtype=np.float64)
    norm = np.linalg.norm(emb)
    if norm > 0:
        emb = emb / norm

    return emb.tolist()


# ── Aligned Face Template Matching ──
# This is FAR more discriminative than geometric embeddings or color histograms
# because it compares actual pixel-level facial features (eye shape, nose, mouth).

TEMPLATE_SIZE = (96, 96)  # Standard size for face templates


def align_face(frame: np.ndarray, landmarks: list,
               output_size: tuple = TEMPLATE_SIZE) -> np.ndarray:
    """
    Align a face using eye landmarks and crop to a canonical view.

    Uses affine transformation based on eye positions to normalize:
    - Rotation (face is straightened)
    - Scale (normalized by inter-ocular distance)
    - Translation (eyes at fixed positions)

    Args:
        frame: BGR image
        landmarks: list of (x, y) pixel coordinates
        output_size: (width, height) of output

    Returns:
        Aligned face crop (BGR), or None if alignment fails.
    """
    if frame is None or not landmarks or len(landmarks) < 200:
        return None

    try:
        pts = np.array(landmarks, dtype=np.float64)

        # Eye centers from MediaPipe landmarks
        left_eye = (pts[33] + pts[133]) / 2.0   # outer + inner corners
        right_eye = (pts[362] + pts[263]) / 2.0

        # Angle between eyes
        dx = right_eye[0] - left_eye[0]
        dy = right_eye[1] - left_eye[1]
        angle = np.degrees(np.arctan2(dy, dx))

        # Eye distance for scale
        eye_dist = np.sqrt(dx**2 + dy**2)
        if eye_dist < 5:
            return None

        # Desired eye positions in output image
        desired_left_eye = (output_size[0] * 0.3, output_size[1] * 0.35)
        desired_right_eye = (output_size[0] * 0.7, output_size[1] * 0.35)
        desired_dist = desired_right_eye[0] - desired_left_eye[0]
        scale = desired_dist / eye_dist

        # Center of rotation = midpoint of eyes
        eye_center = ((left_eye[0] + right_eye[0]) / 2.0,
                      (left_eye[1] + right_eye[1]) / 2.0)

        # Rotation + scale matrix
        M = cv2.getRotationMatrix2D(eye_center, angle, scale)

        # Adjust translation so eyes land at desired positions
        M[0, 2] += (output_size[0] / 2.0) - eye_center[0]
        M[1, 2] += (output_size[1] * 0.35) - eye_center[1]

        # Apply transform
        aligned = cv2.warpAffine(frame, M, output_size,
                                 flags=cv2.INTER_LINEAR,
                                 borderMode=cv2.BORDER_REPLICATE)
        return aligned

    except Exception:
        return None


def compute_face_template(frame: np.ndarray, landmarks: list) -> np.ndarray:
    """
    Compute a normalized, aligned face template for identity matching.

    Process:
    1. Align face using eye landmarks (canonical view)
    2. Convert to grayscale
    3. Apply histogram equalization (lighting invariance)
    4. Apply Gaussian blur (reduces noise, improves robustness)

    Returns:
        Grayscale face template (96x96 uint8), or None.
    """
    aligned = align_face(frame, landmarks)
    if aligned is None:
        return None

    gray = cv2.cvtColor(aligned, cv2.COLOR_BGR2GRAY)
    gray = cv2.equalizeHist(gray)
    gray = cv2.GaussianBlur(gray, (3, 3), 0)
    return gray


def compare_face_templates(template1: np.ndarray, template2: np.ndarray) -> float:
    """
    Compare two face templates using normalized cross-correlation.

    This compares actual pixel-level facial features.
    Same person: typically > 0.45
    Different person: typically < 0.35

    Returns:
        Correlation score in range [-1, 1].
    """
    if template1 is None or template2 is None:
        return 0.0

    if template1.shape != template2.shape:
        return 0.0

    try:
        t1 = template1.astype(np.float64).flatten()
        t2 = template2.astype(np.float64).flatten()

        # Subtract mean (zero-mean normalization)
        t1 = t1 - np.mean(t1)
        t2 = t2 - np.mean(t2)

        # Normalized cross-correlation
        n1 = np.linalg.norm(t1)
        n2 = np.linalg.norm(t2)
        if n1 == 0 or n2 == 0:
            return 0.0

        return float(np.dot(t1, t2) / (n1 * n2))

    except Exception:
        return 0.0


