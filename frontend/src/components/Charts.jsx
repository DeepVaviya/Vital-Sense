import { LineChart, Line, XAxis, YAxis, ResponsiveContainer, Tooltip, CartesianGrid } from 'recharts';

const CHART_COLORS = {
  pulse: '#E11D48',
  respiration: '#0D9488',
  hrv: '#2563EB',
};

function WaveformChart({ data, title, color, dataKey = 'value', showGrid = false }) {
  const chartData = (data || []).map((v, i) => ({ idx: i, [dataKey]: v }));

  return (
    <div style={{
      background: 'var(--card-bg)',
      border: '1px solid var(--card-border)',
      borderRadius: '14px',
      padding: '18px 20px 14px',
      boxShadow: 'var(--card-shadow)',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '14px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: color, boxShadow: `0 0 6px ${color}40` }} />
          <h3 style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-secondary)', margin: 0, letterSpacing: '0.01em' }}>{title}</h3>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          {chartData.length > 0 && (
            <span style={{ fontSize: '11px', color: 'var(--sublabel-color)', fontWeight: 500, fontFeatureSettings: '"tnum"' }}>{chartData.length} pts</span>
          )}
          <div style={{ width: '6px', height: '6px', borderRadius: '50%', background: chartData.length > 0 ? '#059669' : 'var(--value-muted)' }} />
        </div>
      </div>
      <ResponsiveContainer width="100%" height={130}>
        <LineChart data={chartData}>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--chart-grid)" vertical={false} />
          <XAxis dataKey="idx" hide />
          <YAxis hide domain={['auto', 'auto']} />
          <Tooltip
            contentStyle={{
              background: 'var(--tooltip-bg)',
              border: '1px solid var(--tooltip-border)',
              borderRadius: '10px',
              fontSize: '12px',
              color: 'var(--text-secondary)',
              boxShadow: 'var(--tooltip-shadow)',
              padding: '8px 12px',
            }}
            formatter={(v) => [typeof v === 'number' ? v.toFixed(3) : v, title]}
            labelFormatter={() => ''}
          />
          <Line type="monotone" dataKey={dataKey} stroke={color} strokeWidth={1.8} dot={false} animationDuration={100} isAnimationActive={false} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

function SignalInfoBar({ vitals }) {
  const method = vitals?.rppg_method || 'none';
  const sq = vitals?.signal_quality || 0;
  const snrPos = vitals?.snr_pos || 0;
  const snrChrom = vitals?.snr_chrom || 0;
  const measuredFps = vitals?.measured_fps || 0;

  const qualityLabel = sq >= 3 ? 'Excellent' : sq >= 2 ? 'Good' : sq >= 1.2 ? 'Fair' : 'Low';
  const qualityColor = sq >= 3 ? '#059669' : sq >= 2 ? '#2563EB' : sq >= 1.2 ? '#D97706' : '#DC2626';

  return (
    <div style={{
      background: 'var(--card-bg)',
      border: '1px solid var(--card-border)',
      borderRadius: '14px',
      padding: '12px 18px',
      display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '10px',
      boxShadow: 'var(--card-shadow)',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
        <span style={{ fontSize: '11px', color: 'var(--sublabel-color)', fontWeight: 500 }}>Method</span>
        <span style={{
          fontSize: '11px', fontWeight: 700,
          color: method === 'POS+CHROM' ? '#2563EB' : method === 'GREEN' ? '#059669' : 'var(--sublabel-color)',
          background: method === 'POS+CHROM' ? '#2563EB15' : method === 'GREEN' ? '#05966915' : 'var(--pill-bg)',
          padding: '2px 8px', borderRadius: '6px',
        }}>{method.toUpperCase()}</span>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
        <span style={{ fontSize: '11px', color: 'var(--sublabel-color)', fontWeight: 500 }}>Signal</span>
        <div style={{
          display: 'flex', alignItems: 'center', gap: '5px',
          background: `${qualityColor}15`, padding: '2px 8px', borderRadius: '6px',
        }}>
          <div style={{ width: '6px', height: '6px', borderRadius: '50%', background: qualityColor }} />
          <span style={{ fontSize: '11px', fontWeight: 600, color: qualityColor }}>{qualityLabel}</span>
        </div>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
        <span style={{ fontSize: '10px', color: 'var(--sublabel-color)', fontFeatureSettings: '"tnum"', fontWeight: 500 }}>
          SNR P:{snrPos.toFixed(1)} C:{snrChrom.toFixed(1)} | FPS:{measuredFps}
        </span>
      </div>
    </div>
  );
}

export default function Charts({ vitals }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
      <SignalInfoBar vitals={vitals} />
      <WaveformChart data={vitals?.pulse_waveform || []} title="BVP / Pulse Waveform" color={CHART_COLORS.pulse} showGrid />
      <WaveformChart data={vitals?.respiration_waveform || []} title="Respiration Waveform" color={CHART_COLORS.respiration} />
      <WaveformChart data={vitals?.hrv_timeline || []} title="HRV Timeline (RMSSD)" color={CHART_COLORS.hrv} />
    </div>
  );
}
