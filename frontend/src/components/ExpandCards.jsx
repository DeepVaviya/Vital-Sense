import { useState } from 'react';
import { motion } from 'framer-motion';
import useIsMobile from '../hooks/useIsMobile';

const cards = [
  {
    title: 'Cardiac Monitoring',
    subtitle: 'Remote Photoplethysmography (rPPG)',
    desc: 'Extracts blood volume pulse signals from facial skin color micro-variations using the CHROM and POS algorithms. Tracks heart rate, inter-beat intervals, and rhythm irregularities in real-time — all from a standard webcam without any wearable sensors.',
    image: '/expand_heartbeat.png',
  },
  {
    title: 'Neural Processing',
    subtitle: 'MediaPipe Face Mesh Engine',
    desc: 'Leverages Google\'s MediaPipe to map 468 3D facial landmarks at 30+ FPS. Our pipeline uses these landmarks to isolate forehead, cheek, and periorbital regions of interest (ROIs) for optimal pulse signal extraction with sub-pixel accuracy.',
    image: '/expand_neural.png',
  },
  {
    title: 'Face Mesh Tracking',
    subtitle: 'Multi-Person Identity Recognition',
    desc: 'Registers facial embeddings during onboarding and matches them in real-time during monitoring. Supports simultaneous tracking of multiple individuals with independent vital sign measurement for each detected person in the camera frame.',
    image: '/expand_face_mesh.png',
  },
  {
    title: 'Stress Detection',
    subtitle: 'Autonomic Nervous System Analysis',
    desc: 'Computes HRV metrics including RMSSD and LF/HF spectral ratio to quantify sympathetic vs. parasympathetic balance. Combined with facial micro-expression analysis, the system produces a composite stress score from 0–100 with clinical-grade reliability.',
    image: '/expand_stress.png',
  },
  {
    title: 'Vital Signs',
    subtitle: 'Comprehensive Physiological Dashboard',
    desc: 'Measures heart rate (BPM), respiration rate, HRV, blood volume pulse waveform, cognitive load, and fatigue risk — all simultaneously. Butterworth bandpass filtering and FFT-based spectral analysis ensure signal precision comparable to contact-based monitors.',
    image: '/expand_vitals.png',
  },
  {
    title: 'Eye Tracking',
    subtitle: 'PERCLOS & Drowsiness Detection',
    desc: 'Monitors blink rate, blink duration, gaze stability, and Percentage of Eye Closure (PERCLOS) — a clinically validated drowsiness metric. Alerts are triggered when fatigue risk exceeds safe thresholds, making it ideal for driver monitoring and workplace safety.',
    image: '/expand_eye.png',
  },
  {
    title: 'Health Analytics',
    subtitle: 'Historical Trends & Anomaly Detection',
    desc: 'Stores averaged vitals every 10 seconds per user. The analytics dashboard visualizes heart rate trends, stress patterns, mood distributions, and fatigue cycles over configurable time ranges. AI-powered anomaly detection flags readings that deviate from the user\'s baseline.',
    image: '/expand_analytics.png',
  },
  {
    title: 'Biomarker Analysis',
    subtitle: 'Signal Quality & Adaptive Algorithms',
    desc: 'Continuously evaluates SNR (signal-to-noise ratio) for both POS and CHROM methods, automatically selecting the higher-quality signal. Adaptive windowing and rolling averages smooth noisy readings while preserving physiological variation for accurate clinical interpretation.',
    image: '/expand_dna.png',
  },
];

export default function ExpandCards() {
  const [activeIdx, setActiveIdx] = useState(null);
  const isMobile = useIsMobile();

  return (
    <section
      style={{
        background: 'var(--bg-primary)',
        padding: 'clamp(3rem, 6vw, 5rem) 5vw',
        position: 'relative',
        overflow: 'hidden',
      }}
    >
      {/* Section title */}
      <div style={{ textAlign: 'center', marginBottom: 'clamp(2rem, 4vw, 3rem)' }}>
        <span
          style={{
            fontSize: '0.7rem',
            fontWeight: 700,
            letterSpacing: '0.15em',
            textTransform: 'uppercase',
            color: '#22c55e',
            padding: '0.3rem 0.8rem',
            borderRadius: '999px',
            background: 'rgba(34,197,94,0.08)',
            border: '1px solid rgba(34,197,94,0.12)',
            display: 'inline-block',
            marginBottom: '1.2rem',
          }}
        >
          Explore Our Capabilities
        </span>
        <h2
          className="font-display"
          style={{
            fontSize: 'clamp(1.8rem, 3.5vw, 3rem)',
            fontWeight: 800,
            color: 'var(--text-primary)',
            lineHeight: 1.15,
            margin: 0,
          }}
        >
          Powering the Future of{' '}
          <span className="gradient-text">Health Tech</span>
        </h2>
      </div>

      {/* Cards container */}
      <div
        onMouseLeave={() => !isMobile && setActiveIdx(null)}
        style={{
          display: 'flex',
          flexDirection: isMobile ? 'column' : 'row',
          alignItems: 'stretch',
          gap: isMobile ? '8px' : 'clamp(6px, 0.8vw, 12px)',
          height: isMobile ? 'auto' : 'clamp(380px, 50vw, 540px)',
          maxWidth: '1300px',
          margin: '0 auto',
        }}
      >
        {cards.map((card, i) => {
          const isActive = i === activeIdx;
          const hasActive = activeIdx !== null;

          return (
            <motion.div
              key={i}
              onMouseEnter={() => !isMobile && setActiveIdx(i)}
              onClick={() => isMobile && setActiveIdx(activeIdx === i ? null : i)}
              animate={{
                flex: isMobile ? 'none' : isActive ? 5 : hasActive ? 0.6 : 1,
              }}
              transition={{
                duration: 0.5,
                ease: [0.4, 0, 0.2, 1],
              }}
              style={{
                position: 'relative',
                borderRadius: 'clamp(14px, 1.8vw, 22px)',
                overflow: 'hidden',
                cursor: 'pointer',
                minWidth: 0,
                border: '1px solid var(--border-color)',
                ...(isMobile ? { height: isActive ? '320px' : '80px', transition: 'height 0.4s ease' } : {}),
              }}
            >
              {/* Background image */}
              <img
                src={card.image}
                alt={card.title}
                style={{
                  position: 'absolute',
                  inset: 0,
                  width: '100%',
                  height: '100%',
                  objectFit: 'cover',
                  transition: 'transform 0.6s cubic-bezier(0.4, 0, 0.2, 1)',
                  transform: isActive ? 'scale(1.05)' : 'scale(1.2)',
                }}
              />

              {/* Dark overlay */}
              <div
                style={{
                  position: 'absolute',
                  inset: 0,
                  background: isActive
                    ? 'linear-gradient(0deg, rgba(0,0,0,0.82) 0%, rgba(0,0,0,0.3) 40%, rgba(0,0,0,0.05) 100%)'
                    : 'linear-gradient(0deg, rgba(0,0,0,0.88) 0%, rgba(0,0,0,0.45) 50%, rgba(0,0,0,0.25) 100%)',
                  transition: 'background 0.5s ease',
                }}
              />

              {/* Content */}
              <div
                style={{
                  position: 'absolute',
                  bottom: 0,
                  left: 0,
                  right: 0,
                  padding: isActive ? 'clamp(20px, 2.2vw, 32px)' : 'clamp(12px, 1.2vw, 18px)',
                  transition: 'padding 0.5s cubic-bezier(0.4,0,0.2,1)',
                }}
              >
                {/* Card number */}
                <span
                  style={{
                    fontSize: '0.6rem',
                    fontWeight: 700,
                    letterSpacing: '0.12em',
                    color: '#22c55e',
                    textTransform: 'uppercase',
                    display: 'block',
                    marginBottom: '0.3rem',
                    opacity: isActive ? 1 : 0.5,
                    transition: 'opacity 0.4s ease',
                  }}
                >
                  0{i + 1}
                </span>

                {/* Title */}
                <h3
                  style={{
                    fontWeight: 700,
                    color: '#ffffff',
                    margin: 0,
                    lineHeight: 1.2,
                    fontSize: isActive ? 'clamp(1.2rem, 2vw, 1.7rem)' : 'clamp(0.65rem, 0.85vw, 0.8rem)',
                    transition: 'font-size 0.5s cubic-bezier(0.4,0,0.2,1)',
                  }}
                >
                  {card.title}
                </h3>

                {/* Expandable content wrapper — uses maxHeight for smooth reveal */}
                <div
                  style={{
                    maxHeight: isActive ? '300px' : '0px',
                    opacity: isActive ? 1 : 0,
                    overflow: 'hidden',
                    transition: 'max-height 0.5s cubic-bezier(0.4,0,0.2,1), opacity 0.4s ease',
                  }}
                >
                  {/* Subtitle */}
                  <p
                    style={{
                      fontSize: 'clamp(0.72rem, 0.85vw, 0.82rem)',
                      color: '#22c55e',
                      fontWeight: 600,
                      lineHeight: 1.3,
                      margin: 0,
                      marginTop: '0.4rem',
                      letterSpacing: '0.01em',
                    }}
                  >
                    {card.subtitle}
                  </p>

                  {/* Description */}
                  <p
                    style={{
                      fontSize: 'clamp(0.72rem, 0.85vw, 0.82rem)',
                      color: 'rgba(255,255,255,0.75)',
                      lineHeight: 1.6,
                      margin: 0,
                      marginTop: '0.5rem',
                      maxWidth: '520px',
                    }}
                  >
                    {card.desc}
                  </p>
                </div>

                {/* Accent line */}
                <div
                  style={{
                    height: '3px',
                    borderRadius: '2px',
                    background: '#22c55e',
                    marginTop: isActive ? '0.8rem' : '0.35rem',
                    width: isActive ? '48px' : '16px',
                    opacity: isActive ? 1 : 0.3,
                    transition: 'all 0.4s cubic-bezier(0.4,0,0.2,1)',
                  }}
                />
              </div>
            </motion.div>
          );
        })}
      </div>
    </section>
  );
}
