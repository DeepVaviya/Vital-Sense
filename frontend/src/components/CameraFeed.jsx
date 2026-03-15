import { useRef, useEffect, useCallback, useState, useMemo } from 'react';
import { FaceDetector, FilesetResolver } from '@mediapipe/tasks-vision';
import FaceBoxes from './FaceBoxes';
import HeatmapView from './HeatmapView';

// ── Center distance helper for matching client-side faces to backend faces ──
// More reliable than IOU when the two detectors produce different-sized bboxes
function bboxCenter(b) {
  return { cx: b.x + b.width / 2, cy: b.y + b.height / 2 };
}
function centerDist(a, b) {
  const ca = bboxCenter(a);
  const cb = bboxCenter(b);
  return Math.sqrt((ca.cx - cb.cx) ** 2 + (ca.cy - cb.cy) ** 2);
}

const CameraFeed = ({ onFrame, isMonitoring, vitals, viewMode = 'normal' }) => {
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const containerRef = useRef(null);
  const streamRef = useRef(null);
  const intervalRef = useRef(null);
  const detectorRef = useRef(null);
  const rafRef = useRef(null);
  const [cameraError, setCameraError] = useState('');
  const [cameraReady, setCameraReady] = useState(false);
  const [containerSize, setContainerSize] = useState({ width: 640, height: 480 });
  const [clientFaces, setClientFaces] = useState([]);

  // ── Initialize client-side MediaPipe face detector ──
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const vision = await FilesetResolver.forVisionTasks(
          'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@latest/wasm'
        );
        if (cancelled) return;
        const detector = await FaceDetector.createFromOptions(vision, {
          baseOptions: {
            modelAssetPath:
              'https://storage.googleapis.com/mediapipe-models/face_detector/blaze_face_short_range/float16/1/blaze_face_short_range.tflite',
          },
          runningMode: 'VIDEO',
          minDetectionConfidence: 0.7,
        });
        if (cancelled) return;
        detectorRef.current = detector;
        console.log('[ClientFD] Client-side face detector ready');
      } catch (e) {
        console.warn('[ClientFD] Init failed (using backend only):', e);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  // ── Client-side face detection at native frame rate ──
  useEffect(() => {
    if (!isMonitoring || !cameraReady) {
      setClientFaces([]);
      return;
    }

    let lastTs = -1;
    const loop = () => {
      const video = videoRef.current;
      const detector = detectorRef.current;

      if (video && detector && video.readyState >= 2) {
        const now = performance.now();
        if (now > lastTs) {
          try {
            const result = detector.detectForVideo(video, now);
            const vw = video.videoWidth || 640;
            const vh = video.videoHeight || 480;
            const faces = (result.detections || [])
              .map((d, i) => ({
                face_index: i,
                bbox: {
                  x: d.boundingBox.originX / vw,
                  y: d.boundingBox.originY / vh,
                  width: d.boundingBox.width / vw,
                  height: d.boundingBox.height / vh,
                },
              }))
              // Filter out tiny detections (< 5% of frame) — likely false positives
              .filter(f => f.bbox.width > 0.05 && f.bbox.height > 0.05);
            setClientFaces(faces);
            lastTs = now;
          } catch (e) { /* skip frame */ }
        }
      }

      rafRef.current = requestAnimationFrame(loop);
    };

    rafRef.current = requestAnimationFrame(loop);
    return () => { if (rafRef.current) cancelAnimationFrame(rafRef.current); };
  }, [isMonitoring, cameraReady]);

  const startCamera = useCallback(async () => {
    try {
      setCameraError('');
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          width: { ideal: 640 },
          height: { ideal: 480 },
          facingMode: 'user',
          frameRate: { ideal: 30 },
        },
        audio: false,
      });

      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.onloadedmetadata = () => {
          videoRef.current.play();
          setCameraReady(true);
        };
      }
    } catch (err) {
      if (err.name === 'NotAllowedError') {
        setCameraError('Camera access is required for monitoring.');
      } else if (err.name === 'NotFoundError') {
        setCameraError('No camera found. Please connect a webcam.');
      } else {
        setCameraError(`Camera error: ${err.message}`);
      }
    }
  }, []);

  const captureFrame = useCallback(() => {
    if (!videoRef.current || !canvasRef.current || !cameraReady) return;

    const video = videoRef.current;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');

    canvas.width = video.videoWidth || 640;
    canvas.height = video.videoHeight || 480;

    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

    const frameData = canvas.toDataURL('image/jpeg', 0.7);
    onFrame?.(frameData);
  }, [onFrame, cameraReady]);

  // Track container size for overlay positioning
  useEffect(() => {
    const updateSize = () => {
      if (containerRef.current) {
        const rect = containerRef.current.getBoundingClientRect();
        setContainerSize({ width: rect.width, height: rect.height });
      }
    };
    updateSize();
    window.addEventListener('resize', updateSize);
    return () => window.removeEventListener('resize', updateSize);
  }, [cameraReady]);

  // Start/stop camera based on monitoring state
  useEffect(() => {
    if (isMonitoring) {
      startCamera();
    } else {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(t => t.stop());
        streamRef.current = null;
      }
      setCameraReady(false);
    }

    return () => {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(t => t.stop());
      }
    };
  }, [isMonitoring, startCamera]);

  // Frame capture interval at ~15 FPS (for backend vitals processing)
  useEffect(() => {
    if (isMonitoring && cameraReady) {
      intervalRef.current = setInterval(captureFrame, 67); // ~15 FPS
    } else {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    }

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [isMonitoring, cameraReady, captureFrame]);

  // ── Merge: client-side bboxes (instant) + backend tracking/identity (delayed) ──
  const facesWithNames = useMemo(() => {
    const backendFaces = (vitals?.faces || []).map((face) => ({
      ...face,
      name: face.recognized_name || face.name || 'Unknown',
      tracking_points: face.tracking_points || {},
    }));

    // If client-side detector not loaded or no detections, fall back to backend
    if (clientFaces.length === 0) return backendFaces;
    if (backendFaces.length === 0) {
      return clientFaces.map(cf => ({
        ...cf,
        face_id: cf.face_index,
        name: 'Detecting...',
        tracking_points: {},
        roi_points: {},
      }));
    }

    // ── One-to-one matching using center distance ──
    // Max distance threshold (normalized coords): faces whose centers
    // are more than 20% of the frame apart are not the same face
    const MAX_DIST = 0.20;
    const usedBackend = new Set();
    const merged = [];

    // Build distance matrix and greedily match closest pairs
    const pairs = [];
    for (let ci = 0; ci < clientFaces.length; ci++) {
      for (let bi = 0; bi < backendFaces.length; bi++) {
        const dist = centerDist(clientFaces[ci].bbox, backendFaces[bi].bbox);
        if (dist < MAX_DIST) {
          pairs.push({ ci, bi, dist });
        }
      }
    }
    // Sort by distance (closest first)
    pairs.sort((a, b) => a.dist - b.dist);

    const usedClient = new Set();
    const matchMap = new Map(); // ci -> bi
    for (const p of pairs) {
      if (usedClient.has(p.ci) || usedBackend.has(p.bi)) continue;
      matchMap.set(p.ci, p.bi);
      usedClient.add(p.ci);
      usedBackend.add(p.bi);
    }

    // Build output: matched client faces get backend identity + tracking
    for (let ci = 0; ci < clientFaces.length; ci++) {
      const cf = clientFaces[ci];
      if (matchMap.has(ci)) {
        const bf = backendFaces[matchMap.get(ci)];
        merged.push({ ...bf, bbox: cf.bbox }); // client bbox + backend identity
      } else {
        merged.push({
          ...cf,
          face_id: cf.face_index,
          name: 'Detecting...',
          tracking_points: {},
          roi_points: {},
        });
      }
    }

    return merged;
  }, [clientFaces, vitals?.faces]);

  return (
    <div className="relative">
      {cameraError && (
        <div className="absolute inset-0 flex items-center justify-center z-10 rounded-2xl"
             style={{ background: 'rgba(10,10,15,0.9)' }}>
          <div className="text-center p-6 max-w-xs">
            <div className="w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4"
                 style={{ background: 'rgba(255,107,157,0.15)' }}>
              <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#ff6b9d" strokeWidth="2">
                <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" />
                <line x1="1" y1="1" x2="23" y2="23" />
              </svg>
            </div>
            <p className="text-sm font-medium" style={{ color: '#ff6b9d' }}>{cameraError}</p>
          </div>
        </div>
      )}

      <div ref={containerRef}
           className="relative rounded-2xl overflow-hidden"
           style={{ background: '#0d0d14', aspectRatio: '4/3' }}>
        <video
          ref={videoRef}
          autoPlay
          playsInline
          muted
          className="w-full h-full object-cover"
          style={{ transform: 'scaleX(-1)' }}
        />

        {/* Face Boxes Overlay — now powered by client-side detection */}
        {isMonitoring && cameraReady && (
          <FaceBoxes
            faces={facesWithNames}
            containerWidth={containerSize.width}
            containerHeight={containerSize.height}
            viewMode={viewMode}
          />
        )}

        {/* Heatmap Overlay — uses client-side faces for instant tracking */}
        {isMonitoring && cameraReady && (
          <HeatmapView
            faces={facesWithNames}
            stressScore={vitals?.stress_score || 0}
            containerWidth={containerSize.width}
            containerHeight={containerSize.height}
            visible={viewMode === 'heatmap'}
          />
        )}

        {/* Overlay indicators */}
        {isMonitoring && cameraReady && (
          <div className="absolute top-3 left-3 flex items-center gap-2 px-3 py-1.5 rounded-full"
               style={{ background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(8px)', zIndex: 20 }}>
            <div className="w-2 h-2 rounded-full animate-pulse" style={{ background: '#06d6a0' }} />
            <span className="text-xs font-medium" style={{ color: '#06d6a0' }}>LIVE</span>
            {vitals?.face_count > 0 && (
              <span className="text-xs" style={{ color: 'var(--text-muted)' }}>
                • {vitals.face_count} face{vitals.face_count > 1 ? 's' : ''}
              </span>
            )}
          </div>
        )}

        {/* View mode indicator */}
        {isMonitoring && cameraReady && viewMode !== 'normal' && (
          <div className="absolute top-3 right-3 px-3 py-1.5 rounded-full text-xs font-medium"
               style={{
                 background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(8px)', zIndex: 20,
                 color: viewMode === 'heatmap' ? '#ff8c42' : '#4f8cff',
               }}>
            {viewMode === 'heatmap' ? '🌡️ Heatmap' : '📡 Signal'}
          </div>
        )}

        {/* Face tracking guide (only when no faces detected) */}
        {isMonitoring && cameraReady && (!vitals?.face_detected) && clientFaces.length === 0 && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <div className="w-48 h-64 rounded-[50%] border-2 border-dashed opacity-30"
                 style={{ borderColor: '#4f8cff' }} />
          </div>
        )}
      </div>

      {/* Hidden canvas for frame capture */}
      <canvas ref={canvasRef} className="hidden" />
    </div>
  );
};

export default CameraFeed;
