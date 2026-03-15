import { useState } from 'react';
import { Heart, Brain, Eye, Zap, ArrowUpRight } from 'lucide-react';
import useIsMobile from '../hooks/useIsMobile';

const features = [
  {
    icon: Heart,
    title: 'Heart Rate & HRV',
    desc: 'Real-time cardiac monitoring with clinical precision',
    color: '#22c55e',
  },
  {
    icon: Brain,
    title: 'Stress & Cognition',
    desc: 'AI-powered mental wellness and cognitive load analysis',
    color: '#059669',
  },
  {
    icon: Eye,
    title: 'Face Recognition',
    desc: 'Instant identity detection for multi-person tracking',
    color: '#10b981',
  },
  {
    icon: Zap,
    title: 'Real-Time Analytics',
    desc: 'Live dashboards with historical trends and insights',
    color: '#34d399',
  },
];

function FeatureCard({ icon: Icon, title, desc, color, isMobile }) {
  const [hovered, setHovered] = useState(false);
  return (
    <div
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        flex: '1 1 220px',
        padding: isMobile ? '1rem' : '1.5rem',
        borderRadius: '1rem',
        background: hovered ? 'rgba(34,197,94,0.06)' : 'var(--bg-secondary)',
        border: `1px solid ${hovered ? 'rgba(34,197,94,0.25)' : 'var(--border-color)'}`,
        cursor: 'default',
        transition: 'all 0.3s ease',
        transform: hovered ? 'translateY(-4px)' : 'translateY(0)',
        boxShadow: hovered ? '0 8px 30px rgba(34,197,94,0.08)' : 'none',
      }}
    >
      <div style={{
        width: '2.5rem', height: '2.5rem', borderRadius: '0.75rem',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: `${color}15`, marginBottom: '1rem',
      }}>
        <Icon size={18} style={{ color }} />
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', marginBottom: '0.4rem' }}>
        <h4 style={{ fontSize: '0.95rem', fontWeight: 700, color: 'var(--text-primary)', margin: 0 }}>{title}</h4>
        <ArrowUpRight size={14} style={{ color: hovered ? color : 'transparent', transition: 'color 0.3s' }} />
      </div>
      <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', lineHeight: 1.5, margin: 0 }}>{desc}</p>
    </div>
  );
}

export default function RevealFooter() {
  const isMobile = useIsMobile();
  return (
    <footer
      style={{
        position: 'fixed',
        bottom: 0,
        left: 0,
        right: 0,
        height: '100vh',
        zIndex: 1,
        background: 'var(--bg-primary)',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'space-between',
        overflow: 'hidden',
      }}
    >
      {/* Top: Feature cards */}
      <div style={{ padding: isMobile ? '2rem 4vw 0.5rem' : '3.5rem 5vw 1.5rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', marginBottom: isMobile ? '1rem' : '2rem' }}>
          <span style={{
            fontSize: '0.7rem', fontWeight: 700, letterSpacing: '0.15em',
            textTransform: 'uppercase', color: '#22c55e',
            padding: '0.3rem 0.8rem', borderRadius: '999px',
            background: 'rgba(34,197,94,0.08)', border: '1px solid rgba(34,197,94,0.12)',
          }}>
            What We Offer
          </span>
        </div>
        <div style={{ display: 'flex', gap: isMobile ? '0.6rem' : '1rem', flexWrap: 'wrap' }}>
          {features.map((f, i) => (
            <FeatureCard key={i} {...f} isMobile={isMobile} />
          ))}
        </div>
      </div>

      {/* Middle: Stats row */}
      <div style={{ padding: '0 5vw', display: 'flex', justifyContent: 'center', gap: isMobile ? '1.5rem' : '4rem', flexWrap: 'wrap' }}>
        {[
          { label: 'Accuracy', value: '65%' },
          { label: 'Latency', value: '<70ms' },
          { label: 'Landmarks', value: '468' },
          { label: 'Metrics calculated', value: '10+' },
        ].map((s, i) => (
          <div key={i} style={{ textAlign: 'center' }}>
            <div style={{ fontSize: isMobile ? 'clamp(1.2rem, 2vw, 1.5rem)' : 'clamp(1.5rem, 2.5vw, 2rem)', fontWeight: 800, color: '#22c55e' }}>
              {s.value}
            </div>
            <div style={{ fontSize: '0.7rem', fontWeight: 600, color: 'var(--text-muted)', letterSpacing: '0.1em', textTransform: 'uppercase', marginTop: '0.25rem' }}>
              {s.label}
            </div>
          </div>
        ))}
      </div>

      {/* Big VITALSENSE text — black */}
      <div
        style={{
          display: 'flex',
          alignItems: 'flex-end',
          justifyContent: 'center',
          overflow: 'hidden',
        }}
      >
        <h2
          className="font-display"
          style={{
            fontSize: isMobile ? 'clamp(2.5rem, 12vw, 5rem)' : 'clamp(5rem, 15vw, 16rem)',
            fontWeight: 900,
            lineHeight: 0.85,
            textAlign: 'center',
            color: 'var(--text-primary)',
            userSelect: 'none',
            letterSpacing: '-0.03em',
            margin: 0,
          }}
        >
          VITALSENSE
        </h2>
      </div>

      {/* Bottom copyright bar */}
      <div
        style={{
          padding: '1.2rem 5vw',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: isMobile ? 'flex-start' : 'center',
          flexDirection: isMobile ? 'column' : 'row',
          gap: isMobile ? '0.5rem' : '0',
          borderTop: '1px solid var(--border-color)',
        }}
      >
        <span style={{ color: 'var(--text-muted)', fontSize: '0.8rem' }}>
          © 2026 VitalSense — Built by VisionX4 at HackVerse
        </span>
        <span style={{ color: '#22c55e', fontSize: '0.8rem', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
          <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: '#22c55e', display: 'inline-block' }} />
          Systems Online
        </span>
      </div>
    </footer>
  );
}
