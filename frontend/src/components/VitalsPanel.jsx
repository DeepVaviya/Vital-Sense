import { useRef, useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Heart, Wind, Activity, Brain, Shield, Zap, Smile, BarChart3, Eye, Crosshair, Clock, Radio } from 'lucide-react';

// How long (ms) to hold last-known vitals when face is temporarily lost
const HOLD_DURATION_MS = 5000;
// Rolling average window size (number of recent readings to average)
const ROLLING_WINDOW = 5;
// Keys that are numeric and should be rolling-averaged
const NUMERIC_KEYS = [
  'heart_rate', 'respiration_rate', 'hrv_rmssd', 'hrv_lf_hf_ratio',
  'stress_score', 'fatigue_risk', 'blink_rate', 'gaze_stability', 'perclos',
  'signal_quality',
];

// Clinical color palette
const COLORS = {
  cardiac: '#E11D48',
  respiratory: '#0D9488',
  hrv: '#2563EB',
  neuro: '#7C3AED',
  stress: '#D97706',
  signal: '#0891B2',
  eye: '#0284C7',
  mood: '#8B5CF6',
};

const vitalsConfig = [
  {
    key: 'heart_rate', label: 'Heart Rate', unit: 'BPM', icon: Heart, accent: COLORS.cardiac,
    tooltip: 'Beats per minute measured via remote photoplethysmography (rPPG). Normal resting range for adults is 60–100 BPM.',
    format: (v) => v > 0 ? v.toFixed(0) : '--',
    getStatus: (v) => {
      if (!v || v <= 0) return null;
      if (v >= 60 && v <= 100) return { label: 'Normal', color: '#059669' };
      if (v > 100) return { label: 'Elevated', color: '#D97706' };
      return { label: 'Low', color: '#2563EB' };
    },
  },
  {
    key: 'signal_quality', label: 'Signal Quality', unit: '', icon: Radio, accent: COLORS.signal,
    tooltip: 'Quality of the rPPG signal extraction. Higher quality means more accurate vital readings. Keep your face well-lit and steady.',
    format: (v) => {
      if (v === undefined || v === null || v === 0) return '--';
      if (v >= 3) return 'Excellent'; if (v >= 2) return 'Good'; if (v >= 1.2) return 'Fair'; return 'Low';
    },
    getStatus: (v) => {
      if (!v || v === 0) return null;
      if (v >= 3) return { label: '●', color: '#059669' }; if (v >= 2) return { label: '●', color: '#2563EB' };
      if (v >= 1.2) return { label: '●', color: '#D97706' }; return { label: '●', color: '#DC2626' };
    },
  },
  {
    key: 'respiration_rate', label: 'Respiration', unit: 'BPM', icon: Wind, accent: COLORS.respiratory,
    tooltip: 'Breaths per minute derived from subtle chest and facial movements. Normal adult range at rest is 12–20 BPM.',
    format: (v) => v > 0 ? v.toFixed(1) : '--',
    getStatus: (v) => {
      if (!v || v <= 0) return null;
      if (v >= 12 && v <= 20) return { label: 'Normal', color: '#059669' };
      return { label: 'Review', color: '#D97706' };
    },
  },
  { key: 'hrv_rmssd', label: 'HRV (RMSSD)', unit: 'ms', icon: Activity, accent: COLORS.hrv,
    tooltip: 'Heart Rate Variability — the root mean square of successive RR-interval differences. Higher values indicate better autonomic regulation.',
    format: (v) => v > 0 ? v.toFixed(1) : '--' },
  { key: 'hrv_lf_hf_ratio', label: 'LF/HF Ratio', unit: '', icon: BarChart3, accent: COLORS.hrv,
    tooltip: 'Low-frequency to high-frequency power ratio from HRV spectral analysis. Values > 2 may indicate higher sympathetic activity.',
    format: (v) => v > 0 ? v.toFixed(2) : '--' },
  {
    key: 'stress_score', label: 'Stress Score', unit: '/ 100', icon: Shield, accent: COLORS.stress,
    tooltip: 'Composite stress index derived from HRV, respiration patterns, and facial micro-expressions. 0–30 low, 30–60 moderate, 60+ high.',
    format: (v) => v > 0 ? v.toFixed(0) : '--',
    getStatus: (v) => {
      if (!v || v <= 0) return null;
      if (v <= 30) return { label: 'Low', color: '#059669' }; if (v <= 60) return { label: 'Moderate', color: '#D97706' };
      return { label: 'High', color: '#DC2626' };
    },
  },
  { key: 'mood', label: 'Mood', unit: '', icon: Smile, accent: COLORS.mood,
    tooltip: 'Current emotional state inferred from facial expression analysis and physiological patterns.',
    format: (v) => v || '--' },
  { key: 'cognitive_load', label: 'Cognitive Load', unit: '', icon: Brain, accent: COLORS.neuro,
    tooltip: 'Estimated mental workload based on blink patterns, pupil variations, and gaze stability.',
    format: (v) => v || '--' },
  {
    key: 'fatigue_risk', label: 'Fatigue Risk', unit: '/ 100', icon: Zap, accent: COLORS.stress,
    tooltip: 'Risk of fatigue based on blink frequency, PERCLOS, and physiological markers. Scores above 60 suggest significant fatigue.',
    format: (v) => v > 0 ? v.toFixed(0) : '--',
    getStatus: (v) => {
      if (!v || v <= 0) return null;
      if (v <= 30) return { label: 'Low', color: '#059669' }; if (v <= 60) return { label: 'Moderate', color: '#D97706' };
      return { label: 'High', color: '#DC2626' };
    },
  },
  { key: 'blink_rate', label: 'Blink Rate', unit: '/min', icon: Eye, accent: COLORS.eye,
    tooltip: 'Number of blinks per minute. Normal range is 15–20 blinks/min.',
    format: (v) => v > 0 ? v.toFixed(1) : '--' },
  { key: 'gaze_stability', label: 'Gaze Stability', unit: '%', icon: Crosshair, accent: COLORS.eye,
    tooltip: 'Percentage of time the gaze remains steady. Higher values indicate better focus.',
    format: (v) => { if (v === undefined || v === null) return '--'; return (v * 100).toFixed(0); } },
  {
    key: 'perclos', label: 'Drowsiness', unit: '(PERCLOS)', icon: Clock, accent: COLORS.cardiac,
    tooltip: 'Percentage of eye closure — a clinical measure of drowsiness. Values above 25% indicate significant drowsiness.',
    format: (v) => { if (v === undefined || v === null || v === 0) return '--'; return `${v.toFixed(0)}%`; },
    getStatus: (v) => {
      if (!v || v === 0) return null;
      if (v > 25) return { label: 'Alert', color: '#DC2626' };
      return { label: 'Normal', color: '#059669' };
    },
  },
];

export default function VitalsPanel({ vitals }) {
  const rollingRef = useRef({});
  const lastGoodRef = useRef({ data: null, timestamp: 0 });
  const hasData = vitals && (vitals.heart_rate > 0 || vitals.stress_score > 0 || vitals.blink_rate > 0);

  useEffect(() => {
    if (!hasData) return;
    lastGoodRef.current = { data: { ...vitals }, timestamp: Date.now() };
    for (const key of NUMERIC_KEYS) {
      const val = vitals[key];
      if (val !== undefined && val !== null && val > 0) {
        if (!rollingRef.current[key]) rollingRef.current[key] = [];
        rollingRef.current[key].push(val);
        if (rollingRef.current[key].length > ROLLING_WINDOW) rollingRef.current[key].shift();
      }
    }
  }, [vitals, hasData]);

  let displayVitals = vitals;
  if (!hasData) {
    const elapsed = Date.now() - lastGoodRef.current.timestamp;
    if (lastGoodRef.current.data && elapsed < HOLD_DURATION_MS) displayVitals = lastGoodRef.current.data;
  }

  const smoothedVitals = displayVitals ? { ...displayVitals } : displayVitals;
  if (smoothedVitals) {
    for (const key of NUMERIC_KEYS) {
      const buf = rollingRef.current[key];
      if (buf && buf.length > 0) smoothedVitals[key] = buf.reduce((a, b) => a + b, 0) / buf.length;
    }
  }

  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
      {vitalsConfig.map((cfg, i) => (
        <VitalCard key={cfg.key} cfg={cfg} value={smoothedVitals?.[cfg.key]} index={i} />
      ))}
    </div>
  );
}

function VitalCard({ cfg, value, index }) {
  const [showTooltip, setShowTooltip] = useState(false);
  const [isHovered, setIsHovered] = useState(false);
  const timerRef = useRef(null);
  const displayValue = cfg.format(value);
  const isActive = displayValue !== '--';
  const status = cfg.getStatus ? cfg.getStatus(value) : null;

  const handleMouseEnter = () => { setIsHovered(true); timerRef.current = setTimeout(() => setShowTooltip(true), 300); };
  const handleMouseLeave = () => { setIsHovered(false); if (timerRef.current) clearTimeout(timerRef.current); setShowTooltip(false); };
  useEffect(() => () => { if (timerRef.current) clearTimeout(timerRef.current); }, []);

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.04 }}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      style={{
        background: 'var(--card-bg)',
        borderRadius: '14px',
        border: '1px solid var(--card-border)',
        borderLeft: `4px solid ${isActive ? cfg.accent : 'var(--value-muted)'}`,
        padding: '16px 16px 14px 14px',
        position: 'relative',
        overflow: 'visible',
        boxShadow: 'var(--card-shadow)',
        transition: 'all 0.25s cubic-bezier(0.4, 0, 0.2, 1)',
        cursor: 'default',
        zIndex: isHovered ? 50 : 1,
      }}
      whileHover={{ y: -3, boxShadow: 'var(--card-shadow-hover)' }}
    >
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '10px' }}>
        <div style={{
          width: '32px', height: '32px', borderRadius: '8px',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          background: isActive ? `${cfg.accent}15` : 'var(--pill-bg)',
          transition: 'background 0.3s ease',
        }}>
          <cfg.icon size={16} style={{ color: isActive ? cfg.accent : 'var(--sublabel-color)', transition: 'color 0.3s ease' }} />
        </div>
        {status && (
          <span style={{
            fontSize: '10px', fontWeight: 600, color: status.color,
            background: `${status.color}15`, padding: '2px 8px', borderRadius: '10px',
          }}>{status.label}</span>
        )}
      </div>

      {/* Value */}
      <div style={{
        fontSize: '24px', fontWeight: 700,
        color: isActive ? 'var(--value-color)' : 'var(--value-muted)',
        fontFeatureSettings: '"tnum"', lineHeight: 1.1, marginBottom: '4px', letterSpacing: '-0.02em',
        transition: 'color 0.3s ease',
      }}>{displayValue}</div>

      {/* Label */}
      <div style={{ display: 'flex', alignItems: 'baseline', gap: '4px' }}>
        <span style={{ fontSize: '11px', fontWeight: 500, color: 'var(--label-color)' }}>{cfg.label}</span>
        {cfg.unit && <span style={{ fontSize: '10px', color: 'var(--sublabel-color)' }}>{cfg.unit}</span>}
      </div>

      {/* Tooltip */}
      <AnimatePresence>
        {showTooltip && cfg.tooltip && (
          <motion.div
            initial={{ opacity: 0, y: -4, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -4, scale: 0.97 }}
            transition={{ duration: 0.2, ease: [0.4, 0, 0.2, 1] }}
            style={{
              position: 'absolute', top: 'calc(100% + 8px)', left: '0', right: '0', zIndex: 50,
              background: 'var(--tooltip-bg)', border: '1px solid var(--tooltip-border)',
              borderRadius: '12px', padding: '12px 14px',
              boxShadow: 'var(--tooltip-shadow)', pointerEvents: 'none',
            }}
          >
            <div style={{
              position: 'absolute', top: '-5px', left: '20px', width: '10px', height: '10px',
              background: 'var(--tooltip-bg)', border: '1px solid var(--tooltip-border)',
              borderRight: 'none', borderBottom: 'none', transform: 'rotate(45deg)',
            }} />
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '6px' }}>
              <div style={{ width: '6px', height: '6px', borderRadius: '50%', background: cfg.accent, flexShrink: 0 }} />
              <span style={{ fontSize: '11px', fontWeight: 700, color: 'var(--value-color)' }}>{cfg.label}</span>
            </div>
            <p style={{ fontSize: '11px', lineHeight: 1.55, color: 'var(--label-color)', margin: 0 }}>{cfg.tooltip}</p>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
