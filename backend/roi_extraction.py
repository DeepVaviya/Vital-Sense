"""ROI / Skin region extraction from MediaPipe Face Mesh landmarks.

Uses stable, well-vascularised facial regions for rPPG:
  - Forehead: large flat surface with excellent blood perfusion
  - Upper cheeks: stable landmarks, minimal muscle movement
  - Nose bridge excluded: too small, prone to specular reflections

Improvements over baseline:
  - HSV-based skin-colour mask to reject non-skin pixels (hair, eyes,
    background bleed from enlarged bounding boxes)
  - Weighted combination favouring the forehead (highest SNR region)
"""
import cv2
import numpy as np

print("[ROI] roi_extraction.py v2.1 loaded")

# ── MediaPipe Face Mesh landmark indices ──

# Forehead — stable region above eyebrows, well-vascularised
FOREHEAD_LANDMARKS = [10, 338, 297, 332, 284, 251, 389, 356,
                      323, 361, 288, 397, 365, 379, 378, 400,
                      377, 148, 176, 149, 150, 136, 172,
                      58, 132, 93, 127, 162, 21, 54,
                      103, 67, 109]

# Upper left cheek — below eye, above jawline
LEFT_CHEEK_LANDMARKS = [36, 205, 206, 207, 187, 123, 116, 117, 118, 119, 100, 142, 203, 206]

# Upper right cheek — below eye, above jawline
RIGHT_CHEEK_LANDMARKS = [266, 425, 426, 427, 411, 352, 345, 346, 347, 348, 329, 371, 423, 426]

# HSV skin-colour bounds (very wide to cover all skin tones under any lighting)
_SKIN_LOW = np.array([0, 10, 30], dtype=np.uint8)
_SKIN_HIGH = np.array([60, 255, 255], dtype=np.uint8)

_frame_log_counter = 0


def _skin_mask(frame_bgr: np.ndarray) -> np.ndarray:
    """Return a binary mask where 255 = likely skin pixel."""
    hsv = cv2.cvtColor(frame_bgr, cv2.COLOR_BGR2HSV)
    mask = cv2.inRange(hsv, _SKIN_LOW, _SKIN_HIGH)
    # Small morphological close to fill pores / noise
    kernel = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (3, 3))
    mask = cv2.morphologyEx(mask, cv2.MORPH_CLOSE, kernel)
    return mask


def _extract_roi_mean_rgb(frame: np.ndarray, landmarks: list,
                          indices: list,
                          skin_mask: np.ndarray = None,
                          region_name: str = "") -> np.ndarray:
    """Extract mean RGB from a polygonal ROI defined by landmark indices.

    Returns:
        np.ndarray of shape (3,) with mean [R, G, B], or None if invalid.
    """
    global _frame_log_counter
    h, w = frame.shape[:2]
    valid_indices = [i for i in indices if i < len(landmarks)]
    if len(valid_indices) < 3:
        return None

    pts = np.array([landmarks[i] for i in valid_indices], dtype=np.int32)

    # Clamp points to image bounds
    pts[:, 0] = np.clip(pts[:, 0], 0, w - 1)
    pts[:, 1] = np.clip(pts[:, 1], 0, h - 1)

    # Polygon mask (no skin mask - direct extraction for reliability)
    roi_mask = np.zeros((h, w), dtype=np.uint8)
    cv2.fillConvexPoly(roi_mask, pts, 255)
    poly_pixels = cv2.countNonZero(roi_mask)

    # Try with skin mask if available
    if skin_mask is not None and poly_pixels >= 20:
        masked = cv2.bitwise_and(roi_mask, skin_mask)
        skin_pixels = cv2.countNonZero(masked)

        # Use skin-masked version if it has enough pixels
        if skin_pixels >= 20:
            roi_mask = masked
        # else: keep the polygon-only mask (no skin filtering)

    final_pixels = cv2.countNonZero(roi_mask)

    # Diagnostic logging (first 60 calls)
    if _frame_log_counter < 60 and region_name:
        _frame_log_counter += 1
        print(f"[ROI] {region_name}: pts={len(pts)}, poly_px={poly_pixels}, "
              f"final_px={final_pixels}, frame={h}x{w}")

    if final_pixels < 3:
        return None

    # Extract mean colour (BGR -> RGB)
    mean_bgr = cv2.mean(frame, mask=roi_mask)[:3]
    return np.array([mean_bgr[2], mean_bgr[1], mean_bgr[0]])  # RGB


def extract_roi_signals(frame: np.ndarray, landmarks: list) -> dict:
    """Extract mean RGB signals from stable facial ROIs.

    Returns:
        dict with keys: 'forehead', 'left_cheek', 'right_cheek'
        Each value is np.ndarray of shape (3,) [R, G, B] or None.
    """
    smask = _skin_mask(frame)

    forehead = _extract_roi_mean_rgb(frame, landmarks, FOREHEAD_LANDMARKS, smask, "forehead")
    left = _extract_roi_mean_rgb(frame, landmarks, LEFT_CHEEK_LANDMARKS, smask, "left_cheek")
    right = _extract_roi_mean_rgb(frame, landmarks, RIGHT_CHEEK_LANDMARKS, smask, "right_cheek")

    # Ultimate fallback: if ALL regions failed, use the face center region
    if forehead is None and left is None and right is None:
        print("[ROI] WARNING: All ROI regions failed! Using face center fallback.")
        try:
            # Use nose bridge area (landmarks 6, 197, 195, 4, 1, 2, 98, 327)
            fallback_indices = [6, 197, 195, 4, 1, 2, 98, 327]
            valid = [i for i in fallback_indices if i < len(landmarks)]
            if len(valid) >= 3:
                forehead = _extract_roi_mean_rgb(frame, landmarks, valid, None, "fallback")
        except Exception:
            pass

    return {
        "forehead": forehead,
        "left_cheek": left,
        "right_cheek": right,
    }


def get_combined_rgb(roi_signals: dict) -> np.ndarray:
    """Weighted average of ROI signals, favouring the forehead.

    Returns:
        np.ndarray of shape (3,) [R, G, B], or None if no valid ROIs.
    """
    forehead = roi_signals.get("forehead")
    left = roi_signals.get("left_cheek")
    right = roi_signals.get("right_cheek")

    parts = []
    weights = []

    if forehead is not None:
        parts.append(forehead)
        weights.append(0.50)
    if left is not None:
        parts.append(left)
        weights.append(0.25)
    if right is not None:
        parts.append(right)
        weights.append(0.25)

    if not parts:
        return None

    # Normalise weights
    w = np.array(weights)
    w /= w.sum()

    return np.average(parts, axis=0, weights=w)
