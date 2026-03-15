# VitalSense Technical Overview

## 1. Project Summary

VitalSense is a full-stack web application for contactless physiological monitoring using a webcam. The system streams camera frames from a React frontend to a FastAPI backend over WebSocket, extracts facial regions of interest, derives an rPPG signal, and computes live health-related metrics such as heart rate, respiration rate, HRV, stress score, fatigue risk, and mood.

The current repository includes:

- A React 19 + Vite frontend for registration, monitoring, and analytics
- A FastAPI backend for real-time frame processing and REST APIs
- MongoDB-backed persistence for registered users and vitals history
- Docker Compose for local multi-container deployment

The codebase also contains experimental Gemini-based services, but those are not currently wired into the active backend API.

---

## 2. Current Product Scope

### Implemented runtime features

- Real-time monitoring over WebSocket at a backend processing target of roughly 10 FPS
- Face registration with stored user profile, captured photo, and face embedding
- Multi-face detection and tracking during live monitoring
- Historical vitals storage for recognized users
- Analytics charts and simple prediction endpoints based on stored readings

### Present in the repo but not fully active

- AI suggestions endpoint expected by the analytics page is commented out in the backend
- Gemini-based verification and health analysis service exists as a module but is not integrated into request handling
- Legacy auth endpoints and login page exist, but the main frontend router does not expose the login route

---

## 3. Architecture

```text
+----------------------+        WebSocket (/ws/monitor)        +----------------------+
| React Frontend       | ------------------------------------> | FastAPI Backend      |
| Vite + React Router  | <------------------------------------ | CameraProcessor      |
| Register / Monitor   |        Per-frame JSON response        | Signal pipeline      |
| Analytics            |                                        | REST APIs            |
+----------------------+                                        +----------------------+
           |                                                                |
           | REST calls                                                      |
           v                                                                v
+----------------------+                                        +----------------------+
| Browser storage      |                                        | MongoDB              |
| Registered user info |                                        | registered_users     |
| Active UI state      |                                        | user_vitals          |
+----------------------+                                        | users / sessions     |
                                                                +----------------------+
```

### Data flow

1. The frontend captures webcam frames.
2. Frames are encoded and sent to `/ws/monitor`.
3. The backend decodes each frame and runs face detection, ROI extraction, iPPG extraction, filtering, and metric calculation.
4. The frontend updates dashboards in real time from the returned JSON payload.
5. Recognized-user vitals can be persisted through `/api/store-vitals`.
6. The analytics page reads historical records and prediction summaries through REST endpoints.

---

## 4. Technology Stack

### Frontend

| Area | Technology |
|---|---|
| UI runtime | React 19 |
| Build tool | Vite 8 |
| Routing | React Router DOM 7 |
| Animation | Framer Motion |
| Charts | Recharts |
| Styling | Tailwind CSS + custom CSS |
| Vision-related client deps | `@mediapipe/tasks-vision`, `face-api.js` |

### Backend

| Area | Technology |
|---|---|
| API framework | FastAPI |
| Server | Uvicorn |
| WebSocket transport | FastAPI WebSocket + `websockets` |
| CV + frame processing | OpenCV, MediaPipe |
| Landmark model | Pretrained MediaPipe Face Landmarker (`face_landmarker.task`) |
| Signal processing | NumPy, SciPy |
| rPPG approach | Classical algorithmic POS + CHROM fusion with GREEN fallback |
| Persistence | MongoDB via Motor |
| Auth | JWT via `python-jose`, password hashing with `bcrypt` |
| Additional ML/CV deps | `scikit-learn`, `face_recognition`, `dlib-bin` |

### Model note

This repository does not contain a custom-trained deep learning model for rPPG estimation.

- rPPG extraction is implemented as classical signal processing in `backend/ippg_signal.py`
- Face landmark detection relies on MediaPipe's pretrained `face_landmarker.task` asset
- No custom training pipeline, dataset artifacts, or model weight files for an rPPG network are present in the repo

### Infrastructure

| Area | Technology |
|---|---|
| Containers | Docker |
| Local orchestration | Docker Compose |
| Database container | MongoDB 7 |
| Frontend serving in container | Nginx |

---

## 5. Repository Structure

```text
.
|-- docker-compose.yml
|-- README.md
|-- project.md
|-- backend/
|   |-- main.py
|   |-- auth.py
|   |-- camera_processor.py
|   |-- database.py
|   |-- eye_analysis.py
|   |-- face_detection.py
|   |-- face_registration.py
|   |-- gemini_service.py
|   |-- hrv_analysis.py
|   |-- ippg_signal.py
|   |-- metrics_engine.py
|   |-- models.py
|   |-- prediction_engine.py
|   |-- respiration_detection.py
|   |-- roi_extraction.py
|   |-- signal_processing.py
|   |-- requirements.txt
|   `-- evaluation_results/
`-- frontend/
    |-- package.json
    |-- vite.config.js
    |-- tailwind.config.js
    |-- src/
    |   |-- App.jsx
    |   |-- ThemeContext.jsx
    |   |-- pages/
    |   |   |-- Landing.jsx
    |   |   |-- Register.jsx
    |   |   |-- Monitor.jsx
    |   |   |-- Analytics.jsx
    |   |   `-- Login.jsx
    |   `-- components/
    `-- public/
```

---

## 6. Frontend Overview

### Active routes

The main router currently exposes four pages:

| Route | Purpose |
|---|---|
| `/` | Landing page and product presentation |
| `/register` | User registration with face capture |
| `/monitor` | Live camera monitoring dashboard |
| `/analytics` | Historical charts and prediction summaries |

### Frontend behavior by page

#### Landing

- Product storytelling and feature presentation
- Navigation entry point into registration and monitoring flows

#### Register

- Collects user name and age
- Captures a face image from the webcam
- Sends registration data to `/api/register-face`
- Stores returned user information client-side for follow-up monitoring

#### Monitor

- Connects to `VITE_WS_URL` or `ws://localhost:8000`
- Displays live camera feed and overlays
- Loads known users from `/api/registered-users-embeddings`
- Sends frames for server-side processing
- Stores averaged vitals through `/api/store-vitals`

#### Analytics

- Loads user list from `/api/registered-users`
- Fetches historical records from `/api/analytics/{user_id}`
- Fetches trend predictions from `/api/predictions/{user_id}`
- Tries to fetch AI suggestions from `/api/ai-suggestions`, but that endpoint is not currently active in the backend

### Legacy UI note

`frontend/src/pages/Login.jsx` exists, but it is not mounted in `App.jsx`, so login is currently not part of the exposed frontend flow.

---

## 7. Backend Overview

### Main application

`backend/main.py` defines:

- FastAPI app configuration and lifespan hooks
- CORS policy
- WebSocket endpoint at `/ws/monitor`
- Health endpoint at `/api/health`
- Inclusion of auth, face registration, and prediction routers

### Active REST endpoints

#### Health

| Method | Path | Purpose |
|---|---|---|
| GET | `/api/health` | Service health/status response |

#### Auth

| Method | Path | Purpose |
|---|---|---|
| POST | `/api/register` | Create auth user and issue JWT |
| POST | `/api/login` | Authenticate and issue JWT |
| GET | `/api/me` | Return current authenticated user |

#### Face registration and storage

| Method | Path | Purpose |
|---|---|---|
| POST | `/api/register-face` | Register a monitored user with photo and embedding |
| GET | `/api/registered-users` | List registered users without embeddings |
| GET | `/api/registered-users/{user_id}` | Fetch one registered user |
| GET | `/api/registered-users-embeddings` | List registered users including embeddings |
| POST | `/api/identify-face` | Match an embedding against registered users |
| POST | `/api/recompute-embeddings` | Rebuild stored geometric embeddings from saved photos |
| POST | `/api/store-vitals` | Persist a vitals snapshot |
| GET | `/api/analytics/{user_id}` | Return stored vitals by daily/weekly/monthly range |

#### Predictions

| Method | Path | Purpose |
|---|---|---|
| GET | `/api/predictions/{user_id}` | Return stress trend, fatigue forecast, and anomaly alerts |

### Inactive backend API note

An `/api/ai-suggestions` route is present only as commented code in `backend/main.py`. The frontend analytics page still expects it, so this is a known mismatch between UI expectations and backend behavior.

---

## 8. Signal Processing Pipeline

The backend pipeline is centered around `CameraProcessor` and the supporting analysis modules.

### High-level processing stages

1. Decode the incoming base64 image frame.
2. Detect faces and facial landmarks.
3. Track faces across successive frames.
4. Extract skin ROIs such as forehead and cheeks.
5. Build RGB time series for each tracked face.
6. Estimate the blood volume pulse with rPPG algorithms.
7. Filter and analyze the resulting waveform.
8. Derive real-time vitals and higher-level metrics.
9. Return per-frame JSON results to the frontend.

### Modeling approach

The vision stack mixes a pretrained landmark detector with non-neural physiological signal extraction:

- Face localization and landmarks come from MediaPipe Face Landmarker
- rPPG is computed from RGB time series using POS, CHROM, and GREEN methods
- Heart rate, HRV, and respiration are derived from the recovered waveform using signal-processing methods rather than a learned end-to-end neural network

If a future version adds a trained deep learning rPPG model, it should be documented separately from the current algorithmic pipeline.

### Core analysis modules

| Module | Responsibility |
|---|---|
| `face_detection.py` | Face detection and facial landmark utilities |
| `roi_extraction.py` | Skin region extraction for signal acquisition |
| `ippg_signal.py` | iPPG extraction logic |
| `signal_processing.py` | Filtering, spectral analysis, and heart-rate estimation |
| `hrv_analysis.py` | HRV-related calculations |
| `respiration_detection.py` | Respiration estimation |
| `eye_analysis.py` | Blink, PERCLOS, gaze, and related eye metrics |
| `metrics_engine.py` | Stress, fatigue, cognitive load, and mood derivation |
| `camera_processor.py` | Orchestration of the end-to-end per-frame pipeline |

### Output metrics documented by the product

- Heart rate
- Respiration rate
- HRV-related values
- Stress score
- Fatigue risk
- Cognitive load
- Mood classification
- Blink-related eye metrics
- Gaze-related metrics
- Drowsiness indicators such as PERCLOS

Exact metric availability in the frontend depends on the payload consumed by the active page components.

---

## 9. Data Model and Persistence

MongoDB is used for several collections:

| Collection | Purpose |
|---|---|
| `users` | JWT-authenticated users |
| `sessions` | Session-related records |
| `vitals_history` | Historical vitals collection used by the older auth/session flow |
| `registered_users` | Webcam-registered people for monitoring |
| `user_vitals` | Stored vitals snapshots for analytics and predictions |

### Important persistence behavior

- Registered monitoring users and auth users are separate concepts in the current codebase.
- The analytics page reads from `user_vitals`, not from `vitals_history`.
- `init_db()` creates indexes but tolerates MongoDB startup failure, so the app can boot even when the database is unavailable.

---

## 10. Local Development

### Backend

```bash
cd backend
pip install -r requirements.txt
python main.py
```

Default local URL: `http://localhost:8000`

### Frontend

```bash
cd frontend
npm install
npm run dev
```

Default local URL: `http://localhost:5173`

### Docker Compose

```bash
docker compose up --build
```

Compose provisions:

- MongoDB on port `27017`
- Backend on port `8000`
- Frontend on port `3000`

The compose file passes:

- `MONGO_URL=mongodb://mongodb:27017`
- `DB_NAME=vital_monitor`
- `JWT_SECRET=...`
- `VITE_API_URL=http://localhost:8000`
- `VITE_WS_URL=ws://localhost:8000`

---

## 11. Known Gaps and Risks

### Functional gaps

- The analytics page attempts to call `/api/ai-suggestions`, but the backend route is commented out.
- The frontend includes a login page, while the router does not expose it.
- Gemini service code exists but is not part of the active request pipeline.

### Engineering concerns

- Some modules appear to reflect multiple generations of the project, so auth/session flow and face-registration flow are partially overlapping.
- Runtime behavior and README/project docs had drifted apart before this update.
- Production deployment should rely on explicit environment variables for secrets and database connection details.

---

## 12. Recommended Next Documentation Targets

If the repo continues evolving, the next high-value documentation updates are:

1. Align analytics documentation with the actual payload returned by `CameraProcessor`.
2. Decide whether `/api/ai-suggestions` is part of the supported product and document it only after it is re-enabled.
3. Consolidate the legacy auth flow and monitored-user registration flow into one documented user model.
