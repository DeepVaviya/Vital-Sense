"""
Camera Processor — orchestrates the full CV pipeline per WebSocket session.

Face recognition uses ALIGNED FACE TEMPLATE MATCHING:
  1. Geometric embedding as preliminary filter (fast)
  2. Aligned face template comparison (accurate pixel-level matching)
  Both must pass threshold to confirm identity.
"""
import time
import numpy as np
import cv2
import base64
from collections import deque

from face_detection import (
    FaceDetector, compute_geometric_embedding,
    compute_face_template, compare_face_templates,
)
from roi_extraction import extract_roi_signals, get_combined_rgb
from ippg_signal import IPPGSignalExtractor
from signal_processing import butterworth_bandpass, detect_peaks, compute_heart_rate, estimate_hr_fft
from hrv_analysis import compute_hrv
from respiration_detection import RespirationDetector
from eye_analysis import EyeAnalyzer
from metrics_engine import (
    compute_stress_score, compute_cognitive_load,
    compute_fatigue_risk, compute_mood,
)

print("[STARTUP] camera_processor.py v2.1 loaded - signal fixes applied")

# ── Face matching thresholds ──
GEO_THRESHOLD = 0.85         # Geometric similarity (preliminary filter)
TEMPLATE_THRESHOLD = 0.35    # Face template correlation (main match)

# Re-identify faces every N frames
REIDENTIFY_INTERVAL = 20

# Signal quality — lowered threshold so readings appear faster in real-world conditions
MIN_SIGNAL_QUALITY = 0.8
HR_MIN, HR_MAX = 40.0, 180.0
RESP_MIN, RESP_MAX = 6.0, 30.0
MAX_RMSSD = 120.0
MAX_SDNN = 150.0


def _cosine_similarity(a, b):
    if not a or not b or len(a) != len(b):
        return 0.0
    a_np = np.array(a, dtype=np.float64)
    b_np = np.array(b, dtype=np.float64)
    na, nb = np.linalg.norm(a_np), np.linalg.norm(b_np)
    if na == 0 or nb == 0:
        return 0.0
    return float(np.dot(a_np, b_np) / (na * nb))


class PerFaceState:
    def __init__(self, fps=15.0, face_id=0):
        self.fps = fps
        self.face_id = face_id
        self.ippg = IPPGSignalExtractor(buffer_seconds=30, fps=fps)
        self.respiration = RespirationDetector(buffer_seconds=30, fps=fps)
        self.eye_analyzer = EyeAnalyzer(fps=fps, buffer_seconds=30)
        self.hr_history = deque(maxlen=60)
        self.hrv_timeline = deque(maxlen=60)
        self.frame_count = 0
        self.last_seen = time.time()
        self.ema_state = {"stress": None, "fatigue": None}

        # Identity
        self._id_counter = 999  # Force first-frame ID
        self._cached_identity = {"name": "Unknown", "user_id": None}
        self._identity_locked = False
        self._match_score = 0.0

        self._prev_nose_y = None

    def update_seen(self):
        self.last_seen = time.time()


def _iou(a, b):
    ax1, ay1 = a["x"], a["y"]
    ax2, ay2 = ax1 + a["width"], ay1 + a["height"]
    bx1, by1 = b["x"], b["y"]
    bx2, by2 = bx1 + b["width"], by1 + b["height"]
    ix1, iy1 = max(ax1, bx1), max(ay1, by1)
    ix2, iy2 = min(ax2, bx2), min(ay2, by2)
    inter = max(0, ix2 - ix1) * max(0, iy2 - iy1)
    union = max(0, ax2 - ax1) * max(0, ay2 - ay1) + max(0, bx2 - bx1) * max(0, by2 - by1) - inter
    return inter / union if union > 0 else 0.0


class CameraProcessor:

    IOU_THRESHOLD = 0.3  # Higher threshold to prevent face ID swaps between nearby faces
    STALE_TIMEOUT = 3.0  # Shorter: remove stale face data quickly when person leaves
    MAX_FACES = 5

    def __init__(self, fps=15.0, registered_users=None):
        self.fps = fps
        self.face_detector = FaceDetector(max_faces=self.MAX_FACES)
        self.registered_users = registered_users or []

        # Precompute face templates from registered user photos
        self._registered_templates = {}  # user_id -> numpy template
        self._precompute_templates()

        self.face_states = {}
        self.next_face_id = 0
        self._prev_bboxes = []
        self._smooth_bboxes = {}
        self._EMA_BBOX = 0.85
        self.frame_count = 0

        # Dynamic FPS tracking — measure actual frame arrival rate
        self._frame_times = deque(maxlen=60)
        self._measured_fps = 10.0  # Start conservative — webcams often run ~10 FPS with processing

    def _precompute_templates(self):
        """Load registered user photos and compute aligned face templates."""
        import os
        self._registered_templates = {}

        for user in self.registered_users:
            photo_path = user.get("photo_path", "")
            uid = user.get("user_id", "")
            name = user.get("name", "?")

            if not photo_path or not os.path.exists(photo_path):
                print(f"[FaceMatch] WARN No photo for '{name}' at: {photo_path}")
                continue

            try:
                img = cv2.imread(photo_path)
                if img is None:
                    print(f"[FaceMatch] WARN Could not read photo for '{name}'")
                    continue

                det = FaceDetector(max_faces=1)
                lm = det.detect(img)
                det.close()

                if not lm:
                    print(f"[FaceMatch] WARN No face detected in photo for '{name}'")
                    continue

                template = compute_face_template(img, lm)
                if template is not None:
                    self._registered_templates[uid] = template
                    print(f"[FaceMatch] OK Template for '{name}': {template.shape}")
                else:
                    print(f"[FaceMatch] WARN Template computation failed for '{name}'")

            except Exception as e:
                print(f"[FaceMatch] ERROR for '{name}': {e}")

        print(f"[FaceMatch] Loaded {len(self._registered_templates)}/{len(self.registered_users)} face templates")

    def decode_frame(self, data):
        try:
            if "," in data:
                data = data.split(",", 1)[1]
            raw = base64.b64decode(data)
            arr = np.frombuffer(raw, np.uint8)
            return cv2.imdecode(arr, cv2.IMREAD_COLOR)
        except Exception:
            return None

    def _assign_face_ids(self, bboxes):
        if not bboxes:
            return []
        n = len(bboxes)
        ids = [None] * n
        if self._prev_bboxes:
            pairs = []
            for i, (pid, pb) in enumerate(self._prev_bboxes):
                for j, cb in enumerate(bboxes):
                    v = _iou(pb, cb)
                    if v >= self.IOU_THRESHOLD:
                        pairs.append((v, i, j))
            pairs.sort(reverse=True)
            up, uc = set(), set()
            for _, pi, ci in pairs:
                if pi not in up and ci not in uc:
                    ids[ci] = self._prev_bboxes[pi][0]
                    up.add(pi)
                    uc.add(ci)
        for j in range(n):
            if ids[j] is None:
                ids[j] = self.next_face_id
                self.next_face_id += 1
        self._prev_bboxes = [(ids[j], bboxes[j]) for j in range(n)]
        return ids

    def update_registered_users(self, users):
        self.registered_users = users or []
        self._precompute_templates()
        for st in self.face_states.values():
            st._cached_identity = {"name": "Unknown", "user_id": None}
            st._identity_locked = False

    def _identify_face(self, frame, landmarks, face_id):
        """
        Identify face using geometric + aligned face template matching.

        1. Geometric embedding check (fast preliminary filter)
        2. Aligned face template comparison (accurate pixel-level match)
        3. Both must pass for identity confirmation

        Identity is periodically re-verified to handle face swaps.
        """
        state = self.face_states.get(face_id)
        if state is None:
            return {"name": "Unknown", "user_id": None}

        state._id_counter += 1
        if state._id_counter < REIDENTIFY_INTERVAL:
            return state._cached_identity

        state._id_counter = 0

        if not self.registered_users:
            state._cached_identity = {"name": "Unknown", "user_id": None}
            return state._cached_identity

        # Compute geometric embedding (fast filter)
        geo_emb = compute_geometric_embedding(landmarks)
        if not geo_emb:
            return state._cached_identity

        # Compute live face template
        live_template = compute_face_template(frame, landmarks)

        best_name = "Unknown"
        best_uid = None
        best_score = 0.0

        for user in self.registered_users:
            stored_geo = user.get("face_embedding", [])
            uid = user.get("user_id", "")
            name = user.get("name", "Unknown")

            if not stored_geo:
                continue

            # Step 1: Geometric filter (fast)
            geo_sim = _cosine_similarity(geo_emb, stored_geo)
            if geo_sim < GEO_THRESHOLD:
                continue  # Skip if geometry doesn't roughly match

            # Step 2: Template match (accurate)
            template_score = 0.0
            if live_template is not None and uid in self._registered_templates:
                reg_template = self._registered_templates[uid]
                template_score = compare_face_templates(live_template, reg_template)

            # Must pass template threshold
            if template_score >= TEMPLATE_THRESHOLD:
                combined = geo_sim * 0.3 + template_score * 0.7
                if combined > best_score:
                    best_score = combined
                    best_name = name
                    best_uid = uid

        # Update identity on every re-check (not permanently locked)
        state._cached_identity = {"name": best_name, "user_id": best_uid}
        state._match_score = best_score  # Store confidence for deduplication
        return state._cached_identity

    def _smooth_bbox(self, fid, raw):
        if fid not in self._smooth_bboxes:
            self._smooth_bboxes[fid] = dict(raw)
            return dict(raw)
        p = self._smooth_bboxes[fid]
        a = self._EMA_BBOX
        s = {k: a * raw[k] + (1 - a) * p[k] for k in ("x", "y", "width", "height")}
        self._smooth_bboxes[fid] = s
        return s

    def _get_or_create_state(self, fid):
        if fid not in self.face_states:
            self.face_states[fid] = PerFaceState(fps=self.fps, face_id=fid)
        st = self.face_states[fid]
        st.update_seen()
        # Always propagate current measured FPS to all sub-extractors
        st.fps = self.fps
        st.ippg.fps = self.fps
        st.respiration.fps = self.fps
        st.eye_analyzer.fps = self.fps
        return st

    def _cleanup_stale(self):
        now = time.time()
        stale = [f for f, s in self.face_states.items() if now - s.last_seen > self.STALE_TIMEOUT]
        for f in stale:
            del self.face_states[f]
            self._smooth_bboxes.pop(f, None)

    def _signal_quality(self, sig):
        if len(sig) < 20:
            return 0.0
        # Use windowed FFT for better spectral estimation
        windowed = sig * np.hanning(len(sig))
        fft = np.abs(np.fft.rfft(windowed))
        if len(fft) < 2:
            return 0.0
        # SNR: peak-to-mean ratio in the signal band
        band = fft[1:]  # skip DC
        peak = np.max(band)
        mean_val = np.mean(band)
        return float(peak / max(mean_val, 1e-10))

    def _get_tracking_points(self, lm):
        pts = {}
        if not lm or len(lm) < 400:
            return pts
        try:
            pts['forehead'] = lm[10]; pts['left_cheek'] = lm[117]; pts['right_cheek'] = lm[346]
            pts['nose_tip'] = lm[1]; pts['nose_bridge'] = lm[6]; pts['chin'] = lm[152]
            pts['left_eye_inner'] = lm[133]; pts['left_eye_outer'] = lm[33]
            pts['left_eye_top'] = lm[159]; pts['left_eye_bottom'] = lm[145]
            pts['right_eye_inner'] = lm[362]; pts['right_eye_outer'] = lm[263]
            pts['right_eye_top'] = lm[386]; pts['right_eye_bottom'] = lm[374]
            if len(lm) >= 478:
                pts['left_iris'] = lm[468]; pts['right_iris'] = lm[473]
            pts['left_eyebrow_inner'] = lm[70]; pts['left_eyebrow_mid'] = lm[63]
            pts['left_eyebrow_outer'] = lm[105]
            pts['right_eyebrow_inner'] = lm[300]; pts['right_eyebrow_mid'] = lm[293]
            pts['right_eyebrow_outer'] = lm[334]
            pts['mouth_left'] = lm[61]; pts['mouth_right'] = lm[291]
            pts['mouth_top'] = lm[0]; pts['mouth_bottom'] = lm[17]
            pts['jaw_left'] = lm[234]; pts['jaw_right'] = lm[454]

            # ── Chest respiration tracking points ──
            # Extrapolate below the chin using face geometry
            chin = lm[152]  # chin landmark
            jaw_l = lm[234]  # left jaw
            jaw_r = lm[454]  # right jaw
            forehead = lm[10]
            # Vertical span of the face (forehead to chin)
            face_h = abs(chin[1] - forehead[1])
            # Chest center = chin + 60% of face height downward
            chest_cy = int(chin[1] + face_h * 0.6)
            chest_cx = int(chin[0])
            # Spread using jaw width
            jaw_half_w = abs(jaw_r[0] - jaw_l[0]) // 2
            spread = int(jaw_half_w * 0.7)
            pts['chest_center'] = (chest_cx, chest_cy)
            pts['chest_left'] = (chest_cx - spread, chest_cy)
            pts['chest_right'] = (chest_cx + spread, chest_cy)
            pts['chest_upper'] = (chest_cx, int(chin[1] + face_h * 0.35))
            pts['chest_lower'] = (chest_cx, int(chin[1] + face_h * 0.85))
        except (IndexError, KeyError):
            pass
        return pts

    def _process_face(self, frame, lm, state):
        state.frame_count += 1

        roi = extract_roi_signals(frame, lm)
        rgb = get_combined_rgb(roi)

        state.eye_analyzer.add_landmarks(lm)
        eye = state.eye_analyzer.get_metrics()

        r = {
            "heart_rate": 0.0, "respiration_rate": 0.0,
            "hrv_rmssd": 0.0, "hrv_sdnn": 0.0, "hrv_pnn50": 0.0,
            "hrv_lf_hf_ratio": 0.0, "stress_score": 0.0,
            "cognitive_load": "Low", "fatigue_risk": 0.0, "mood": "Neutral",
            "pulse_waveform": [], "respiration_waveform": [],
            "hrv_timeline": [], "signal_quality": 0.0,
            "rppg_method": "none", "snr_pos": 0.0, "snr_chrom": 0.0,
            "blink_rate": eye.get("blink_rate", 0.0),
            "ear_avg": eye.get("ear_avg", 0.0),
            "gaze_stability": eye.get("gaze_stability", 1.0),
            "gaze_x": eye.get("gaze_x", 0.0), "gaze_y": eye.get("gaze_y", 0.0),
            "perclos": eye.get("perclos", 0.0),
            "saccade_rate": eye.get("saccade_rate", 0.0),
            "pupil_size": eye.get("pupil_size", 0.0),
            "is_blinking": eye.get("is_blinking", False),
        }

        if rgb is None:
            if state.frame_count % 15 == 0:
                print(f"[DIAG #{state.frame_count}] rgb=None! ROI forehead={roi.get('forehead') is not None}, "
                      f"lcheek={roi.get('left_cheek') is not None}, rcheek={roi.get('right_cheek') is not None}")
            return r

        state.ippg.add_sample(rgb)
        # Ensure iPPG extractor uses current measured FPS for all calculations
        state.ippg.fps = self.fps
        raw = state.ippg.compute_chrom()
        state.respiration.add_landmarks(lm)

        # Diagnostic logging every 15 frames
        if state.frame_count % 15 == 0:
            ms = int(self.fps * 1.5)
            print(f"[DIAG #{state.frame_count}] rgb={rgb.round(1)}, buffer={state.ippg.sample_count}, "
                  f"raw_len={len(raw)}, min_needed={ms}, fps={self.fps:.1f}, "
                  f"method={state.ippg.last_method}")

        # Feed BVP signal to respiration detector for RSA-based breathing rate
        if len(raw) > 0:
            state.respiration.add_bvp_signal(raw)

        ny = lm[1][1]
        if state._prev_nose_y is not None:
            motion = abs(ny - state._prev_nose_y)
            if motion > 15:
                state.respiration._ema_alpha = min(0.6, state.respiration._ema_alpha + 0.05)
            else:
                state.respiration._ema_alpha = max(0.25, state.respiration._ema_alpha - 0.01)
        state._prev_nose_y = ny

        ms = 15  # Fixed minimum: start computing after 15 samples (regardless of FPS)
        if len(raw) >= ms:
            filt = butterworth_bandpass(raw, 0.75, 2.5, self.fps, order=3)
            sq = self._signal_quality(filt)
            r["signal_quality"] = round(sq, 2)
            r["rppg_method"] = getattr(state.ippg, 'last_method', 'none')
            r["snr_pos"] = round(getattr(state.ippg, 'last_snr_pos', 0.0), 2)
            r["snr_chrom"] = round(getattr(state.ippg, 'last_snr_chrom', 0.0), 2)

            # FFT-based HR (primary — Welch periodogram)
            fft_hr = estimate_hr_fft(filt, self.fps)

            peaks = detect_peaks(filt, self.fps)

            hr = 0.0
            if sq >= MIN_SIGNAL_QUALITY and (len(peaks) >= 2 or fft_hr > 0):
                hr = compute_heart_rate(peaks, self.fps,
                                        hr_history=list(state.hr_history),
                                        fft_hr=fft_hr)
            elif fft_hr > 0:
                # Lower quality — accept FFT result if plausible or close to history
                if state.hr_history:
                    avg = sum(list(state.hr_history)[-5:]) / min(5, len(state.hr_history))
                    if abs(fft_hr - avg) / max(avg, 1) < 0.20:
                        hr = round(fft_hr, 1)
                elif HR_MIN <= fft_hr <= HR_MAX:
                    # No history yet — accept if in physiological range
                    hr = round(fft_hr, 1)

            if hr > 0:
                hr = max(HR_MIN, min(HR_MAX, hr))
                r["heart_rate"] = round(hr, 1)
                state.hr_history.append(hr)

            hrv = compute_hrv(peaks, self.fps)
            rmssd = min(hrv["rmssd"], MAX_RMSSD) if hrv["rmssd"] > 0 else 0.0
            sdnn = min(hrv["sdnn"], MAX_SDNN) if hrv["sdnn"] > 0 else 0.0
            r["hrv_rmssd"] = rmssd; r["hrv_sdnn"] = sdnn
            r["hrv_pnn50"] = hrv["pnn50"]; r["hrv_lf_hf_ratio"] = hrv["lf_hf_ratio"]
            if 0 < rmssd <= MAX_RMSSD:
                state.hrv_timeline.append(rmssd)

            rr = state.respiration.compute_respiration_rate()
            if rr > 0:
                rr = max(RESP_MIN, min(RESP_MAX, rr))
            r["respiration_rate"] = round(rr, 1)

            r["stress_score"] = compute_stress_score(
                r["heart_rate"], rmssd, rr,
                lf_hf_ratio=hrv["lf_hf_ratio"], pnn50=hrv["pnn50"],
                blink_rate=eye.get("blink_rate", -1),
                saccade_rate=eye.get("saccade_rate", -1),
                gaze_stability=eye.get("gaze_stability", -1),
                ema_state=state.ema_state,
            )
            r["cognitive_load"] = compute_cognitive_load(
                r["heart_rate"], rmssd, rr, list(state.hr_history),
                lf_hf_ratio=hrv["lf_hf_ratio"],
                blink_rate=eye.get("blink_rate", -1),
                gaze_stability=eye.get("gaze_stability", -1),
                saccade_rate=eye.get("saccade_rate", -1),
                pupil_size=eye.get("pupil_size", -1),
            )
            r["fatigue_risk"] = compute_fatigue_risk(
                r["heart_rate"], rmssd, sdnn, rr, list(state.hr_history),
                pnn50=hrv["pnn50"], lf_hf_ratio=hrv["lf_hf_ratio"],
                blink_rate=eye.get("blink_rate", -1),
                perclos=eye.get("perclos", -1),
                ear_avg=eye.get("ear_avg", -1),
                gaze_stability=eye.get("gaze_stability", -1),
                ema_state=state.ema_state,
            )
            r["mood"] = compute_mood(
                r["stress_score"], rmssd, r["heart_rate"],
                lf_hf_ratio=hrv["lf_hf_ratio"], pnn50=hrv["pnn50"],
                blink_rate=eye.get("blink_rate", -1),
                gaze_stability=eye.get("gaze_stability", -1),
            )

            r["pulse_waveform"] = filt[-150:].tolist()
            r["respiration_waveform"] = state.respiration.get_waveform(150)
            r["hrv_timeline"] = list(state.hrv_timeline)[-30:]

        return r

    def process_frame(self, frame_data):
        self.frame_count += 1
        ts = time.time()

        # ── Dynamic FPS measurement ──
        self._frame_times.append(ts)
        if len(self._frame_times) >= 10:
            deltas = np.diff(list(self._frame_times))
            mean_delta = np.median(deltas)  # median is robust to outliers
            if mean_delta > 0:
                measured = 1.0 / mean_delta
                # Clamp to reasonable range and smooth
                measured = max(3.0, min(30.0, measured))
                self._measured_fps = 0.3 * measured + 0.7 * self._measured_fps
                self.fps = round(self._measured_fps, 1)

        frame = self.decode_frame(frame_data)
        if frame is None:
            return self._empty(ts, "Invalid frame data")

        h, w = frame.shape[:2]
        all_lm = self.face_detector.detect_multi(frame)
        if not all_lm:
            return self._empty(ts, "Face not detected. Please look at the camera.")

        raw_bb = [self.face_detector.get_face_bbox(l) for l in all_lm]
        fids = self._assign_face_ids(raw_bb)

        faces, pfv = [], []

        # Phase 1: Identify all faces
        identities = []
        for i, lm in enumerate(all_lm):
            fid = fids[i]
            state = self._get_or_create_state(fid)
            identity = self._identify_face(frame, lm, fid)
            score = getattr(state, '_match_score', 0.0)
            identities.append({"fid": fid, "idx": i, "identity": identity, "score": score, "lm": lm, "state": state})

        # Phase 2: Deduplicate — each user_id can only be assigned to ONE face
        uid_to_best = {}  # user_id -> (index_in_identities, score)
        for idx, entry in enumerate(identities):
            uid = entry["identity"].get("user_id")
            if uid is None:
                continue
            if uid not in uid_to_best or entry["score"] > uid_to_best[uid][1]:
                uid_to_best[uid] = (idx, entry["score"])

        # Clear identities that lost the dedup contest
        for idx, entry in enumerate(identities):
            uid = entry["identity"].get("user_id")
            if uid is not None and uid_to_best.get(uid, (None,))[0] != idx:
                # This face lost — another face is a better match for this user
                entry["identity"] = {"name": "Unknown", "user_id": None}
                entry["state"]._cached_identity = {"name": "Unknown", "user_id": None}

        # Phase 3: Process vitals and build output
        for entry in identities:
            i = entry["idx"]
            fid = entry["fid"]
            lm = entry["lm"]
            state = entry["state"]
            identity = entry["identity"]

            sb = self._smooth_bbox(fid, raw_bb[i])
            vitals = self._process_face(frame, lm, state)

            tp = self._get_tracking_points(lm)
            ntp = {n: {"x": p[0] / w, "y": p[1] / h} for n, p in tp.items()}
            roi = self.face_detector.get_roi_points(lm)

            faces.append({
                "face_id": fid, "face_index": i,
                "bbox": {"x": sb["x"]/w, "y": sb["y"]/h, "width": sb["width"]/w, "height": sb["height"]/h},
                "roi_points": {k: {"x": v["x"]/w, "y": v["y"]/h} for k, v in roi.items()} if roi else {},
                "tracking_points": ntp,
                "name": identity["name"], "user_id": identity["user_id"],
            })
            pfv.append({"face_id": fid, "face_index": i,
                        "recognized_name": identity["name"],
                        "recognized_user_id": identity["user_id"], **vitals})

        self._cleanup_stale()

        pv = pfv[0] if pfv else {}
        ps = self.face_states.get(fids[0]) if fids else None
        el = (ps.frame_count / max(self.fps, 1)) if ps else 0
        msg = None
        if pv.get("heart_rate", 0) == 0 and el < 1.5:
            msg = f"Collecting signal data... {max(0, 1.5 - el):.0f}s remaining"

        defaults = {
            "heart_rate": 0.0, "respiration_rate": 0.0,
            "hrv_rmssd": 0.0, "hrv_sdnn": 0.0, "hrv_pnn50": 0.0,
            "hrv_lf_hf_ratio": 0.0, "stress_score": 0.0,
            "cognitive_load": "Low", "fatigue_risk": 0.0, "mood": "Neutral",
            "pulse_waveform": [], "respiration_waveform": [],
            "hrv_timeline": [], "signal_quality": 0.0,
            "rppg_method": "none", "snr_pos": 0.0, "snr_chrom": 0.0,
            "blink_rate": 0.0, "ear_avg": 0.0, "gaze_stability": 1.0,
            "gaze_x": 0.0, "gaze_y": 0.0, "perclos": 0.0,
            "saccade_rate": 0.0, "pupil_size": 0.0, "is_blinking": False,
        }

        return {
            "face_detected": True, "face_count": len(all_lm),
            "faces": faces, "per_face_vitals": pfv,
            "message": msg, "timestamp": ts,
            "measured_fps": round(self.fps, 1),
            **{k: pv.get(k, v) for k, v in defaults.items()},
        }

    def _empty(self, ts, msg):
        return {
            "face_detected": False, "face_count": 0,
            "faces": [], "per_face_vitals": [],
            "message": msg, "timestamp": ts,
            "heart_rate": 0.0, "respiration_rate": 0.0,
            "hrv_rmssd": 0.0, "hrv_sdnn": 0.0, "hrv_pnn50": 0.0,
            "hrv_lf_hf_ratio": 0.0, "stress_score": 0.0,
            "cognitive_load": "Low", "fatigue_risk": 0.0, "mood": "Neutral",
            "pulse_waveform": [], "respiration_waveform": [],
            "hrv_timeline": [], "signal_quality": 0.0,
            "rppg_method": "none", "snr_pos": 0.0, "snr_chrom": 0.0,
            "blink_rate": 0.0, "ear_avg": 0.0, "gaze_stability": 1.0,
            "gaze_x": 0.0, "gaze_y": 0.0, "perclos": 0.0,
            "saccade_rate": 0.0, "pupil_size": 0.0, "is_blinking": False,
        }

    def cleanup(self):
        self.face_detector.close()
        self.face_states.clear()
