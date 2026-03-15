import { useRef, useState } from 'react';
import { motion, useScroll, useTransform } from 'framer-motion';
import { Link } from 'react-router-dom';
import { Activity, ArrowRight, Heart, Stethoscope, Brain } from 'lucide-react';
import useIsMobile from '../hooks/useIsMobile';

/* ─── Marquee ─────────────────────────────────────────────── */
const marqueeItems = [
  'CONTACTLESS MONITORING',
  'COMPUTER VISION',
  'REAL-TIME ANALYTICS',
  'MEDIAPIPE AI',
  'HEART RATE',
  'RESPIRATION',
  'STRESS DETECTION',
  'HRV ANALYSIS',
];

function Marquee() {
  const row = marqueeItems.map((t, i) => (
    <span key={i} style={{ display: 'inline-flex', alignItems: 'center', gap: '2rem' }}>
      <span style={{
        fontSize: 'clamp(1.1rem, 2vw, 1.6rem)',
        fontWeight: 900,
        letterSpacing: '0.06em',
        color: 'var(--text-primary)',
        whiteSpace: 'nowrap',
      }}>
        {t}
      </span>
      <span style={{ color: '#22c55e', fontSize: '1.2rem' }}>✦</span>
    </span>
  ));

  return (
    <div style={{
      width: '100%',
      padding: '1.5rem 0',
      borderTop: '1px solid rgba(0,0,0,0.06)',
      marginTop: '2.5rem',
    }}>
      <motion.div
        animate={{ x: ['0%', '-50%'] }}
        transition={{ duration: 25, repeat: Infinity, ease: 'linear' }}
        style={{ display: 'inline-flex', gap: '2.5rem', whiteSpace: 'nowrap' }}
      >
        {row}{row}
      </motion.div>
    </div>
  );
}

/* ─── Hover Button ────────────────────────────────────────── */
function HoverButton({ children, primary, to }) {
  const [hovered, setHovered] = useState(false);

  const baseStyle = primary
    ? {
        background: hovered
          ? 'linear-gradient(135deg, #16a34a, #059669)'
          : 'linear-gradient(135deg, #22c55e, #16a34a)',
        color: '#fff',
        border: 'none',
        boxShadow: hovered
          ? '0 12px 40px rgba(34,197,94,0.35)'
          : '0 6px 20px rgba(34,197,94,0.15)',
      }
    : {
        background: hovered
          ? 'rgba(0,0,0,0.06)'
          : 'transparent',
        color: 'var(--text-primary)',
        border: '1.5px solid rgba(0,0,0,0.15)',
        boxShadow: 'none',
      };

  return (
    <Link to={to || '/'}>
      <motion.button
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        animate={{ scale: hovered ? 1.05 : 1 }}
        transition={{ duration: 0.2 }}
        style={{
          ...baseStyle,
          padding: '0.9rem 2rem',
          borderRadius: '999px',
          fontSize: '0.95rem',
          fontWeight: 600,
          cursor: 'pointer',
          display: 'inline-flex',
          alignItems: 'center',
          gap: '0.5rem',
          transition: 'background 0.3s, box-shadow 0.3s, border 0.3s',
          fontFamily: 'inherit',
        }}
      >
        {children}
      </motion.button>
    </Link>
  );
}

/* ─── Hover Word ──────────────────────────────────────────── */
function HoverWord({ children, style }) {
  const [h, setH] = useState(false);
  return (
    <motion.span
      onMouseEnter={() => setH(true)}
      onMouseLeave={() => setH(false)}
      animate={
        h
          ? { color: '#22c55e', scale: 1.06, textShadow: '0 0 25px rgba(34,197,94,0.25)' }
          : { color: style?.color || 'var(--text-primary)', scale: 1, textShadow: '0 0 0px transparent' }
      }
      transition={{ duration: 0.2 }}
      style={{
        display: 'inline-block',
        cursor: 'default',
        transformOrigin: 'center bottom',
        ...style,
      }}
    >
      {children}
    </motion.span>
  );
}

/* ─── Reveal Word ─────────────────────────────────────────── */
function RevealWord({ word, scrollYProgress, start, end, style }) {
  const opacity = useTransform(scrollYProgress, [start, end], [0.08, 1]);
  const y = useTransform(scrollYProgress, [start, end], [18, 0]);

  return (
    <motion.span style={{ opacity, y, display: 'inline-block', marginRight: '0.35em' }}>
      <HoverWord style={style}>{word}</HoverWord>
    </motion.span>
  );
}

/* ─── Stat Card ───────────────────────────────────────────── */
const stats = [
  { icon: Heart, label: 'Heart Rate', value: '72 BPM', color: '#22c55e' },
  { icon: Stethoscope, label: 'SpO₂', value: '98%', color: '#059669' },
  { icon: Brain, label: 'Stress', value: 'Low', color: '#10b981' },
];

/* ─── Main Component ──────────────────────────────────────── */
export default function ExpandingCTA() {
  const isMobile = useIsMobile();
  const containerRef = useRef(null);
  const { scrollYProgress } = useScroll({
    target: containerRef,
    offset: ['start start', 'end end'],
  });

  // Box expansion: starts small rounded, expands slowly to fill screen
  const boxScale = useTransform(scrollYProgress, [0, 0.35], [0.65, 1]);
  const borderRadius = useTransform(scrollYProgress, [0, 0.35], [50, 0]);
  const boxOpacity = useTransform(scrollYProgress, [0, 0.12], [0, 1]);

  // Content reveals after box finishes expanding
  const contentOpacity = useTransform(scrollYProgress, [0.3, 0.45], [0, 1]);
  const buttonsOpacity = useTransform(scrollYProgress, [0.55, 0.65], [0, 1]);
  const buttonsY = useTransform(scrollYProgress, [0.55, 0.65], [30, 0]);
  const statsOpacity = useTransform(scrollYProgress, [0.65, 0.75], [0, 1]);
  const statsY = useTransform(scrollYProgress, [0.65, 0.75], [30, 0]);
  const marqueeOpacity = useTransform(scrollYProgress, [0.75, 0.85], [0, 1]);

  const titleText = 'Your Health, Measured Through Your Camera';
  const titleWords = titleText.split(' ');
  const highlightWords = ['Measured', 'Through'];

  const descText =
    'Real-time heart rate, respiration, HRV, stress, and cognitive load — all computed from your webcam using advanced computer vision and signal processing. No wearables needed.';
  const descWords = descText.split(' ');

  return (
    <section ref={containerRef} style={{ height: isMobile ? '400vh' : '600vh', position: 'relative' }}>
      <div style={{ position: 'sticky', top: 0, height: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#0a0a0f', overflow: 'hidden' }}>
        <motion.div
          style={{
            scale: boxScale,
            borderRadius,
            opacity: boxOpacity,
            width: '100%',
            height: '100%',
            background: 'var(--bg-primary)',
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'center',
            alignItems: 'center',
            overflow: 'hidden',
            position: 'relative',
            boxShadow: '0 20px 80px rgba(0,0,0,0.08)',
          }}
        >
          {/* Subtle dot pattern */}
          <div style={{
            position: 'absolute', inset: 0,
            backgroundImage: 'radial-gradient(circle at 1px 1px, rgba(0,0,0,0.03) 1px, transparent 0)',
            backgroundSize: '32px 32px', pointerEvents: 'none',
          }} />

          {/* Green glow */}
          <div style={{
            position: 'absolute', top: '-15%', left: '50%', transform: 'translateX(-50%)',
            width: '500px', height: '350px', borderRadius: '50%',
            background: 'radial-gradient(circle, rgba(34,197,94,0.06), transparent 70%)',
            filter: 'blur(60px)', pointerEvents: 'none',
          }} />

          {/* Content */}
          <motion.div style={{ opacity: contentOpacity, position: 'relative', zIndex: 2, maxWidth: '900px', padding: isMobile ? '0 1rem' : '0 2rem', textAlign: 'center' }}>
            {/* Badge */}
            <div style={{ display: 'flex', justifyContent: 'center', marginBottom: isMobile ? '1rem' : '2rem' }}>
              <span style={{
                display: 'inline-flex', alignItems: 'center', gap: '0.5rem',
                padding: '0.4rem 1.2rem', borderRadius: '999px', fontSize: '0.8rem', fontWeight: 600,
                color: '#22c55e', background: 'rgba(34,197,94,0.08)', border: '1px solid rgba(34,197,94,0.15)',
                letterSpacing: '0.1em',
              }}>
                <Activity size={14} />
                Contactless Physiological Monitoring
              </span>
            </div>

            {/* Title — word-by-word reveal */}
            <h2 className="font-display" style={{
              fontSize: 'clamp(2.2rem, 5.5vw, 4.5rem)', fontWeight: 900,
              lineHeight: 1.1, letterSpacing: '-0.03em', marginBottom: isMobile ? '0.75rem' : '1.5rem',
            }}>
              {titleWords.map((word, i) => {
                const start = 0.35 + (i / titleWords.length) * 0.12;
                const end = start + 0.03;
                const isHighlight = highlightWords.includes(word);
                return (
                  <RevealWord
                    key={i}
                    word={word}
                    scrollYProgress={scrollYProgress}
                    start={start}
                    end={end}
                    style={{
                      color: isHighlight ? '#22c55e' : 'var(--text-primary)',
                      fontWeight: 900,
                    }}
                  />
                );
              })}
            </h2>

            {/* Description — word-by-word reveal */}
            <div style={{ maxWidth: '700px', margin: '0 auto', lineHeight: 1.8 }}>
              {descWords.map((word, i) => {
                const start = 0.45 + (i / descWords.length) * 0.1;
                const end = start + 0.025;
                return (
                  <RevealWord
                    key={i}
                    word={word}
                    scrollYProgress={scrollYProgress}
                    start={start}
                    end={end}
                    style={{ color: '#4a4a68', fontSize: '1.05rem' }}
                  />
                );
              })}
            </div>
          </motion.div>

          {/* Buttons */}
          <motion.div style={{ opacity: buttonsOpacity, y: buttonsY, display: 'flex', flexDirection: 'row', gap: isMobile ? '0.5rem' : '1rem', marginTop: isMobile ? '1rem' : '2.5rem', position: 'relative', zIndex: 2, alignItems: 'center', flexWrap: 'wrap', justifyContent: 'center' }}>
            <HoverButton primary to="/register">
              <Activity size={16} />
              Register & Start
              <ArrowRight size={16} />
            </HoverButton>
            <HoverButton to="/">Learn More</HoverButton>
          </motion.div>

          {/* Stat Cards */}
          <motion.div style={{
            opacity: statsOpacity, y: statsY,
            display: 'flex', flexDirection: 'row', gap: isMobile ? '0.5rem' : '1.5rem', marginTop: isMobile ? '1rem' : '2.5rem',
            position: 'relative', zIndex: 2, alignItems: 'center', justifyContent: 'center',
          }}>
            {stats.map((s, i) => (
              <motion.div
                key={i}
                whileHover={{ scale: 1.05, borderColor: 'rgba(34,197,94,0.25)' }}
                style={{
                  padding: isMobile ? '0.6rem 1rem' : '1rem 2rem', borderRadius: '1rem',
                  background: 'rgba(0,0,0,0.02)', border: '1px solid rgba(0,0,0,0.06)',
                  textAlign: 'center', cursor: 'default',
                  transition: 'border 0.3s',
                }}
              >
                <div style={{ fontSize: '0.75rem', color: '#8a8aa0', marginBottom: '0.3rem' }}>
                  {s.label}
                </div>
                <div style={{ fontSize: '1.3rem', fontWeight: 800, color: s.color }}>
                  {s.value}
                </div>
              </motion.div>
            ))}
          </motion.div>

          {/* Marquee — in the flow, not overlapping */}
          {!isMobile && (
            <motion.div style={{
              opacity: marqueeOpacity,
              width: '100%',
              position: 'relative', zIndex: 2,
            }}>
              <Marquee />
            </motion.div>
          )}
        </motion.div>
      </div>
    </section>
  );
}
