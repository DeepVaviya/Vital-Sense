import { useState, useEffect, useCallback } from 'react';
import { motion } from 'framer-motion';
import {
  LineChart, Line, XAxis, YAxis, ResponsiveContainer, Tooltip,
  AreaChart, Area, CartesianGrid,
} from 'recharts';
import {
  BarChart3, Users, Calendar, TrendingUp, AlertTriangle,
  Brain, Heart, Wind, Activity, Shield, Zap, Loader2, ChevronDown,
  Eye, Sparkles, RefreshCw, CheckCircle, AlertCircle, XCircle
} from 'lucide-react';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000';

const RANGES = [
  { id: 'daily', label: 'Daily', icon: Calendar },
  { id: 'weekly', label: 'Weekly', icon: Calendar },
  { id: 'monthly', label: 'Monthly', icon: Calendar },
];

const chartConfigs = [
  { key: 'heart_rate', label: 'Heart Rate', unit: 'BPM', color: '#ff6b9d', icon: Heart },
  { key: 'hrv', label: 'HRV (RMSSD)', unit: 'ms', color: '#4f8cff', icon: Activity },
  { key: 'stress_score', label: 'Stress Score', unit: '/100', color: '#ff8c42', icon: Shield },
  { key: 'respiration_rate', label: 'Respiration Rate', unit: 'BPM', color: '#06d6a0', icon: Wind },
  { key: 'fatigue_risk', label: 'Fatigue Risk', unit: '/100', color: '#ffd166', icon: Zap },
];

const iconMap = {
  heart: Heart,
  wind: Wind,
  brain: Brain,
  eye: Eye,
  zap: Zap,
  shield: Shield,
};

const statusColors = {
  normal: { bg: 'rgba(6,214,160,0.1)', border: 'rgba(6,214,160,0.3)', text: '#06d6a0' },
  low: { bg: 'rgba(79,140,255,0.1)', border: 'rgba(79,140,255,0.3)', text: '#4f8cff' },
  high: { bg: 'rgba(255,140,66,0.1)', border: 'rgba(255,140,66,0.3)', text: '#ff8c42' },
  critical: { bg: 'rgba(255,107,157,0.1)', border: 'rgba(255,107,157,0.3)', text: '#ff6b9d' },
};

const overallStatusConfig = {
  healthy: { color: '#06d6a0', icon: CheckCircle, label: 'Healthy' },
  caution: { color: '#ffd166', icon: AlertCircle, label: 'Caution' },
  alert: { color: '#ff6b9d', icon: XCircle, label: 'Alert' },
  unknown: { color: '#6b6b80', icon: AlertCircle, label: 'Unknown' },
};

export default function Analytics() {
  const [users, setUsers] = useState([]);
  const [selectedUser, setSelectedUser] = useState(null);
  const [range, setRange] = useState('daily');
  const [records, setRecords] = useState([]);
  const [predictions, setPredictions] = useState(null);
  const [loading, setLoading] = useState(false);
  const [dropdownOpen, setDropdownOpen] = useState(false);

  // AI Suggestions state
  const [aiSuggestions, setAiSuggestions] = useState(null);
  const [aiLoading, setAiLoading] = useState(false);

  // Load registered users
  useEffect(() => {
    fetch(`${API_URL}/api/registered-users`)
      .then(r => r.json())
      .then(data => {
        setUsers(data || []);
        if (data && data.length > 0) {
          setSelectedUser(data[0]);
        }
      })
      .catch(err => console.error('Failed to load users:', err));
  }, []);

  // Load analytics data when user or range changes
  const loadAnalytics = useCallback(async () => {
    if (!selectedUser) return;
    setLoading(true);

    try {
      const [analyticsRes, predictionsRes] = await Promise.all([
        fetch(`${API_URL}/api/analytics/${selectedUser.user_id}?range=${range}`),
        fetch(`${API_URL}/api/predictions/${selectedUser.user_id}`),
      ]);

      const analyticsData = await analyticsRes.json();
      setRecords(analyticsData.records || []);

      if (predictionsRes.ok) {
        const predData = await predictionsRes.json();
        setPredictions(predData);
      }
    } catch (err) {
      console.error('Failed to load analytics:', err);
    } finally {
      setLoading(false);
    }
  }, [selectedUser, range]);

  useEffect(() => {
    loadAnalytics();
  }, [loadAnalytics]);

  // Fetch AI suggestions from Gemini
  const fetchAiSuggestions = useCallback(async () => {
    if (!records || records.length === 0) return;
    setAiLoading(true);
    try {
      // Use the latest record's vitals
      const latest = records[records.length - 1];
      const vitals = {
        heart_rate: latest.heart_rate || 0,
        respiration_rate: latest.respiration_rate || 0,
        hrv_rmssd: latest.hrv || latest.hrv_rmssd || 0,
        stress_score: latest.stress_score || 0,
        fatigue_risk: latest.fatigue_risk || 0,
        mood: latest.mood || 'Unknown',
        cognitive_load: latest.cognitive_load || 'Unknown',
        blink_rate: latest.blink_rate || 0,
        gaze_stability: latest.gaze_stability || 0,
        perclos: latest.perclos || 0,
      };

      const res = await fetch(`${API_URL}/api/ai-suggestions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(vitals),
      });

      if (res.ok) {
        const data = await res.json();
        setAiSuggestions(data);
      }
    } catch (err) {
      console.error('Failed to fetch AI suggestions:', err);
    } finally {
      setAiLoading(false);
    }
  }, [records]);

  // Auto-fetch suggestions when records load
  useEffect(() => {
    if (records.length > 0 && !aiSuggestions) {
      fetchAiSuggestions();
    }
  }, [records]);

  // Format chart data with timestamps
  const chartData = records.map((r, i) => ({
    ...r,
    index: i,
    time: new Date(r.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    date: new Date(r.timestamp).toLocaleDateString([], { month: 'short', day: 'numeric' }),
  }));

  // Compute summary stats
  const stats = chartConfigs.map(cfg => {
    const values = records.map(r => r[cfg.key]).filter(v => v > 0);
    return {
      ...cfg,
      avg: values.length > 0 ? (values.reduce((a, b) => a + b, 0) / values.length).toFixed(1) : '--',
      min: values.length > 0 ? Math.min(...values).toFixed(1) : '--',
      max: values.length > 0 ? Math.max(...values).toFixed(1) : '--',
      count: values.length,
    };
  });

  return (
    <div className="min-h-screen pt-24 pb-10 px-4" style={{ background: 'var(--bg-primary)' }}>
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}
                    className="mb-8">
          <div className="flex items-center gap-3 mb-2">
            <div className="w-10 h-10 rounded-xl flex items-center justify-center"
                 style={{ background: 'linear-gradient(135deg, rgba(79,140,255,0.2), rgba(139,92,246,0.2))' }}>
              <BarChart3 size={22} style={{ color: '#4f8cff' }} />
            </div>
            <div>
              <h1 className="text-2xl font-bold">
                Health <span className="gradient-text">Analytics</span>
              </h1>
              <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>
                Historical trends, insights, and AI-powered health suggestions
              </p>
            </div>
          </div>
        </motion.div>

        {/* Controls */}
        <div className="flex items-center gap-3 mb-6 flex-wrap">
          {/* User Selector */}
          <div className="relative">
            <button
              onClick={() => setDropdownOpen(!dropdownOpen)}
              className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium border-0 cursor-pointer min-w-[200px]"
              style={{
                background: 'var(--card-bg)',
                color: 'var(--text-primary)',
                border: '1px solid var(--glass-border)',
              }}
            >
              <Users size={16} style={{ color: '#4f8cff' }} />
              <span className="flex-1 text-left">{selectedUser?.name || 'Select User'}</span>
              <ChevronDown size={14} style={{ color: 'var(--text-muted)' }} />
            </button>

            {dropdownOpen && (
              <motion.div
                initial={{ opacity: 0, y: -5 }}
                animate={{ opacity: 1, y: 0 }}
                className="absolute top-full left-0 right-0 mt-1 rounded-xl overflow-hidden z-50"
                style={{ background: 'var(--bg-secondary)', border: '1px solid var(--glass-border)' }}
              >
                {users.length === 0 ? (
                  <div className="px-4 py-3 text-sm" style={{ color: 'var(--text-muted)' }}>
                    No registered users
                  </div>
                ) : (
                  users.map(user => (
                    <button
                      key={user.user_id}
                      onClick={() => { setSelectedUser(user); setDropdownOpen(false); setAiSuggestions(null); }}
                      className="w-full px-4 py-3 text-left text-sm font-medium border-0 cursor-pointer block"
                      style={{
                        background: selectedUser?.user_id === user.user_id
                          ? 'rgba(79,140,255,0.1)' : 'transparent',
                        color: selectedUser?.user_id === user.user_id
                          ? '#4f8cff' : 'var(--text-secondary)',
                      }}
                    >
                      {user.name} {user.age ? `(${user.age}y)` : ''}
                    </button>
                  ))
                )}
              </motion.div>
            )}
          </div>

          {/* Range Selector */}
          <div className="flex items-center gap-1 p-1 rounded-xl"
               style={{ background: 'var(--card-bg)', border: '1px solid var(--glass-border)' }}>
            {RANGES.map((r) => (
              <button
                key={r.id}
                onClick={() => setRange(r.id)}
                className="px-4 py-2 rounded-lg text-xs font-medium border-0 cursor-pointer transition-all"
                style={{
                  background: range === r.id ? 'rgba(79,140,255,0.2)' : 'transparent',
                  color: range === r.id ? '#4f8cff' : 'var(--text-muted)',
                }}
              >
                {r.label}
              </button>
            ))}
          </div>

          {/* Refresh */}
          <button
            onClick={loadAnalytics}
            disabled={loading}
            className="px-4 py-2.5 rounded-xl text-xs font-medium border-0 cursor-pointer"
            style={{ background: 'rgba(79,140,255,0.1)', color: '#4f8cff', border: '1px solid rgba(79,140,255,0.2)' }}
          >
            {loading ? <Loader2 size={14} className="animate-spin" /> : 'Refresh'}
          </button>
        </div>

        {/* No data state */}
        {!loading && records.length === 0 && selectedUser && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}
                      className="glass-card p-12 text-center mb-6">
            <BarChart3 size={48} className="mx-auto mb-4" style={{ color: 'var(--text-muted)' }} />
            <h3 className="text-lg font-bold mb-2">No Data Yet</h3>
            <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
              Start monitoring on the Monitor page to begin collecting data for {selectedUser.name}.
            </p>
          </motion.div>
        )}

        {/* Summary Stats */}
        {records.length > 0 && (
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-6">
            {stats.map((s, i) => (
              <motion.div
                key={s.key}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.05 }}
                className="glass-card p-4"
              >
                <div className="flex items-center gap-2 mb-2">
                  <s.icon size={16} style={{ color: s.color }} />
                  <span className="text-xs font-medium" style={{ color: 'var(--text-muted)' }}>{s.label}</span>
                </div>
                <div className="text-xl font-bold" style={{ color: s.color }}>{s.avg}</div>
                <div className="text-xs mt-1" style={{ color: 'var(--text-muted)' }}>
                  {s.count} readings • {s.min}–{s.max} {s.unit}
                </div>
              </motion.div>
            ))}
          </div>
        )}

        {/* Charts */}
        {records.length > 0 && (
          <div className="grid lg:grid-cols-2 gap-4 mb-6">
            {chartConfigs.map((cfg, i) => (
              <motion.div
                key={cfg.key}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.1 }}
                className="glass-card p-5"
              >
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-2">
                    <cfg.icon size={16} style={{ color: cfg.color }} />
                    <h3 className="text-sm font-semibold">{cfg.label}</h3>
                  </div>
                  <span className="text-xs" style={{ color: 'var(--text-muted)' }}>{cfg.unit}</span>
                </div>
                <ResponsiveContainer width="100%" height={180}>
                  <AreaChart data={chartData}>
                    <defs>
                      <linearGradient id={`grad-${cfg.key}`} x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor={cfg.color} stopOpacity={0.3} />
                        <stop offset="95%" stopColor={cfg.color} stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                    <XAxis
                      dataKey={range === 'daily' ? 'time' : 'date'}
                      tick={{ fontSize: 10, fill: '#6b6b80' }}
                      tickLine={false}
                      axisLine={false}
                      interval="preserveStartEnd"
                    />
                    <YAxis
                      tick={{ fontSize: 10, fill: '#6b6b80' }}
                      tickLine={false}
                      axisLine={false}
                      domain={['auto', 'auto']}
                      width={35}
                    />
                    <Tooltip
                      contentStyle={{
                        background: 'var(--tooltip-bg)',
                        border: '1px solid var(--tooltip-border)',
                        borderRadius: '8px',
                        fontSize: '12px',
                        color: 'var(--text-primary)',
                      }}
                      formatter={(v) => [typeof v === 'number' ? v.toFixed(1) : v, cfg.label]}
                    />
                    <Area
                      type="monotone"
                      dataKey={cfg.key}
                      stroke={cfg.color}
                      strokeWidth={2}
                      fill={`url(#grad-${cfg.key})`}
                      dot={false}
                      animationDuration={500}
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </motion.div>
            ))}
          </div>
        )}

        {/* ── AI Health Suggestions (Gemini) ── */}
        {records.length > 0 && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3 }}
            className="glass-card p-6 mb-6"
            style={{
              background: 'linear-gradient(135deg, rgba(139,92,246,0.05), rgba(79,140,255,0.05))',
              border: '1px solid rgba(139,92,246,0.15)',
            }}
          >
            <div className="flex items-center justify-between mb-5">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl flex items-center justify-center"
                     style={{
                       background: 'linear-gradient(135deg, rgba(139,92,246,0.2), rgba(99,102,241,0.2))',
                       boxShadow: '0 0 20px rgba(139,92,246,0.15)',
                     }}>
                  <Sparkles size={22} style={{ color: '#a78bfa' }} />
                </div>
                <div>
                  <h3 className="text-base font-bold flex items-center gap-2">
                    AI Health Suggestions
                    <span className="text-xs font-normal px-2 py-0.5 rounded-full"
                          style={{ background: 'rgba(139,92,246,0.15)', color: '#a78bfa' }}>
                      Gemini AI
                    </span>
                  </h3>
                  <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
                    Personalized health recommendations powered by Google Gemini
                  </p>
                </div>
              </div>
              <button
                onClick={fetchAiSuggestions}
                disabled={aiLoading}
                className="flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-medium border-0 cursor-pointer transition-all"
                style={{
                  background: aiLoading
                    ? 'rgba(139,92,246,0.1)'
                    : 'linear-gradient(135deg, rgba(139,92,246,0.2), rgba(99,102,241,0.2))',
                  color: '#a78bfa',
                  border: '1px solid rgba(139,92,246,0.2)',
                }}
              >
                {aiLoading ? (
                  <><Loader2 size={14} className="animate-spin" /> Analyzing...</>
                ) : (
                  <><RefreshCw size={14} /> Get Suggestions</>
                )}
              </button>
            </div>

            {/* Loading State */}
            {aiLoading && !aiSuggestions && (
              <div className="flex flex-col items-center justify-center py-8">
                <div className="relative">
                  <Loader2 size={36} className="animate-spin" style={{ color: '#a78bfa' }} />
                  <Sparkles size={14} className="absolute -top-1 -right-1" style={{ color: '#ffd166' }} />
                </div>
                <p className="text-sm mt-3" style={{ color: 'var(--text-secondary)' }}>
                  Gemini AI is analyzing your health data...
                </p>
              </div>
            )}

            {/* Suggestions Content */}
            {aiSuggestions && (
              <div>
                {/* Overall Status Banner */}
                {(() => {
                  const sc = overallStatusConfig[aiSuggestions.overall_status] || overallStatusConfig.unknown;
                  const StatusIcon = sc.icon;
                  return (
                    <div className="flex items-center gap-3 p-4 rounded-xl mb-4"
                         style={{
                           background: `${sc.color}10`,
                           border: `1px solid ${sc.color}30`,
                         }}>
                      <StatusIcon size={20} style={{ color: sc.color }} />
                      <div>
                        <span className="text-xs font-bold uppercase tracking-wider" style={{ color: sc.color }}>
                          {sc.label}
                        </span>
                        <p className="text-sm mt-0.5" style={{ color: 'var(--text-secondary)' }}>
                          {aiSuggestions.overall_summary}
                        </p>
                      </div>
                    </div>
                  );
                })()}

                {/* Suggestion Cards */}
                <div className="grid md:grid-cols-2 gap-3">
                  {(aiSuggestions.suggestions || []).map((sug, i) => {
                    const SugIcon = iconMap[sug.icon] || Brain;
                    const sc = statusColors[sug.status] || statusColors.normal;
                    return (
                      <motion.div
                        key={i}
                        initial={{ opacity: 0, x: -10 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: i * 0.08 }}
                        className="p-4 rounded-xl"
                        style={{
                          background: sc.bg,
                          border: `1px solid ${sc.border}`,
                        }}
                      >
                        <div className="flex items-start gap-3">
                          <div className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 mt-0.5"
                               style={{ background: `${sc.text}15` }}>
                            <SugIcon size={16} style={{ color: sc.text }} />
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-1">
                              <span className="text-xs font-bold" style={{ color: sc.text }}>
                                {sug.metric}
                              </span>
                              {sug.value && (
                                <span className="text-xs px-1.5 py-0.5 rounded-md"
                                      style={{ background: `${sc.text}15`, color: sc.text }}>
                                  {sug.value}
                                </span>
                              )}
                              <span className="text-xs px-1.5 py-0.5 rounded-full uppercase font-bold tracking-wider"
                                    style={{ background: `${sc.text}20`, color: sc.text, fontSize: '9px' }}>
                                {sug.status}
                              </span>
                            </div>
                            <p className="text-xs leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
                              {sug.suggestion}
                            </p>
                          </div>
                        </div>
                      </motion.div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Empty state - no suggestions fetched yet */}
            {!aiSuggestions && !aiLoading && (
              <div className="text-center py-6">
                <Sparkles size={32} className="mx-auto mb-3" style={{ color: 'var(--text-muted)', opacity: 0.5 }} />
                <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
                  Click "Get Suggestions" to receive AI-powered health recommendations
                </p>
              </div>
            )}
          </motion.div>
        )}

        {/* AI Predictions */}
        {predictions && (
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}
                      className="glass-card p-6 mb-6">
            <div className="flex items-center gap-2 mb-5">
              <div className="w-9 h-9 rounded-xl flex items-center justify-center"
                   style={{ background: 'rgba(139,92,246,0.15)' }}>
                <Brain size={20} style={{ color: '#8b5cf6' }} />
              </div>
              <div>
                <h3 className="text-base font-bold">AI Predictions</h3>
                <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
                  Machine learning insights from your health data
                </p>
              </div>
            </div>

            <div className="grid md:grid-cols-3 gap-4">
              {/* Stress Trend */}
              <div className="p-4 rounded-xl" style={{ background: 'var(--bg-card)', border: '1px solid var(--glass-border)' }}>
                <div className="flex items-center gap-2 mb-2">
                  <TrendingUp size={16} style={{ color: stressColor(predictions.stress_direction) }} />
                  <span className="text-xs font-semibold" style={{ color: stressColor(predictions.stress_direction) }}>
                    Stress {predictions.stress_direction === 'increasing' ? '↑' : predictions.stress_direction === 'decreasing' ? '↓' : '→'}
                  </span>
                </div>
                <p className="text-xs leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
                  {predictions.stress_trend}
                </p>
              </div>

              {/* Fatigue Risk */}
              <div className="p-4 rounded-xl" style={{ background: 'var(--bg-card)', border: '1px solid var(--glass-border)' }}>
                <div className="flex items-center gap-2 mb-2">
                  <Zap size={16} style={{ color: fatigueColor(predictions.fatigue_level) }} />
                  <span className="text-xs font-semibold" style={{ color: fatigueColor(predictions.fatigue_level) }}>
                    Fatigue: {predictions.fatigue_level}
                  </span>
                </div>
                <p className="text-xs leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
                  {predictions.fatigue_risk_prediction}
                </p>
              </div>

              {/* Anomalies */}
              <div className="p-4 rounded-xl" style={{ background: 'var(--bg-card)', border: '1px solid var(--glass-border)' }}>
                <div className="flex items-center gap-2 mb-2">
                  <AlertTriangle size={16} style={{ color: predictions.anomaly_count > 0 ? '#ff6b9d' : '#06d6a0' }} />
                  <span className="text-xs font-semibold" style={{ color: predictions.anomaly_count > 0 ? '#ff6b9d' : '#06d6a0' }}>
                    {predictions.anomaly_count} Anomal{predictions.anomaly_count === 1 ? 'y' : 'ies'}
                  </span>
                </div>
                {predictions.anomaly_alerts && predictions.anomaly_alerts.length > 0 ? (
                  <div className="space-y-1">
                    {predictions.anomaly_alerts.map((alert, i) => (
                      <p key={i} className="text-xs leading-relaxed" style={{ color: '#ff6b9d' }}>
                        ⚠ {alert}
                      </p>
                    ))}
                  </div>
                ) : (
                  <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>
                    No anomalies detected. All metrics within normal range.
                  </p>
                )}
              </div>
            </div>
          </motion.div>
        )}
      </div>
    </div>
  );
}

function stressColor(direction) {
  if (direction === 'increasing') return '#ff6b9d';
  if (direction === 'decreasing') return '#06d6a0';
  return '#ffd166';
}

function fatigueColor(level) {
  if (level === 'high') return '#ff6b9d';
  if (level === 'moderate') return '#ff8c42';
  return '#06d6a0';
}

