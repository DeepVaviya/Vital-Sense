import { useState, useRef, useCallback, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Play, Square, AlertTriangle, Wifi, WifiOff, Eye, Thermometer, Radio, User, Users } from 'lucide-react';
import CameraFeed from '../components/CameraFeed';
import VitalsPanel from '../components/VitalsPanel';
import HealthAlerts from '../components/HealthAlerts';
import Charts from '../components/Charts';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000';
const WS_URL = import.meta.env.VITE_WS_URL || 'ws://localhost:8000';

const VIEW_MODES = [
  { id: 'normal', label: 'Normal', icon: Eye, color: '#2563EB' },
  { id: 'signal', label: 'Signal Tracking', icon: Radio, color: '#0D9488' },
  { id: 'heatmap', label: 'Heatmap', icon: Thermometer, color: '#D97706' },
];

const PERSON_COLORS = ['#2563EB', '#0D9488', '#D97706', '#7C3AED', '#E11D48'];

// Auto-save interval (ms) — store averaged vitals every 10 seconds
const AUTO_SAVE_INTERVAL = 10000;

export default function Monitor() {
  const [isMonitoring, setIsMonitoring] = useState(false);
  const [vitals, setVitals] = useState(null);
  const [wsStatus, setWsStatus] = useState('disconnected');
  const [statusMessage, setStatusMessage] = useState('');
  const [viewMode, setViewMode] = useState('normal');
  const [registeredUsers, setRegisteredUsers] = useState([]);
  const [activeFaceId, setActiveFaceId] = useState(null);
  const wsRef = useRef(null);
  const vitalsStoreRef = useRef(null);
  const reconnectTimerRef = useRef(null);
  const isMonitoringRef = useRef(false);
  // Per-face vitals accumulation buffers for averaging before DB save
  const vitalsBufferRef = useRef({});

  // Load registered users with embeddings on mount
  useEffect(() => {
    fetch(`${API_URL}/api/registered-users-embeddings`)
      .then(r => r.json())
      .then(users => {
        setRegisteredUsers(users || []);
        console.log(`[Monitor] Loaded ${(users || []).length} registered users`);
      })
      .catch(err => console.warn('[Monitor] Could not load registered users:', err));
  }, []);

  // Connect WebSocket
  const connectWS = useCallback(() => {
    try {
      const ws = new WebSocket(`${WS_URL}/ws/monitor`);

      ws.onopen = () => {
        setWsStatus('connected');
        setStatusMessage('');
      };

      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);

          // Use server-sent identity (name + user_id come from backend face matching)
          // Backend uses "Unknown" for unregistered faces
          if (data.faces && data.faces.length > 0) {
            data.faces = data.faces.map((face) => ({
              ...face,
              recognized_name: face.name || 'Unknown',
              recognized_user_id: face.user_id || null,
              tracking_points: face.tracking_points || {},
            }));
            if (data.per_face_vitals) {
              data.per_face_vitals = data.per_face_vitals.map((pv) => ({
                ...pv,
                recognized_name: pv.recognized_name || 'Unknown',
                recognized_user_id: pv.recognized_user_id || null,
              }));
            }
          }

          // STICKY tab selection: only auto-select ONCE on first detection.
          // After that, NEVER auto-switch. User must manually click a tab.
          if (data.per_face_vitals && data.per_face_vitals.length > 0) {
            setActiveFaceId(prev => {
              // If we already have a selection, KEEP IT regardless of whether
              // that face is still present. This prevents glitchy switching.
              if (prev !== null) return prev;
              // First time: auto-select the first face
              return data.per_face_vitals[0].face_id;
            });
          }

          // Accumulate vitals per face for averaging
          if (data.per_face_vitals) {
            data.per_face_vitals.forEach(pv => {
              if (pv.heart_rate > 0) {
                const fid = pv.face_id;
                if (!vitalsBufferRef.current[fid]) {
                  vitalsBufferRef.current[fid] = { readings: [], userId: pv.recognized_user_id };
                }
                vitalsBufferRef.current[fid].userId = pv.recognized_user_id;
                vitalsBufferRef.current[fid].readings.push({
                  heart_rate: pv.heart_rate,
                  respiration_rate: pv.respiration_rate,
                  hrv: pv.hrv_rmssd,
                  stress_score: pv.stress_score,
                  mood: pv.mood,
                  fatigue_risk: pv.fatigue_risk,
                });
              }
            });
          }

          setVitals(data);
          if (data.message) {
            setStatusMessage(data.message);
          } else {
            setStatusMessage('');
          }
        } catch (e) {
          console.error('Failed to parse vitals:', e);
        }
      };

      ws.onerror = () => {
        setWsStatus('error');
        setStatusMessage('WebSocket error. Reconnecting...');
      };

      ws.onclose = () => {
        setWsStatus('disconnected');
        wsRef.current = null;
        // Auto-reconnect after 1 second if still monitoring
        reconnectTimerRef.current = setTimeout(() => {
          if (isMonitoringRef.current) connectWS();
        }, 1000);
      };

      wsRef.current = ws;
    } catch (err) {
      setWsStatus('error');
      setStatusMessage('Failed to connect to server.');
    }
  }, []);

  // Disconnect WebSocket
  const disconnectWS = useCallback(() => {
    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }
    setWsStatus('disconnected');
  }, []);

  // Handle frame from CameraFeed
  const handleFrame = useCallback((frameData) => {
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(frameData);
    }
  }, []);

  // Periodically store averaged vitals for each recognized person
  useEffect(() => {
    if (!isMonitoring || registeredUsers.length === 0) return;

    vitalsStoreRef.current = setInterval(() => {
      const buffers = vitalsBufferRef.current;
      Object.keys(buffers).forEach(fid => {
        const buf = buffers[fid];
        const userId = buf.userId;
        const readings = buf.readings;

        if (!userId || readings.length === 0) return;

        // Compute averages
        const avg = {
          heart_rate: 0, respiration_rate: 0, hrv: 0,
          stress_score: 0, fatigue_risk: 0,
        };
        const moods = {};
        readings.forEach(r => {
          avg.heart_rate += r.heart_rate;
          avg.respiration_rate += r.respiration_rate;
          avg.hrv += r.hrv;
          avg.stress_score += r.stress_score;
          avg.fatigue_risk += r.fatigue_risk;
          moods[r.mood] = (moods[r.mood] || 0) + 1;
        });
        const n = readings.length;
        avg.heart_rate /= n;
        avg.respiration_rate /= n;
        avg.hrv /= n;
        avg.stress_score /= n;
        avg.fatigue_risk /= n;

        // Most common mood
        const topMood = Object.entries(moods).sort((a, b) => b[1] - a[1])[0]?.[0] || 'Neutral';

        // Store averaged vitals
        fetch(`${API_URL}/api/store-vitals`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            user_id: userId,
            heart_rate: Math.round(avg.heart_rate * 10) / 10,
            respiration_rate: Math.round(avg.respiration_rate * 10) / 10,
            hrv: Math.round(avg.hrv * 10) / 10,
            stress_score: Math.round(avg.stress_score * 10) / 10,
            mood: topMood,
            fatigue_risk: Math.round(avg.fatigue_risk * 10) / 10,
          }),
        })
          .then(() => console.log(`[Store] Saved averaged vitals for face ${fid} (user ${userId})`))
          .catch(err => console.warn('[Store] Vitals store failed:', err));

        // Clear buffer after saving
        buf.readings = [];
      });
    }, AUTO_SAVE_INTERVAL);

    return () => {
      if (vitalsStoreRef.current) clearInterval(vitalsStoreRef.current);
    };
  }, [isMonitoring, registeredUsers]);

  // Start/stop monitoring
  const toggleMonitoring = () => {
    if (isMonitoring) {
      isMonitoringRef.current = false;
      setIsMonitoring(false);
      if (reconnectTimerRef.current) clearTimeout(reconnectTimerRef.current);
      disconnectWS();
      setVitals(null);
      setStatusMessage('');
      setActiveFaceId(null);
      vitalsBufferRef.current = {};
    } else {
      isMonitoringRef.current = true;
      setIsMonitoring(true);
      connectWS();
    }
  };

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      isMonitoringRef.current = false;
      if (reconnectTimerRef.current) clearTimeout(reconnectTimerRef.current);
      disconnectWS();
      if (vitalsStoreRef.current) clearInterval(vitalsStoreRef.current);
    };
  }, [disconnectWS]);

  // Get vitals for the currently selected face
  const getActiveVitals = () => {
    if (!vitals?.per_face_vitals || vitals.per_face_vitals.length === 0) return vitals;
    const active = vitals.per_face_vitals.find(pv => pv.face_id === activeFaceId);
    if (active) {
      // Merge face-specific vitals with the top-level data for backward compat
      return { ...vitals, ...active };
    }
    return vitals;
  };

  const activeVitals = getActiveVitals();
  // Sort face list by stable key so person tabs don't jump around between frames.
  // Named (recognized) users come first, then sorted by face_id for consistency.
  const faceList = [...(vitals?.per_face_vitals || [])].sort((a, b) => {
    const aName = a.recognized_name || '';
    const bName = b.recognized_name || '';
    const aIsUnknown = !aName || aName === 'Unknown';
    const bIsUnknown = !bName || bName === 'Unknown';
    // Named users first
    if (aIsUnknown !== bIsUnknown) return aIsUnknown ? 1 : -1;
    // Among same category, sort by name alphabetically
    if (aName !== bName) return aName.localeCompare(bName);
    // Fallback: sort by face_id for deterministic order
    return (a.face_id ?? 0) - (b.face_id ?? 0);
  });

  return (
    <div className="min-h-screen pt-24 pb-10 px-4" style={{ background: 'var(--page-bg)' }}>
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
          <div>
            <h1 style={{
              fontSize: '22px',
              fontWeight: 700,
              color: 'var(--value-color)',
              marginBottom: '4px',
              letterSpacing: '-0.02em',
            }}>
              Vital Signs <span style={{ color: '#0D9488' }}>Monitor</span>
            </h1>
            <p style={{ fontSize: '13px', color: 'var(--label-color)', fontWeight: 400 }}>
              Real-time contactless physiological monitoring via webcam
            </p>
          </div>

          <div className="flex items-center gap-3 flex-wrap">
            {/* View Mode Selector */}
            {isMonitoring && (
              <div style={{
                display: 'flex',
                alignItems: 'center',
                gap: '2px',
                padding: '3px',
                borderRadius: '12px',
                background: 'var(--pill-bg)',
                border: '1px solid var(--card-border)',
              }}>
                {VIEW_MODES.map((mode) => (
                  <button
                    key={mode.id}
                    onClick={() => setViewMode(mode.id)}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '5px',
                      padding: '6px 12px',
                      borderRadius: '9px',
                      fontSize: '12px',
                      fontWeight: viewMode === mode.id ? 600 : 500,
                      background: viewMode === mode.id ? 'var(--card-bg)' : 'transparent',
                      color: viewMode === mode.id ? mode.color : 'var(--sublabel-color)',
                      border: viewMode === mode.id ? '1px solid var(--card-border)' : '1px solid transparent',
                      boxShadow: viewMode === mode.id ? '0 1px 3px rgba(0,0,0,0.06)' : 'none',
                      cursor: 'pointer',
                      transition: 'all 0.2s ease',
                    }}
                  >
                    <mode.icon size={13} />
                    <span className="hidden sm:inline">{mode.label}</span>
                  </button>
                ))}
              </div>
            )}

            {/* Connection status */}
            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              padding: '5px 12px',
              borderRadius: '20px',
              fontSize: '12px',
              fontWeight: 600,
              background: wsStatus === 'connected' ? 'var(--status-green-bg)' : 'var(--status-red-bg)',
              color: wsStatus === 'connected' ? '#059669' : '#DC2626',
              border: `1px solid ${wsStatus === 'connected' ? '#05966920' : '#DC262620'}`,
            }}>
              {wsStatus === 'connected' ? <Wifi size={12} /> : <WifiOff size={12} />}
              {wsStatus === 'connected' ? 'Connected' : 'Disconnected'}
            </div>

            {/* Start/Stop button */}
            <motion.button
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.97 }}
              onClick={toggleMonitoring}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                padding: '9px 22px',
                borderRadius: '12px',
                fontSize: '13px',
                fontWeight: 700,
                color: '#FFFFFF',
                border: 'none',
                cursor: 'pointer',
                background: isMonitoring
                  ? 'linear-gradient(135deg, #DC2626, #B91C1C)'
                  : 'linear-gradient(135deg, #0D9488, #0F766E)',
                boxShadow: isMonitoring
                  ? '0 2px 8px rgba(220,38,38,0.25)'
                  : '0 2px 8px rgba(13,148,136,0.25)',
              }}
            >
              {isMonitoring ? <><Square size={15} /> Stop</> : <><Play size={15} /> Start Monitoring</>}
            </motion.button>
          </div>
        </div>

        {/* Status Messages */}
        <AnimatePresence>
          {statusMessage && (
            <motion.div
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                padding: '10px 16px',
                borderRadius: '12px',
                marginBottom: '16px',
                fontSize: '13px',
                fontWeight: 500,
                background: vitals?.face_detected === false ? '#D976060D' : '#2563EB0D',
                color: vitals?.face_detected === false ? '#D97706' : '#2563EB',
                border: `1px solid ${vitals?.face_detected === false ? '#D9770620' : '#2563EB20'}`,
              }}
            >
              <AlertTriangle size={15} />
              {statusMessage}
            </motion.div>
          )}
        </AnimatePresence>

        {/* Main grid */}
        {!isMonitoring ? (
          /* Idle state */
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}
            style={{
              background: 'var(--card-bg)',
              border: '1px solid var(--card-border)',
              borderRadius: '18px',
              padding: '64px 32px',
              textAlign: 'center',
              boxShadow: 'var(--card-shadow)',
            }}>
            <div style={{
              width: '72px',
              height: '72px',
              borderRadius: '20px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              margin: '0 auto 24px',
              background: 'linear-gradient(135deg, #0D94880F, #0D948820)',
            }}>
              <Play size={32} style={{ color: '#0D9488' }} />
            </div>
            <h2 style={{ fontSize: '20px', fontWeight: 700, color: 'var(--value-color)', marginBottom: '10px' }}>
              Ready to Monitor
            </h2>
            <p style={{ fontSize: '13px', maxWidth: '420px', margin: '0 auto 20px', color: 'var(--label-color)', lineHeight: 1.6 }}>
              Click <strong style={{ color: 'var(--value-color)' }}>Start Monitoring</strong> to begin. Your webcam will detect faces,
              identify registered users, and extract real physiological signals.
            </p>
            <div style={{
              display: 'flex',
              flexWrap: 'wrap',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '12px',
              fontSize: '12px',
              color: 'var(--sublabel-color)',
            }}>
              <span>✓ Camera access required</span>
              <span>·</span>
              <span>✓ Good lighting recommended</span>
              <span>·</span>
              <span>✓ Multiple faces supported</span>
            </div>
            {registeredUsers.length > 0 && (
              <div style={{ marginTop: '14px', fontSize: '12px', color: '#059669', fontWeight: 600 }}>
                ✓ {registeredUsers.length} registered user{registeredUsers.length > 1 ? 's' : ''} loaded
              </div>
            )}
          </motion.div>
        ) : (
          /* Active monitoring */
          <div className="grid lg:grid-cols-12 gap-4">
            {/* Camera feed — left column */}
            <div className="lg:col-span-5">
              <CameraFeed
                onFrame={handleFrame}
                isMonitoring={isMonitoring}
                vitals={vitals}
                viewMode={viewMode}
              />

              {/* ========== PERSON TABS ========== */}
              {faceList.length > 0 && (
                <motion.div
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  style={{ marginTop: '12px' }}
                >
                  <div style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                    padding: '6px',
                    borderRadius: '14px',
                    overflowX: 'auto',
                    background: 'var(--card-bg)',
                    border: '1px solid var(--card-border)',
                    boxShadow: 'var(--card-shadow)',
                  }}>
                    {faceList.map((pv, idx) => {
                      const isActive = pv.face_id === activeFaceId;
                      const color = PERSON_COLORS[idx % PERSON_COLORS.length];
                      const name = pv.recognized_name || `Person ${idx + 1}`;
                      const hasData = pv.heart_rate > 0;

                      return (
                        <motion.button
                          key={pv.face_id}
                          whileHover={{ scale: 1.01 }}
                          whileTap={{ scale: 0.98 }}
                          onClick={() => setActiveFaceId(pv.face_id)}
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: '8px',
                            padding: '8px 14px',
                            borderRadius: '10px',
                            fontSize: '12px',
                            fontWeight: 600,
                            border: isActive ? `1.5px solid ${color}35` : '1.5px solid transparent',
                            cursor: 'pointer',
                            transition: 'all 0.2s ease',
                            whiteSpace: 'nowrap',
                            minWidth: '115px',
                            background: isActive ? `${color}08` : 'transparent',
                            color: isActive ? color : 'var(--sublabel-color)',
                          }}
                        >
                          <div style={{
                            width: '28px',
                            height: '28px',
                            borderRadius: '8px',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            background: isActive ? `${color}12` : 'var(--pill-bg)',
                          }}>
                            <User size={13} style={{ color: isActive ? color : 'var(--sublabel-color)' }} />
                          </div>
                          <div style={{ textAlign: 'left' }}>
                            <div style={{ fontSize: '11px', lineHeight: 1.2 }}>{name}</div>
                            {hasData && (
                              <div style={{ fontSize: '9px', color: 'var(--sublabel-color)', marginTop: '2px', fontFeatureSettings: '"tnum"' }}>
                                ♥ {pv.heart_rate?.toFixed(0)} BPM
                              </div>
                            )}
                          </div>
                          {isActive && (
                            <div style={{
                              width: '6px',
                              height: '6px',
                              borderRadius: '50%',
                              background: color,
                              marginLeft: 'auto',
                            }} />
                          )}
                        </motion.button>
                      );
                    })}
                  </div>

                  {/* Face count indicator */}
                  <div style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                    marginTop: '8px',
                    paddingLeft: '4px',
                    color: 'var(--sublabel-color)',
                    fontSize: '10px',
                  }}>
                    <Users size={11} />
                    <span>{faceList.length} person{faceList.length > 1 ? 's' : ''} detected</span>
                    {faceList.length > 1 && (
                      <span style={{ color: '#2563EB' }}>• Click a tab to view readings</span>
                    )}
                  </div>
                </motion.div>
              )}

              {/* Vitals cards under camera on mobile */}
              <div className="mt-4 lg:hidden">
                <VitalsPanel vitals={activeVitals} />
                <div className="mt-3">
                  <HealthAlerts vitals={activeVitals} />
                </div>
              </div>
            </div>

            {/* Right column: vitals + charts */}
            <div className="lg:col-span-7 space-y-4">
              {/* Active person indicator */}
              {faceList.length > 1 && activeFaceId !== null && (
                <div style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  padding: '8px 14px',
                  borderRadius: '12px',
                  fontSize: '12px',
                  background: '#2563EB0D',
                  border: '1px solid #2563EB18',
                  color: '#2563EB',
                  fontWeight: 600,
                }}>
                  <User size={13} />
                  <span>
                    Viewing: {faceList.find(f => f.face_id === activeFaceId)?.recognized_name || `Face ${activeFaceId}`}
                  </span>
                </div>
              )}

              {/* Vitals cards — desktop */}
              <div className="hidden lg:block">
                <VitalsPanel vitals={activeVitals} />
              </div>

              {/* Health Alerts */}
              <HealthAlerts vitals={activeVitals} />

              {/* Charts */}
              <Charts vitals={activeVitals} />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
