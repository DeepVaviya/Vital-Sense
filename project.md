# VitalSense -- Contactless Real-Time Physiological Monitoring System

## Table of Contents

1. [Project Overview](#1-project-overview)
2. [Architecture](#2-architecture)
3. [Technology Stack](#3-technology-stack)
4. [Project Structure](#4-project-structure)
5. [Pages & User Interface](#5-pages--user-interface)
6. [Core Pipeline: Camera to Vitals](#6-core-pipeline-camera-to-vitals)
7. [Detailed Calculation Breakdown](#7-detailed-calculation-breakdown)
   - 7.1 [ROI Extraction](#71-roi-extraction)
   - 7.2 [rPPG Signal Extraction (iPPG)](#72-rppg-signal-extraction-ippg)
   - 7.3 [Heart Rate (HR)](#73-heart-rate-hr)
   - 7.4 [Heart Rate Variability (HRV)](#74-heart-rate-variability-hrv)
   - 7.5 [Respiration Rate (RR)](#75-respiration-rate-rr)
   - 7.6 [Eye Analysis](#76-eye-analysis)
   - 7.7 [Stress Score](#77-stress-score-0-100)
   - 7.8 [Cognitive Load](#78-cognitive-load)
   - 7.9 [Fatigue Risk](#79-fatigue-risk-0-100)
   - 7.10 [Mood Detection](#710-mood-detection)
8. [Face Detection & Identification](#8-face-detection--identification)
9. [Display & Visualization](#9-display--visualization)
10. [Data Persistence & Analytics](#10-data-persistence--analytics)
11. [AI Integration](#11-ai-integration)
12. [API Reference](#12-api-reference)
13. [Deployment](#13-deployment)
14. [End-to-End Data Flow Diagram](#14-end-to-end-data-flow-diagram)

---

## 1. Project Overview

**VitalSense** is a real-time, contactless physiological monitoring web application that extracts vital signs from a user's face using a standard webcam. It leverages **remote photoplethysmography (rPPG)** -- detecting subtle skin color changes caused by blood flow -- along with computer vision-based facial landmark analysis to measure:

| Vital Sign | Method | Range |
|---|---|---|
| Heart Rate (HR) | rPPG signal analysis (FFT + peak detection) | 40-180 BPM |
| Heart Rate Variability (HRV) | Inter-beat interval analysis (time + frequency domain) | RMSSD, SDNN, pNN50, LF/HF |
| Respiration Rate (RR) | Dual-channel: facial landmark motion + BVP-derived RSA | 6-30 BPM |
| Stress Score | Multi-factor model (HRV, HR, RR, eye metrics) | 0-100 |
| Cognitive Load | Additive scoring (HRV, HR, blink, gaze, pupil) | Low / Medium / High |
| Fatigue Risk | Multi-factor model (HRV, PERCLOS, EAR, HR drift) | 0-100 |
| Mood | 2D arousal-valence model | Happy / Calm / Stressed / Anxious / Fatigued / Neutral |
| Blink Rate | Eye Aspect Ratio (EAR) threshold detection | blinks/min |
| Gaze Stability | Iris-to-eye position variance | 0-100% |
| Drowsiness (PERCLOS) | % eye closure over 60-second window | 0-100% |

The system supports **multi-face tracking** (up to 5 simultaneous faces), **face recognition** for identity-linked analytics, and **historical data storage** with AI-powered health suggestions.

---

## 2. Architecture

```
+---------------------+          WebSocket (base64 JPEG @ ~15 FPS)          +---------------------+
|                     | -------------------------------------------------> |                     |
|   React Frontend    |                                                     |   FastAPI Backend    |
|   (Vite + Tailwind) | <------------------------------------------------- |   (Python + uvicorn) |
|                     |          JSON vitals response per frame             |                     |
+---------------------+                                                     +---------------------+
         |                                                                           |
         |  REST API calls                                                           |
         |  - /api/register-face                                                     |
         |  - /api/store-vitals                                                      |
         |  - /api/analytics/{id}                                                    |
         |  - /api/predictions/{id}                                                  |
         |  - /api/ai-suggestions                                                    |
         |                                                                           |
         v                                                                           v
+---------------------+                                                     +---------------------+
| Browser localStorage|                                                     |   MongoDB (Atlas)   |
| - user session info |                                                     |   - registered_users|
+---------------------+                                                     |   - user_vitals     |
                                                                            +---------------------+
```

**Communication Model:**
- **Real-time monitoring**: WebSocket-based bidirectional streaming. The frontend captures webcam frames as base64 JPEG at ~15 FPS and sends them to the backend. The backend processes each frame through the full CV pipeline and returns JSON vitals data.
- **Data persistence**: REST API calls store averaged vitals readings every 10 seconds for recognized users.
- **Analytics**: REST API serves historical data, AI predictions, and LLM-generated health suggestions.

---

## 3. Technology Stack

### Backend
| Component | Technology |
|---|---|
| Web Framework | FastAPI (async Python) |
| Server | Uvicorn (ASGI) |
| Computer Vision | OpenCV, MediaPipe Face Landmarker (478 landmarks) |
| Signal Processing | SciPy (Butterworth filter, Welch FFT, find_peaks), NumPy |
| Database | MongoDB via Motor (async driver) |
| Authentication | JWT (python-jose) + bcrypt |
| AI / LLM | Groq API (Llama 3.3 70B), Google Gemini 2.0 Flash |

### Frontend
| Component | Technology |
|---|---|
| UI Framework | React 19 + Vite |
| Styling | Tailwind CSS + custom CSS (glassmorphism theme) |
| Charts | Recharts (line charts, area charts) |
| Animations | Framer Motion |
| Icons | Lucide React |
| Camera | HTML5 getUserMedia API |
| Routing | React Router DOM v7 |

### Infrastructure
| Component | Technology |
|---|---|
| Containerization | Docker + Docker Compose |
| Web Server | Nginx (static files + reverse proxy) |
| Database | MongoDB 7.0 |

---

## 4. Project Structure

```
wiet-hackverse-2-0-.../
|
|-- docker-compose.yml              # Multi-container orchestration
|
|-- backend/
|   |-- Dockerfile                  # Python 3.11-slim container
|   |-- requirements.txt            # Python dependencies
|   |-- main.py                     # FastAPI app, WebSocket endpoint, AI suggestions
|   |-- auth.py                     # JWT authentication (register/login)
|   |-- database.py                 # MongoDB async connection
|   |-- models.py                   # Pydantic request/response models
|   |-- camera_processor.py         # Central orchestrator: frame decode, multi-face pipeline
|   |-- face_detection.py           # MediaPipe face landmarker, geometric embeddings
|   |-- face_registration.py        # Face registration API, identity matching, vitals storage
|   |-- roi_extraction.py           # Skin ROI extraction (forehead, cheeks)
|   |-- ippg_signal.py              # iPPG algorithms: POS, CHROM, GREEN with SNR fusion
|   |-- signal_processing.py        # Butterworth filter, Welch FFT, peak detection
|   |-- hrv_analysis.py             # HRV: RMSSD, SDNN, pNN50, Lomb-Scargle LF/HF
|   |-- respiration_detection.py    # Dual-channel respiration detection
|   |-- eye_analysis.py             # EAR blink, gaze, PERCLOS, saccades, pupil size
|   |-- metrics_engine.py           # Derived metrics: stress, cognitive load, fatigue, mood
|   |-- prediction_engine.py        # AI predictions: stress trends, anomaly detection
|   |-- gemini_service.py           # Gemini Vision API (face verify, health observe)
|   |-- face_landmarker.task        # MediaPipe model binary
|   |-- photos/                     # Stored registered face photos
|
|-- frontend/
    |-- Dockerfile                  # Node 20 + Nginx container
    |-- nginx.conf                  # Reverse proxy config
    |-- package.json                # React 19 + recharts + framer-motion + tailwindcss
    |-- vite.config.js              # Vite + React plugin
    |-- tailwind.config.js          # Dark theme color palette
    |-- index.html                  # HTML entry point
    |-- src/
        |-- main.jsx                # React entry point
        |-- App.jsx                 # Router: /, /register, /monitor, /analytics
        |-- index.css               # Global dark glassmorphism theme
        |-- pages/
        |   |-- Landing.jsx         # Marketing/info landing page
        |   |-- Register.jsx        # 3-step face registration wizard
        |   |-- Monitor.jsx         # Real-time monitoring dashboard
        |   |-- Analytics.jsx       # Historical analytics + AI suggestions
        |   |-- Login.jsx           # Email/password login (legacy, unused)
        |-- components/
            |-- Navbar.jsx          # Top navigation bar
            |-- CameraFeed.jsx      # Webcam capture + frame streaming
            |-- FaceBoxes.jsx       # Face bounding box + landmark overlays
            |-- HeatmapView.jsx     # Stress heatmap canvas overlay
            |-- VitalsPanel.jsx     # 12 vital sign metric cards
            |-- Charts.jsx          # Real-time waveform charts + signal info
```

---

## 5. Pages & User Interface

### 5.1 Landing Page (`/`)
Marketing page with three sections:
- **Hero**: Title, description, CTA button to start monitoring
- **Features Grid**: 6 feature cards (Real-Time Monitoring, Face Recognition, Advanced Analytics, AI-Powered, Multi-Person, Privacy First)
- **How It Works**: 4-step pipeline (Camera Capture -> Face Detection -> Signal Extraction -> Analysis)

### 5.2 Registration Page (`/register`)
3-step registration wizard:
1. **Details Form**: Name and age input fields
2. **Camera Capture**: Live webcam feed with face positioning guide overlay. User clicks to capture a photo.
3. **Submission**: Photo + derived 128-dim face embedding sent to `/api/register-face`. On success, user info is saved to localStorage and the user is redirected to the monitor.

**Client-side face embedding extraction** (`extractSimpleEmbedding()`):
- Resizes captured face to 128x128 pixels
- Divides into 8x8 grid of 16x16 blocks
- Computes average R and G channel values per block (normalized 0-1)
- Produces 64 blocks x 2 channels = 128 dimensions
- L2-normalizes to unit vector

### 5.3 Monitor Page (`/monitor`)
The core dashboard with a 12-column grid layout:

**Left Panel (5 cols):**
- Camera feed with overlay options (Normal / Signal / Heatmap views)
- Person tabs for multi-face selection (name + live HR per tab)

**Right Panel (7 cols):**
- **Vitals Panel**: 12 metric cards in a grid
- **Charts**: 3 real-time waveforms (BVP pulse, respiration, HRV timeline)
- **Signal Info Bar**: rPPG method, signal quality, SNR values, measured FPS

**WebSocket lifecycle:**
1. User clicks "Start Monitoring"
2. WebSocket connects to `ws://host:8000/ws/monitor`
3. Camera captures frames at ~15 FPS (JPEG quality 0.7)
4. Frames sent as base64 strings via WebSocket
5. Server returns JSON vitals per frame
6. Frontend updates vitals cards, charts, and overlays in real-time
7. Every 10 seconds, averaged vitals are auto-saved for recognized users

### 5.4 Analytics Page (`/analytics`)
Historical analytics dashboard:
- **User Selector**: Dropdown of all registered users
- **Time Range**: Daily / Weekly / Monthly toggles
- **Summary Cards**: 5 cards showing avg/min/max for HR, HRV, Stress, RR, Fatigue
- **Area Charts**: 5 time-series charts (one per metric) using Recharts
- **AI Health Suggestions**: Groq LLM-generated health advice based on latest vitals
- **AI Predictions**: Stress trend direction, fatigue level assessment, anomaly alerts

---

## 6. Core Pipeline: Camera to Vitals

Each webcam frame goes through the following stages:

```
Webcam Frame (base64 JPEG)
    |
    v
[1] Frame Decode:       base64 -> bytes -> numpy array -> cv2 BGR image
    |
    v
[2] FPS Measurement:    Rolling median of frame timestamps, EMA smoothed
    |
    v
[3] Face Detection:     MediaPipe Face Landmarker -> 478 landmarks per face (up to 5)
    |
    v
[4] Face Tracking:      IoU-based matching of bounding boxes across frames
    |                   (threshold: 0.3, stale cleanup: 2.0 sec)
    |
    v
[5] Face Identification: Geometric embedding (147-dim) + template matching (96x96 NCC)
    |                    (runs every 20 frames, locks identity after confident match)
    |
    v
[6] Per-Face Processing:
    |
    +---> [6a] ROI Extraction:      Forehead(50%) + Left Cheek(25%) + Right Cheek(25%)
    |                               HSV skin mask applied, combined to single RGB sample
    |
    +---> [6b] iPPG Signal:         POS + CHROM algorithms, SNR-weighted fusion
    |                               (GREEN fallback if both SNR < 2.0)
    |
    +---> [6c] Bandpass Filter:     3rd-order Butterworth [0.75, 2.5] Hz (zero-phase)
    |
    +---> [6d] Heart Rate:          Welch FFT (primary) + Peak detection (secondary)
    |                               Hybrid fusion + EMA smoothing -> 40-180 BPM
    |
    +---> [6e] HRV:                 IBI -> RMSSD, SDNN, pNN50
    |                               Lomb-Scargle -> LF/HF ratio
    |
    +---> [6f] Respiration:         Landmark motion + BVP RSA
    |                               Confidence-weighted fusion -> 6-30 BPM
    |
    +---> [6g] Eye Analysis:        EAR blinks, gaze stability, PERCLOS, saccades, pupil
    |
    +---> [6h] Derived Metrics:     Stress(0-100), Cognitive Load, Fatigue(0-100), Mood
    |
    v
[7] JSON Response -> WebSocket -> Frontend display
```

---

## 7. Detailed Calculation Breakdown

### 7.1 ROI Extraction

**File:** `backend/roi_extraction.py`

The blood volume pulse (BVP) signal is extracted from skin regions where blood vessels are close to the surface.

**Three ROI regions are defined using MediaPipe landmark indices:**

| Region | Landmarks Used | Weight |
|---|---|---|
| Forehead | 33 landmarks forming a polygon across the forehead | 50% |
| Left Cheek | 14 landmarks on the left cheek | 25% |
| Right Cheek | 14 landmarks on the right cheek | 25% |

**Extraction process per region:**
1. Polygon vertices from face landmarks are converted to pixel coordinates
2. A binary mask is created from the polygon using `cv2.fillPoly`
3. An **HSV skin-color mask** filters non-skin pixels:
   - Hue: 0-35 (skin tones)
   - Saturation: 20-255 (not washed out)
   - Value: 50-255 (not too dark)
4. Both masks are combined (AND operation)
5. Mean R, G, B channel values are computed over the masked pixels
6. If insufficient pixels (<50), the region is skipped

**Combined RGB:**
```
combined_rgb = 0.50 * forehead_rgb + 0.25 * left_cheek_rgb + 0.25 * right_cheek_rgb
```

The forehead is weighted highest because it has the most uniform skin surface and strongest pulsatile signal.

---

### 7.2 rPPG Signal Extraction (iPPG)

**File:** `backend/ippg_signal.py`

The raw RGB time-series from ROI extraction is processed by three rPPG algorithms to extract the Blood Volume Pulse (BVP) signal.

#### Algorithm 1: POS (Plane-Orthogonal-to-Skin)
**Reference:** Wang et al. (2017), IEEE Trans. Biomed. Eng.

The POS algorithm projects the RGB signal onto a plane orthogonal to the skin tone direction, isolating the pulsatile component from specular and motion artifacts.

**Step-by-step:**
1. Input: `(N, 3)` RGB time-series matrix
2. Sliding window of **1.6 seconds** (ceil(1.6 x fps) samples)
3. For each window `[m, n]`:
   - Compute temporal mean RGB: `mean_rgb = mean(window, axis=0)`
   - Temporal normalization: `Cn = (window / mean_rgb).T` -> shape (3, window_length)
   - Project onto POS plane using matrix `P`:
     ```
     P = [[0, 1, -1],
          [-2, 1, 1]]
     S = P @ Cn     (shape: 2 x window_length)
     ```
   - Combine projections: `h = S[0] + (std(S[0]) / std(S[1])) * S[1]`
   - Subtract mean and overlap-add: `H[m:n] += (h - mean(h))`
4. **Tarvainen detrending** (lambda=100):
   - Regularized least-squares detrending to remove slow illumination drift
   - Uses second-order difference penalty matrix `D`
   - Formula: `signal_detrended = (I - inv(I + lam^2 * D^T @ D)) @ signal`
5. Bandpass filter: 1st-order Butterworth [0.75, 2.5] Hz (zero-phase `filtfilt`)

#### Algorithm 2: CHROM (Chrominance-based)
**Reference:** De Haan & Jeanne (2013), IEEE Trans. Biomed. Eng.

CHROM exploits the different chrominance channels to separate the pulse signal from motion noise.

**Step-by-step:**
1. Input: `(N, 3)` RGB time-series
2. Sliding window of **1.6 seconds**, 50% overlap
3. Pre-computed 3rd-order Butterworth bandpass [0.7, 2.5] Hz
4. For each window:
   - Temporal normalization: `R_norm, G_norm, B_norm = (rgb / mean_rgb).T`
   - Chrominance projections:
     ```
     Xs = 3.0 * R_norm - 2.0 * G_norm
     Ys = 1.5 * R_norm + G_norm - 1.5 * B_norm
     ```
   - Bandpass filter both `Xs` and `Ys` independently
   - Alpha-ratio: `alpha = std(Xf) / std(Yf)`
   - Window signal: `SWin = (Xf - alpha * Yf) * hanning_window`
   - Overlap-add accumulation with Hanning windowing

#### Algorithm 3: GREEN (Fallback)
**Reference:** Verkruysse et al. (2008), Opt. Express

Simply uses the **mean green channel** intensity over time. This is the most basic rPPG approach but works when lighting is favorable. Used as a fallback when both POS and CHROM produce low-quality signals.

#### SNR-Weighted Fusion

The final BVP signal is produced by fusing POS and CHROM:

1. Both algorithms run independently on the same RGB buffer
2. **Spectral SNR** is computed for each:
   ```
   SNR = peak_power_in_HR_band / mean_power_in_HR_band
   ```
   (Using zero-padded FFT with at least 256 points, HR band = [0.75, 2.5] Hz)
3. Decision logic:
   - If **both SNR < 2.0**: Fall back to GREEN channel (detrended + bandpass filtered)
   - Otherwise: **Weighted fusion**:
     ```
     w_pos = max(snr_pos, 0.01)
     w_chrom = max(snr_chrom, 0.01)
     bvp = (w_pos * pos_signal + w_chrom * chrom_signal) / (w_pos + w_chrom)
     ```
4. The method used ("POS+CHROM" or "GREEN") and both SNR values are reported to the frontend

---

### 7.3 Heart Rate (HR)

**File:** `backend/signal_processing.py`

Heart rate is computed using a **dual-path approach** combining FFT (frequency domain) and peak detection (time domain).

#### Path 1: FFT-based HR (`estimate_hr_fft`)
1. Requires at least 2 seconds of filtered BVP signal
2. **Welch's periodogram**: ~4-second segments, 75% overlap, linear detrend
3. Mask spectrum to valid HR band: [0.75, 2.5] Hz (45-150 BPM)
4. Find frequency with maximum spectral power
5. Convert: `HR_fft = peak_frequency * 60.0 BPM`

#### Path 2: Peak Detection (`detect_peaks`)
1. Compute minimum inter-peak distance from max BPM (180 BPM)
2. **Adaptive thresholds:**
   - Height threshold: `median(signal) + 0.1 * std(signal)`
   - Prominence threshold: `max(0.15 * std(signal), 0.005)`
3. `scipy.signal.find_peaks()` with these parameters
4. **Outlier rejection (Malik's criterion):**
   - Pass 1: Remove peaks with inter-beat interval (IBI) outside [0.33, 1.43] seconds (42-180 BPM)
   - Pass 2: Remove peaks where IBI deviates more than 20% from median IBI

#### Hybrid Fusion (`compute_heart_rate`)
Combines both paths for robustness:

```
IF both FFT_HR and peak_HR are available:
    IF |FFT_HR - peak_HR| < 15 BPM:
        HR = 0.7 * FFT_HR + 0.3 * peak_HR     (weighted blend)
    ELSE:
        HR = whichever is closer to most recent historical HR
ELSE:
    HR = whichever is available

EMA smoothing (alpha = 0.3):
    IF |new_HR - prev_HR| < 20 BPM:
        HR = 0.3 * new_HR + 0.7 * prev_HR

Final clamp: [40.0, 180.0] BPM
```

---

### 7.4 Heart Rate Variability (HRV)

**File:** `backend/hrv_analysis.py`

HRV quantifies the variation between successive heartbeats, reflecting autonomic nervous system activity.

#### Inter-Beat Interval (IBI) Extraction
1. Peak positions (from section 7.3) converted to time intervals: `IBI = diff(peak_indices) / sampling_rate`
2. Filter to physiological range: [0.30, 1.50] seconds (40-200 BPM)
3. Outlier rejection: remove IBIs > 2 standard deviations from median
4. Convert to milliseconds

#### Time-Domain Metrics

**RMSSD** (Root Mean Square of Successive Differences):
```
RMSSD = sqrt( mean( (IBI[n] - IBI[n-1])^2 ) )
```
- Clamped to max 150 ms
- Reflects **short-term (parasympathetic/vagal) HRV**
- Low RMSSD (<15 ms) indicates high stress; high RMSSD (>60 ms) indicates relaxation

**SDNN** (Standard Deviation of NN Intervals):
```
SDNN = std(IBI, ddof=1)
```
- Clamped to max 200 ms
- Reflects **overall HRV** (both sympathetic and parasympathetic)

**pNN50** (Percentage of Successive Differences > 50ms):
```
pNN50 = (count(|IBI[n] - IBI[n-1]| > 50ms) / total_successive_diffs) * 100
```
- Reflects parasympathetic activity
- Very low (<3%) suggests autonomic rigidity; high (>25%) suggests healthy vagal tone

#### Frequency-Domain Metrics

**Lomb-Scargle Periodogram** is used instead of FFT because IBI series are **unevenly spaced** in time.

For each angular frequency omega:
```
tau = atan2(sum(sin(2*w*t)), sum(cos(2*w*t))) / (2*w)

power(w) = (1/2) * [
    (sum(x * cos(w*(t-tau))))^2 / sum(cos(w*(t-tau))^2) +
    (sum(x * sin(w*(t-tau))))^2 / sum(sin(w*(t-tau))^2)
]
```

Evaluated at 500 frequency points from 0.01 to 0.5 Hz.

**Two frequency bands are integrated:**

| Band | Frequency Range | Physiological Meaning |
|---|---|---|
| LF (Low Frequency) | 0.04 - 0.15 Hz | Sympathetic + parasympathetic activity |
| HF (High Frequency) | 0.15 - 0.40 Hz | Parasympathetic (vagal) activity |

**LF/HF Ratio** = `lf_power / hf_power`
- < 0.5: Parasympathetic dominance (relaxed/drowsy)
- 0.5 - 2.0: Balanced autonomic tone
- 2.0 - 4.0: Mild sympathetic activation (mild stress)
- > 4.0: Sympathetic dominance (high stress/fight-or-flight)

---

### 7.5 Respiration Rate (RR)

**File:** `backend/respiration_detection.py`

Respiration is detected through two independent channels that are fused for accuracy.

#### Channel 1: Facial Landmark Vertical Micro-Motion

Breathing causes subtle vertical displacement of facial features:

**Tracked landmarks:**
| Landmark | Index | Weight |
|---|---|---|
| Nose tip | 1 | 0.2 |
| Chin | 152 | 0.3 |
| Forehead | 10 | 0.2 |
| Left jaw | 234 | 0.15 |
| Right jaw | 454 | 0.15 |

**Process:**
1. Track Y-coordinate of each landmark over time
2. Subtract baseline (mean of first 5 samples) for displacement
3. Weighted combination of displacements
4. Two sub-methods applied:
   - **FFT-based**: Apply Hanning window, compute FFT, find dominant frequency in [0.1, 0.5] Hz (6-30 BPM), compute SNR as confidence
   - **Peak-counting**: `scipy.signal.find_peaks` with min distance 2 seconds, validate intervals in [2.0, 10.0] seconds, coefficient of variation as confidence
5. Higher-confidence sub-method wins

#### Channel 2: BVP-Derived Respiratory Sinus Arrhythmia (RSA)

Breathing naturally modulates heart rate (speeds up during inhalation, slows during exhalation). This modulation can be extracted from the BVP signal:

1. Take the rPPG BVP signal
2. Apply **2nd-order Butterworth bandpass** in the respiratory band: [0.15, 0.5] Hz (9-30 BPM)
3. Compute **Welch periodogram** (8-second segments, 75% overlap)
4. Find dominant frequency in [0.1, 0.5] Hz
5. Compute SNR for confidence

#### Fusion
```
IF both channels available:
    RR = (bvp_conf * bvp_rate + landmark_conf * landmark_rate) / (bvp_conf + landmark_conf)
ELSE:
    RR = whichever channel is available

Clamp to [6, 30] BPM
EMA smoothing (alpha = 0.25)
```

---

### 7.6 Eye Analysis

**File:** `backend/eye_analysis.py`

Eye metrics are computed from MediaPipe's 478 face landmarks, specifically the iris landmarks (indices 468-477).

#### Eye Aspect Ratio (EAR)
Measures how "open" the eye is:
```
EAR = (|p2 - p6| + |p3 - p5|) / (2 * |p1 - p4|)
```
Where p1-p6 are the six eye landmarks (inner corner, outer corner, top, bottom lid points).

- **Blink detection**: EAR drops below 0.24 for at least 1 frame
- **Blink rate**: Count of blinks in 60-second rolling window, converted to blinks/minute

#### Gaze Tracking
1. Iris center computed from landmarks 468-472 (left) and 473-477 (right)
2. Gaze position = iris center relative to eye corner bounds, normalized to [0, 1]
3. **Gaze stability** = 1.0 - std(gaze_positions) over rolling window

#### PERCLOS (Percentage of Eye Closure)
Standard drowsiness metric (Dinges & Grace):
```
PERCLOS = (frames_where_EAR < 0.24) / total_frames_in_60s_window * 100
```
- > 40%: Severe drowsiness
- > 25%: Moderate drowsiness
- > 15%: Mild drowsiness

#### Saccade Detection
Rapid eye movements:
- Detected when gaze shift between frames exceeds 0.08 (normalized units)
- Rate = saccades per minute over a 60-second window

#### Pupil Size
```
pupil_size = iris_diameter / inter_eye_distance
```
Relative measure; larger pupils may indicate higher cognitive load or arousal.

---

### 7.7 Stress Score (0-100)

**File:** `backend/metrics_engine.py` -- `compute_stress_score()`

Multi-factor additive model starting from a **baseline of 35**:

| Factor | Condition | Points | Rationale |
|---|---|---|---|
| **LF/HF Ratio** | > 4.0 | +25 | Strong sympathetic dominance |
| | > 2.5 | +18 | Moderate sympathetic activation |
| | > 1.5 | +10 | Mild stress response |
| | > 1.0 | +5 | Slight elevation |
| | < 0.5 | -10 | Parasympathetic dominance (relaxation) |
| **RMSSD** | < 15 ms | +20 | Very low vagal tone (high stress) |
| | < 25 ms | +12 | Low vagal tone |
| | < 40 ms | +5 | Below average |
| | > 80 ms | -15 | Strong vagal tone (deep relaxation) |
| | > 60 ms | -10 | Good vagal tone |
| **Heart Rate** | > 100 BPM | +min((HR-100)*0.6, 15) | Tachycardia stress response |
| | > 85 BPM | +(HR-85)*0.5 | Elevated HR |
| | < 60 BPM | -(60-HR)*0.3 | Relaxed resting HR |
| **Respiration Rate** | > 22 BPM | +min((RR-22)*1.5, 10) | Rapid breathing stress marker |
| | < 12 BPM | -5 | Calm, slow breathing |
| **pNN50** | < 3% | +10 | Autonomic rigidity |
| | < 10% | +5 | Below normal |
| | > 30% | -5 | Healthy parasympathetic activity |
| **Blink Rate** | > 30/min | +8 | Stress-elevated blinking |
| | > 25/min | +4 | Elevated blinking |
| | < 8/min | -3 | Relaxed, focused |
| **Saccade Rate** | > 60/min | +5 | High visual scanning (anxiety) |
| | > 40/min | +3 | Elevated scanning |
| **Gaze Stability** | < 0.3 | +4 | Unstable gaze (agitation) |
| | < 0.5 | +2 | Moderately unstable |
| | > 0.85 | -2 | Very stable (calm) |

```
stress_score = clamp(baseline + sum_of_factors, 0, 100)
EMA smoothed (alpha = 0.25) per face
```

---

### 7.8 Cognitive Load

**File:** `backend/metrics_engine.py` -- `compute_cognitive_load()`

Additive point-scoring system:

| Factor | Condition | Points |
|---|---|---|
| LF/HF Ratio | > 3.0 | +3 |
| | > 1.5 | +2 |
| | > 0.8 | +1 |
| RMSSD | < 25 ms | +3 |
| | < 50 ms | +1 |
| | >= 50 ms | -1 |
| Heart Rate | > 90 BPM | +2 |
| | > 75 BPM | +1 |
| HR Trend (slope) | > 1.0 | +2 |
| | > 0.5 | +1 |
| Respiration | > 22 BPM | +2 |
| | > 18 BPM | +1 |
| Blink Rate | < 8/min | +3 (focused attention suppresses blinking) |
| | < 12/min | +2 |
| | > 25/min | -1 |
| Gaze Stability | > 0.85 | +2 (focused fixation) |
| | > 0.7 | +1 |
| | < 0.3 | -1 |
| Pupil Size | > 0.35 | +2 (dilation = cognitive effort) |
| | > 0.28 | +1 |

**Classification:**
- Score >= 6 -> **"High"**
- Score >= 3 -> **"Medium"**
- Score < 3 -> **"Low"**

---

### 7.9 Fatigue Risk (0-100)

**File:** `backend/metrics_engine.py` -- `compute_fatigue_risk()`

Multi-factor additive model starting from a **baseline of 25**:

| Factor | Condition | Points | Rationale |
|---|---|---|---|
| **RMSSD** | < 15 ms | +20 | Autonomic exhaustion |
| | < 25 ms | +12 | Low HRV |
| | < 35 ms | +5 | Below average |
| | > 70 ms | -10 | Good recovery |
| **SDNN** | < 20 ms | +10 | Very low overall variability |
| | < 30 ms | +5 | Low variability |
| | > 60 ms | -5 | Good variability |
| **pNN50** | < 3% | +10 | Autonomic rigidity |
| | < 10% | +5 | Below normal |
| | > 25% | -5 | Healthy |
| **LF/HF extreme** | > 5.0 | +10 | Burnout-level sympathetic |
| | < 0.3 | +8 | Drowsiness-level parasympathetic |
| **HR variance** | > 25 | +8 | Unstable cardiovascular control |
| **HR drift** | > 10 BPM | +8 | Progressive fatigue drift |
| **Breathing** | < 8 or > 25 BPM | +10 | Abnormal respiratory pattern |
| | < 10 or > 20 BPM | +5 | Borderline pattern |
| **PERCLOS** | > 40% | +20 | Severe drowsiness (Dinges standard) |
| | > 25% | +15 | Moderate drowsiness |
| | > 15% | +8 | Mild drowsiness |
| | > 8% | +3 | Early drowsiness |
| **EAR Average** | < 0.18 | +8 | Droopy eyelids |
| | < 0.22 | +4 | Partially closed eyes |
| **Blink Rate** | > 30/min | +5 | Fatigue-elevated blinking |
| | > 25/min | +3 | Elevated |
| **Gaze Stability** | < 0.3 | +4 | Unfocused gaze |
| | < 0.5 | +2 | Drifting attention |

```
fatigue_risk = clamp(baseline + sum_of_factors, 0, 100)
EMA smoothed (alpha = 0.25) per face
```

---

### 7.10 Mood Detection

**File:** `backend/metrics_engine.py` -- `compute_mood()`

Uses a **2-dimensional arousal-valence circumplex model** from affective computing.

#### Arousal Dimension (activation level)
| Factor | Condition | Score |
|---|---|---|
| Heart Rate | > 95 BPM | +2.5 |
| | > 80 BPM | +1.0 |
| | < 60 BPM | -1.5 |
| | < 70 BPM | -0.5 |
| LF/HF Ratio | > 3.0 | +1.5 |
| | > 1.5 | +0.5 |
| | < 0.5 | -1.0 |
| Blink Rate | > 25/min | +0.5 |
| | < 10/min | -0.5 |

#### Valence Dimension (pleasure level)
| Factor | Condition | Score |
|---|---|---|
| Stress Score | > 70 | -3.0 |
| | > 50 | -1.5 |
| | < 25 | +2.5 |
| | < 35 | +1.0 |
| RMSSD | > 60 ms | +2.0 |
| | > 40 ms | +1.0 |
| | < 15 ms | -2.0 |
| | < 25 ms | -1.0 |
| pNN50 | > 25% | +0.5 |
| | < 5% | -0.5 |
| Gaze Stability | > 0.8 | +0.5 |
| | < 0.3 | -0.5 |

#### Mood Label Mapping
```
                    High Arousal
                         |
          "Stressed"     |     "Happy"
       (low V, high A)   |   (high V, high A)
                         |
    Low Valence ---------+--------- High Valence
                         |
          "Fatigued"     |     "Calm"
       (low V, low A)    |   (high V, low A)
                         |
                    Low Arousal

"Anxious" = Low Valence + Moderate Arousal (0 < arousal < 1.0)
"Neutral" = Everything else near center
```

Decision boundaries:
- Valence > 1.0 AND arousal > 1.0 -> **"Happy"**
- Valence > 1.0 AND arousal <= 1.0 -> **"Calm"**
- Valence < -0.5 AND arousal > 1.5 -> **"Stressed"**
- Valence < -0.5 AND 0 < arousal < 1.0 -> **"Anxious"**
- Valence < -0.5 AND arousal <= 0 -> **"Fatigued"**
- Otherwise -> **"Neutral"**

---

## 8. Face Detection & Identification

**Files:** `backend/face_detection.py`, `backend/camera_processor.py`

### Face Detection
- Uses **MediaPipe Face Landmarker** (Tasks API) with model `face_landmarker.task`
- Detects up to **5 faces** simultaneously
- Returns **478 landmarks** per face: 468 face mesh + 10 iris landmarks
- Confidence thresholds: 0.5 for detection and presence

### Multi-Face Tracking
- **IoU-based greedy matching** between consecutive frames
- Minimum IoU threshold: 0.3 to consider a match
- Each face gets a persistent numeric ID
- Stale faces (unseen for 2.0 seconds) are cleaned up
- Bounding boxes are **EMA-smoothed** (alpha=0.35) for visual stability

### Face Identification (runs every 20 frames per face)

**Two-stage matching pipeline:**

**Stage 1: Geometric Embedding (Fast Filter)**
- 46 key landmarks selected from face mesh
- Inter-ocular distance used for scale normalization
- 147-dimensional embedding computed (landmark positions flattened + aspect ratios)
- L2-normalized to unit vector
- **Cosine similarity** compared against database -> threshold 0.85

**Stage 2: Aligned Face Template (Accurate Match)**
- Eye landmarks used for **affine alignment** to canonical position
- Cropped and resized to **96x96 grayscale**
- Histogram equalization + Gaussian blur for lighting invariance
- **Normalized Cross-Correlation (NCC)** against stored templates -> threshold 0.35

**Combined Score:**
```
combined_score = 0.3 * geometric_similarity + 0.7 * template_score
```
Once a confident match is found, identity **locks** (no re-identification for that face).

---

## 9. Display & Visualization

### 9.1 Vitals Panel (12 Metric Cards)

Each vital sign is displayed in a card with:
- Colored accent bar at top (unique color per metric)
- Animated pulse dot indicator
- Current value with unit
- Hover lift animation

**Rolling average smoothing** is applied on the frontend (window of 5 readings) for smooth display transitions. When a face is temporarily lost, the last-known vitals are **held for 2 seconds** before clearing.

| # | Metric | Unit | Card Color |
|---|---|---|---|
| 1 | Heart Rate | BPM | `#ff6b9d` (pink) |
| 2 | Signal Quality | Text (Excellent/Good/Fair/Low) | `#4f8cff` (blue) |
| 3 | Respiration Rate | BPM | `#06d6a0` (teal) |
| 4 | HRV (RMSSD) | ms | `#4f8cff` (blue) |
| 5 | LF/HF Ratio | -- | `#a78bfa` (purple) |
| 6 | Stress Score | /100 | `#ff8c42` (orange) |
| 7 | Mood | Text label | `#e879f9` (pink) |
| 8 | Cognitive Load | Text (Low/Medium/High) | `#8b5cf6` (purple) |
| 9 | Fatigue Risk | /100 | `#ffd166` (yellow) |
| 10 | Blink Rate | /min | `#00e5ff` (cyan) |
| 11 | Gaze Stability | % | `#76ff03` (green) |
| 12 | Drowsiness (PERCLOS) | % | `#ff5252` (red) |

**Signal Quality Classification:**
| Numeric Score | Label | Color |
|---|---|---|
| >= 3.0 | Excellent | Green |
| >= 2.0 | Good | Blue |
| >= 1.2 | Fair | Yellow |
| < 1.2 | Low | Red |

### 9.2 Real-Time Charts

Three waveform charts rendered with **Recharts LineChart**:

1. **BVP / Pulse Waveform** (pink `#ff6b9d`): Last ~300 samples of the filtered BVP signal. Shows the actual blood volume pulse wave as detected by rPPG.

2. **Respiration Waveform** (green `#06d6a0`): Last ~300 samples of the respiration signal. Shows breathing cycles.

3. **HRV Timeline** (blue `#4f8cff`): Rolling RMSSD values over time, showing heart rate variability trends.

**Signal Info Bar** displays below the charts:
- rPPG Method: "POS+CHROM" or "GREEN"
- Signal Quality: color-coded indicator
- SNR (POS): numeric value
- SNR (CHROM): numeric value
- Measured FPS

### 9.3 Camera Overlays

**Three view modes** selectable via buttons:

**Normal View:**
- Face bounding boxes with corner accent lines
- Name label (blue for recognized, orange for unknown)
- Colored tracking dots on landmark groups (ROI, eyes, respiration, eyebrows, mouth)

**Signal View:**
- Everything from Normal view
- SVG eye outlines overlaid on eye landmarks
- More detailed eye/iris tracking visualization

**Heatmap View:**
- Radial gradient heatmap overlaid on each face
- Color maps stress score to gradient:
  - 0-50: Green -> Yellow (Calm to Moderate)
  - 50-100: Yellow -> Red (Moderate to High Stress)
- Shimmer animation effect
- Color scale legend

### 9.4 Analytics Charts

5 **Recharts AreaChart** visualizations:
1. Heart Rate over time (BPM)
2. HRV (RMSSD) over time (ms)
3. Stress Score over time (0-100)
4. Respiration Rate over time (BPM)
5. Fatigue Risk over time (0-100)

Each chart features gradient fills, tooltips on hover, and appropriate X-axis labels (time for daily, date for weekly/monthly views).

---

## 10. Data Persistence & Analytics

### MongoDB Collections

| Collection | Purpose |
|---|---|
| `registered_users` | Face registrations (name, age, embedding, photo_path) |
| `user_vitals` | Historical vital sign snapshots (per user, timestamped) |
| `users` | JWT auth users (email, hashed password) |
| `sessions` | Session tracking |
| `vitals_history` | Legacy vitals storage |

### Auto-Save Flow (Monitor Page)
1. During monitoring, per-face vitals accumulate in a frontend buffer
2. Every **10 seconds**, the buffer is averaged:
   - Arithmetic mean for numeric fields (HR, RR, HRV, stress, fatigue)
   - Mode (most common value) for categorical fields (mood)
3. Averaged vitals are POSTed to `/api/store-vitals`
4. Only recognized (non-"Unknown") users get their data saved

### Analytics Queries
- **Daily**: Last 24 hours, grouped by timestamp
- **Weekly**: Last 7 days, grouped by date
- **Monthly**: Last 30 days, grouped by date

### AI Predictions (`backend/prediction_engine.py`)
Based on stored historical vitals:

1. **Stress Trend**: Linear regression on recent stress scores -> slope determines "increasing" / "decreasing" / "stable"
2. **Fatigue Risk Prediction**: Analyzes HRV and HR patterns to predict fatigue level
3. **Anomaly Detection**: Z-score method on HR and HRV values -> flags readings > 2 standard deviations from mean

---

## 11. AI Integration

### Groq API (Llama 3.3 70B Versatile)
**File:** `backend/main.py`

- **Purpose**: Generate actionable health suggestions from current vital signs
- **Input**: Formatted prompt with all vital sign values + normal ranges
- **Output**: JSON with overall_status (Healthy/Caution/Alert), summary, and up to 5 specific suggestions with metric name, value, status, and recommendation
- **Config**: temperature=0.3, max_tokens=800

### Google Gemini 2.0 Flash (Optional)
**File:** `backend/gemini_service.py`

- **Face Verification**: Compares live face crop against registered photo
- **Health Observation**: Analyzes visible health indicators from camera frame
- **Status**: Module exists but is **not wired into the main WebSocket pipeline**

---

## 12. API Reference

### REST Endpoints

| Endpoint | Method | Description |
|---|---|---|
| `GET /api/health` | GET | Health check (`{"status":"ok", "version":"2.0.0"}`) |
| `POST /api/ai-suggestions` | POST | Get Groq AI health suggestions from vitals JSON |
| `POST /api/register` | POST | Register user (email/password auth) |
| `POST /api/login` | POST | Login user, returns JWT token |
| `GET /api/me` | GET | Get current user (requires Bearer token) |
| `POST /api/register-face` | POST | Register face (name, age, photo, embedding) |
| `GET /api/registered-users` | GET | List all registered users |
| `GET /api/registered-users/{id}` | GET | Get single registered user |
| `GET /api/registered-users-embeddings` | GET | List users with face embeddings |
| `POST /api/identify-face` | POST | Match embedding against database (cosine similarity, threshold 0.82) |
| `POST /api/recompute-embeddings` | POST | Re-compute all user embeddings from photos |
| `POST /api/store-vitals` | POST | Store averaged vitals snapshot for a user |
| `GET /api/analytics/{user_id}` | GET | Get historical vitals (query: range=daily/weekly/monthly) |
| `GET /api/predictions/{user_id}` | GET | Get AI predictions (stress trend, fatigue, anomalies) |

### WebSocket Endpoint

| Endpoint | Description |
|---|---|
| `WS /ws/monitor` | Real-time monitoring. Send base64 JPEG frames, receive JSON vitals. |

**WebSocket Response Schema:**
```json
{
  "face_detected": true,
  "face_count": 2,
  "faces": [
    {
      "face_id": 1,
      "name": "John",
      "user_id": "abc123",
      "bbox": { "x": 100, "y": 50, "width": 200, "height": 250 },
      "roi_points": { "forehead": [...], "left_cheek": [...], "right_cheek": [...] },
      "eye_landmarks": { "left_eye": [...], "right_eye": [...], "left_iris": [...], "right_iris": [...] },
      "respiration_points": { "nose": [...], "chin": [...], "jaw": [...] },
      "eyebrow_points": { "left": [...], "right": [...] },
      "mouth_points": { "corners": [...] }
    }
  ],
  "per_face_vitals": [
    {
      "face_id": 1,
      "heart_rate": 72.5,
      "respiration_rate": 16.2,
      "hrv_rmssd": 45.3,
      "hrv_sdnn": 52.1,
      "hrv_pnn50": 18.5,
      "hrv_lf_hf_ratio": 1.8,
      "stress_score": 42.0,
      "cognitive_load": "Medium",
      "fatigue_risk": 28.0,
      "mood": "Calm",
      "signal_quality": 2.8,
      "blink_rate": 15.0,
      "ear_avg": 0.28,
      "gaze_stability": 0.82,
      "gaze_x": 0.5,
      "gaze_y": 0.48,
      "perclos": 5.2,
      "saccade_rate": 22.0,
      "pupil_size": 0.31,
      "is_blinking": false
    }
  ],
  "pulse_waveform": [0.12, 0.15, ...],
  "respiration_waveform": [0.05, 0.03, ...],
  "hrv_timeline": [45.3, 46.1, ...],
  "rppg_method": "POS+CHROM",
  "signal_quality": 2.8,
  "snr_pos": 5.2,
  "snr_chrom": 4.8,
  "measured_fps": 14.7,
  "timestamp": "2026-03-13T10:30:00",
  "message": "Detected 2 faces"
}
```

---

## 13. Deployment

### Docker Compose

Three services orchestrated via `docker-compose.yml`:

| Service | Image | Port | Description |
|---|---|---|---|
| `mongodb` | mongo:7 | 27017 | Database |
| `backend` | Python 3.11-slim | 8000 | FastAPI + uvicorn |
| `frontend` | Node 20 + Nginx | 3000 | React SPA + reverse proxy |

**Nginx** serves the React build and proxies:
- `/api/*` -> `backend:8000`
- `/ws/*` -> `backend:8000` (with WebSocket upgrade headers)

### Running Locally
```bash
# Start all services
docker-compose up --build

# Frontend: http://localhost:3000
# Backend API: http://localhost:8000
# MongoDB: localhost:27017
```

---

## 14. End-to-End Data Flow Diagram

```
+-------------------+
|  USER'S WEBCAM    |
+--------+----------+
         |
         | getUserMedia() -> Canvas -> toDataURL('image/jpeg', 0.7)
         v
+-------------------+
|  CameraFeed.jsx   |  Captures frames at ~15 FPS as base64 JPEG
+--------+----------+
         |
         | WebSocket.send(base64_frame)
         v
+-------------------+
|  main.py          |  FastAPI WebSocket handler /ws/monitor
|  (WebSocket)      |  Dispatches to thread pool executor
+--------+----------+
         |
         v
+-------------------+
| camera_processor  |  CameraProcessor.process_frame()
|  .py              |
+--------+----------+
         |
    +----+----------+--------+-----------+
    |               |        |           |
    v               v        v           v
+----------+  +---------+ +---------+ +----------+
| face_    |  | roi_    | | eye_    | | respir-  |
| detection|  | extract | | analysis| | ation_   |
| .py      |  | ion.py  | | .py     | | detection|
+----+-----+  +----+----+ +----+----+ | .py      |
     |              |           |      +----+-----+
     |              v           |           |
     |     +----------+        |           |
     |     | ippg_    |        |           |
     |     | signal   |        |           |
     |     | .py      |        |           |
     |     +----+-----+        |           |
     |          |              |           |
     |          v              |           |
     |     +----------+        |           |
     |     | signal_  |        |           |
     |     | process  |        |           |
     |     | ing.py   |        |           |
     |     +----+-----+        |           |
     |          |              |           |
     |          v              |           |
     |     +----------+        |           |
     |     | hrv_     |        |           |
     |     | analysis |        |           |
     |     | .py      |        |           |
     |     +----+-----+        |           |
     |          |              |           |
     +----+-----+----+---------+-----------+
          |          |
          v          v
   +-------------+ +----------+
   | metrics_    | | Results  |
   | engine.py   | | aggreg.  |
   | (stress,    | |          |
   |  fatigue,   | |          |
   |  mood,      | |          |
   |  cognitive) | |          |
   +------+------+ +-----+----+
          |               |
          +-------+-------+
                  |
                  v
          +-------+-------+
          |  JSON Response |
          | via WebSocket  |
          +-------+-------+
                  |
                  v
   +--------------+-------------------+
   |              |                   |
   v              v                   v
+----------+ +-----------+ +------------------+
| Vitals   | | Charts    | | Camera Overlays  |
| Panel    | | .jsx      | | FaceBoxes.jsx    |
| .jsx     | | (BVP,     | | HeatmapView.jsx  |
| (12 card | |  Resp,    | | (bounding boxes, |
|  grid)   | |  HRV)     | |  tracking dots,  |
+----------+ +-----------+ |  stress heatmap) |
                            +------------------+
                  |
                  | Every 10 seconds (auto-save)
                  v
          +-------+-------+
          | POST /api/    |
          | store-vitals  |
          +-------+-------+
                  |
                  v
          +-------+-------+
          |   MongoDB     |
          | user_vitals   |
          +-------+-------+
                  |
                  v
   +--------------+-------------------+
   |              |                   |
   v              v                   v
+----------+ +-----------+ +------------------+
| Analytics| | AI        | | Predictions      |
| Charts   | | Suggest-  | | (stress trend,   |
| (Recharts| | ions      | |  fatigue risk,   |
|  Area)   | | (Groq AI) | |  anomaly detect) |
+----------+ +-----------+ +------------------+
```

---

## References

- Wang, W., den Brinker, A. C., Stuijk, S., & de Haan, G. (2017). Algorithmic Principles of Remote PPG. *IEEE Trans. Biomed. Eng.*, 64(7), 1479-1491. (POS algorithm)
- De Haan, G., & Jeanne, V. (2013). Robust pulse rate from chrominance-based rPPG. *IEEE Trans. Biomed. Eng.*, 60(10), 2878-2886. (CHROM algorithm)
- Verkruysse, W., Svaasand, L. O., & Nelson, J. S. (2008). Remote plethysmographic imaging using ambient light. *Opt. Express*, 16(26), 21434-21445. (GREEN channel method)
- Tarvainen, M. P., Ranta-Aho, P. O., & Karjalainen, P. A. (2002). An advanced detrending method with application to HRV analysis. *IEEE Trans. Biomed. Eng.*, 49(2), 172-175. (Detrending)
- Dinges, D. F., & Grace, R. (1998). PERCLOS: A valid psychophysiological measure of alertness as assessed by psychomotor vigilance. (PERCLOS drowsiness metric)
- Malik, M. (1996). Heart rate variability: Standards of measurement, physiological interpretation, and clinical use. *Circulation*, 93(5), 1043-1065. (HRV standards & outlier rejection)
