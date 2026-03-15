import { useState, useEffect, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  AlertTriangle,
  Heart,
  Wind,
  Activity,
  Zap,
  X,
  Volume2,
  VolumeX,
  ShieldAlert,
  Clock,
} from 'lucide-react';

// ── Danger zone thresholds ──
const ALERT_RULES = [
  {
    id: 'hr_critical_low',
    metric: 'heart_rate',
    label: 'Heart Rate Critically Low',
    condition: (v) => v > 0 && v < 50,
    severity: 'critical',
    icon: Heart,
    message: (v) =>
      `Heart rate is ${v.toFixed(0)} BPM — dangerously low (bradycardia). Seek medical attention if symptoms persist.`,
    color: '#ff2d55',
  },
  {
    id: 'hr_low',
    metric: 'heart_rate',
    label: 'Heart Rate Low',
    condition: (v) => v >= 50 && v < 55,
    severity: 'warning',
    icon: Heart,
    message: (v) =>
      `Heart rate is ${v.toFixed(0)} BPM — below normal range. Monitor closely and rest if feeling dizzy.`,
    color: '#ff8c42',
  },
  {
    id: 'hr_high',
    metric: 'heart_rate',
    label: 'Heart Rate Elevated',
    condition: (v) => v > 120 && v <= 140,
    severity: 'warning',
    icon: Heart,
    message: (v) =>
      `Heart rate is ${v.toFixed(0)} BPM — elevated. Try deep breathing and sit calmly.`,
    color: '#ff8c42',
  },
  {
    id: 'hr_critical_high',
    metric: 'heart_rate',
    label: 'Heart Rate Critically High',
    condition: (v) => v > 140,
    severity: 'critical',
    icon: Heart,
    message: (v) =>
      `Heart rate is ${v.toFixed(0)} BPM — dangerously high (tachycardia). Stop activity and seek help immediately.`,
    color: '#ff2d55',
  },
  {
    id: 'resp_low',
    metric: 'respiration_rate',
    label: 'Respiration Low',
    condition: (v) => v > 0 && v < 10,
    severity: 'warning',
    icon: Wind,
    message: (v) =>
      `Respiration rate is ${v.toFixed(1)} BPM — below normal (12-20). Take slow, deep breaths.`,
    color: '#ff8c42',
  },
  {
    id: 'resp_high',
    metric: 'respiration_rate',
    label: 'Respiration High',
    condition: (v) => v > 24,
    severity: 'warning',
    icon: Wind,
    message: (v) =>
      `Respiration rate is ${v.toFixed(1)} BPM — elevated. Try box breathing: inhale 4s, hold 4s, exhale 4s.`,
    color: '#ff8c42',
  },
  {
    id: 'stress_high',
    metric: 'stress_score',
    label: 'High Stress Detected',
    condition: (v) => v > 70,
    severity: 'warning',
    icon: ShieldAlert,
    message: (v) =>
      `Stress score is ${v.toFixed(0)}/100. Take a break — try the 4-7-8 breathing technique.`,
    color: '#ff8c42',
  },
  {
    id: 'stress_critical',
    metric: 'stress_score',
    label: 'Extreme Stress',
    condition: (v) => v > 85,
    severity: 'critical',
    icon: ShieldAlert,
    message: (v) =>
      `Stress score is ${v.toFixed(0)}/100 — critically high. Step away, hydrate, and practice deep breathing.`,
    color: '#ff2d55',
  },
  {
    id: 'fatigue_high',
    metric: 'fatigue_risk',
    label: 'High Fatigue Risk',
    condition: (v) => v > 70,
    severity: 'warning',
    icon: Zap,
    message: (v) =>
      `Fatigue risk is ${v.toFixed(0)}/100 — you may be exhausted. Consider taking a 5-minute break.`,
    color: '#ff8c42',
  },
  {
    id: 'drowsy',
    metric: 'perclos',
    label: 'Drowsiness Detected',
    condition: (v) => v > 30,
    severity: 'critical',
    icon: Clock,
    message: (v) =>
      `PERCLOS is ${v.toFixed(0)}% — significant drowsiness detected. Stand up and splash cold water on your face.`,
    color: '#ff2d55',
  },
  {
    id: 'hrv_low',
    metric: 'hrv_rmssd',
    label: 'Low HRV',
    condition: (v) => v > 0 && v < 15,
    severity: 'warning',
    icon: Activity,
    message: (v) =>
      `HRV is ${v.toFixed(1)} ms — very low, indicating high physiological strain. Rest and hydrate.`,
    color: '#ff8c42',
  },
];

// Cooldown: don't re-trigger the same alert within 30 seconds
const ALERT_COOLDOWN_MS = 30000;
// How long alerts stay visible before auto-dismiss
const AUTO_DISMISS_MS = 15000;

export default function HealthAlerts({ vitals }) {
  const [activeAlerts, setActiveAlerts] = useState([]);
  const cooldownRef = useRef({});
  const [soundEnabled, setSoundEnabled] = useState(true);
  const audioContextRef = useRef(null);

  // Play alert beep using Web Audio API
  const playAlertSound = useCallback(
    (severity) => {
      if (!soundEnabled) return;
      try {
        if (!audioContextRef.current) {
          audioContextRef.current = new (window.AudioContext ||
            window.webkitAudioContext)();
        }
        const ctx = audioContextRef.current;
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain);
        gain.connect(ctx.destination);

        if (severity === 'critical') {
          // Urgent double beep
          osc.frequency.value = 880;
          gain.gain.setValueAtTime(0.3, ctx.currentTime);
          gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.15);
          osc.start(ctx.currentTime);
          osc.stop(ctx.currentTime + 0.15);
          // Second beep
          const osc2 = ctx.createOscillator();
          const gain2 = ctx.createGain();
          osc2.connect(gain2);
          gain2.connect(ctx.destination);
          osc2.frequency.value = 880;
          gain2.gain.setValueAtTime(0.3, ctx.currentTime + 0.2);
          gain2.gain.exponentialRampToValueAtTime(
            0.01,
            ctx.currentTime + 0.35
          );
          osc2.start(ctx.currentTime + 0.2);
          osc2.stop(ctx.currentTime + 0.35);
        } else {
          // Gentle single beep for warnings
          osc.frequency.value = 660;
          gain.gain.setValueAtTime(0.15, ctx.currentTime);
          gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.2);
          osc.start(ctx.currentTime);
          osc.stop(ctx.currentTime + 0.2);
        }
      } catch (e) {
        /* ignore audio errors */
      }
    },
    [soundEnabled]
  );

  // Check vitals against alert rules
  useEffect(() => {
    if (!vitals) return;

    const now = Date.now();
    const triggered = [];

    for (const rule of ALERT_RULES) {
      const value = vitals[rule.metric];
      if (value === undefined || value === null) continue;

      if (rule.condition(value)) {
        // Check cooldown
        const lastTriggered = cooldownRef.current[rule.id] || 0;
        if (now - lastTriggered < ALERT_COOLDOWN_MS) continue;

        cooldownRef.current[rule.id] = now;
        triggered.push({
          ...rule,
          value,
          triggeredAt: now,
          displayMessage: rule.message(value),
        });
      }
    }

    if (triggered.length > 0) {
      setActiveAlerts((prev) => {
        // Remove duplicates (same rule id)
        const existingIds = new Set(triggered.map((t) => t.id));
        const filtered = prev.filter((a) => !existingIds.has(a.id));
        return [...filtered, ...triggered].slice(-5); // Keep max 5 alerts
      });

      // Play sound for the most severe alert
      const hasCritical = triggered.some((t) => t.severity === 'critical');
      playAlertSound(hasCritical ? 'critical' : 'warning');
    }
  }, [vitals, playAlertSound]);

  // Auto-dismiss old alerts
  useEffect(() => {
    const timer = setInterval(() => {
      const now = Date.now();
      setActiveAlerts((prev) =>
        prev.filter((a) => now - a.triggeredAt < AUTO_DISMISS_MS)
      );
    }, 2000);
    return () => clearInterval(timer);
  }, []);

  const dismissAlert = (id) => {
    setActiveAlerts((prev) => prev.filter((a) => a.id !== id));
  };

  if (activeAlerts.length === 0) return null;

  return (
    <div className="space-y-2">
      {/* Sound toggle */}
      <div className="flex items-center justify-end mb-1">
        <button
          onClick={() => setSoundEnabled(!soundEnabled)}
          className="flex items-center gap-1.5 px-2 py-1 rounded-lg text-xs border-0 cursor-pointer"
          style={{
            background: 'rgba(255,255,255,0.05)',
            color: 'var(--text-muted)',
          }}
          title={soundEnabled ? 'Mute alerts' : 'Unmute alerts'}
        >
          {soundEnabled ? <Volume2 size={12} /> : <VolumeX size={12} />}
          {soundEnabled ? 'Sound On' : 'Muted'}
        </button>
      </div>

      <AnimatePresence mode="popLayout">
        {activeAlerts.map((alert) => {
          const isCritical = alert.severity === 'critical';
          const bgColor = isCritical
            ? 'rgba(255,45,85,0.12)'
            : 'rgba(255,140,66,0.10)';
          const borderColor = isCritical
            ? 'rgba(255,45,85,0.35)'
            : 'rgba(255,140,66,0.25)';
          const Icon = alert.icon;

          return (
            <motion.div
              key={alert.id + '-' + alert.triggeredAt}
              initial={{ opacity: 0, y: -20, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -10, scale: 0.95 }}
              transition={{ type: 'spring', stiffness: 400, damping: 30 }}
              className="relative rounded-xl overflow-hidden"
              style={{
                background: bgColor,
                border: `1px solid ${borderColor}`,
              }}
            >
              {/* Pulsing top bar for critical alerts */}
              {isCritical && (
                <div
                  className="absolute top-0 left-0 right-0 h-1 animate-pulse"
                  style={{
                    background:
                      'linear-gradient(90deg, #ff2d55, #ff6b9d, #ff2d55)',
                  }}
                />
              )}

              <div className="flex items-start gap-3 p-3">
                {/* Icon */}
                <div
                  className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
                  style={{
                    background: `${alert.color}20`,
                  }}
                >
                  {isCritical ? (
                    <AlertTriangle
                      size={20}
                      style={{ color: alert.color }}
                      className="animate-pulse"
                    />
                  ) : (
                    <Icon size={18} style={{ color: alert.color }} />
                  )}
                </div>

                {/* Content */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <span
                      className="text-xs font-bold uppercase tracking-wider"
                      style={{ color: alert.color }}
                    >
                      {isCritical ? '⚠ CRITICAL' : '⚡ WARNING'}
                    </span>
                    <span
                      className="text-xs font-semibold"
                      style={{ color: alert.color, opacity: 0.8 }}
                    >
                      {alert.label}
                    </span>
                  </div>
                  <p
                    className="text-xs leading-relaxed"
                    style={{ color: 'var(--text-secondary)' }}
                  >
                    {alert.displayMessage}
                  </p>
                </div>

                {/* Dismiss button */}
                <button
                  onClick={() => dismissAlert(alert.id)}
                  className="w-6 h-6 rounded-lg flex items-center justify-center flex-shrink-0 border-0 cursor-pointer"
                  style={{
                    background: 'rgba(255,255,255,0.08)',
                    color: 'var(--text-muted)',
                  }}
                >
                  <X size={12} />
                </button>
              </div>

              {/* Auto-dismiss progress bar */}
              <div className="h-0.5" style={{ background: 'rgba(0,0,0,0.2)' }}>
                <motion.div
                  initial={{ width: '100%' }}
                  animate={{ width: '0%' }}
                  transition={{
                    duration: AUTO_DISMISS_MS / 1000,
                    ease: 'linear',
                  }}
                  className="h-full"
                  style={{ background: alert.color, opacity: 0.5 }}
                />
              </div>
            </motion.div>
          );
        })}
      </AnimatePresence>
    </div>
  );
}
