import { useRef } from 'react';
import { motion, useScroll, useTransform } from 'framer-motion';
import { Scan, Cpu, BarChart3, Heart, Shield } from 'lucide-react';
import useIsMobile from '../hooks/useIsMobile';

const infoItems = [
  {
    num: 1,
    icon: Scan,
    title: 'Face Recognition',
    desc: 'Register your face once and get identified automatically. No passwords, no login required — just look at the camera and VitalSense recognizes you in milliseconds.',
    image: '/card_face_recognition.png',
  },
  {
    num: 2,
    icon: Cpu,
    title: 'AI-Powered Processing',
    desc: 'MediaPipe Face Mesh tracks 468 facial landmarks in real-time. The CHROM algorithm extracts pulse signals from subtle skin color changes invisible to the naked eye.',
    image: '/card_ai_processing.png',
  },
  {
    num: 3,
    icon: BarChart3,
    title: 'Signal Analysis',
    desc: 'Butterworth bandpass filtering, peak detection, and FFT-based frequency analysis extract vital signs with clinical-grade precision from your webcam feed.',
    image: '/card_signal_analysis.png',
  },
  {
    num: 4,
    icon: Heart,
    title: 'Multi-Person Monitoring',
    desc: 'Track vitals for multiple people simultaneously. Our system detects and independently monitors each individual in the camera frame with separate dashboards.',
    image: '/card_multi_person.png',
  },
  {
    num: 5,
    icon: Shield,
    title: 'Health Analytics',
    desc: 'Comprehensive dashboards with historical trends, anomaly detection, and personalized insights. Export reports and share with healthcare professionals.',
    image: '/card_health_analytics.png',
  },
];

export default function HorizontalInfoSection() {
  const isMobile = useIsMobile();
  const containerRef = useRef(null);
  const { scrollYProgress } = useScroll({
    target: containerRef,
    offset: ['start start', 'end end'],
  });

  const progressWidth = useTransform(scrollYProgress, [0, 1], ['0%', '100%']);

  /* ─── MOBILE: one card at a time ─────────────────────────── */
  if (isMobile) {
    return (
      <section
        ref={containerRef}
        style={{ height: `${infoItems.length * 100}vh`, position: 'relative' }}
      >
        <div
          style={{
            position: 'sticky',
            top: 0,
            height: '100vh',
            overflow: 'hidden',
            background: 'var(--bg-primary)',
            display: 'flex',
            flexDirection: 'column',
            paddingTop: '4rem',
          }}
        >
          {/* Timeline dots */}
          <div style={{ padding: '0 6vw', marginBottom: '1.5rem' }}>
            <div style={{ width: '100%', height: '3px', background: 'rgba(0,0,0,0.06)', borderRadius: '2px', position: 'relative' }}>
              <motion.div style={{ width: progressWidth, height: '100%', background: 'linear-gradient(90deg, #22c55e, #16a34a)', borderRadius: '2px', boxShadow: '0 0 12px rgba(34,197,94,0.4)' }} />
              {infoItems.map((item, i) => {
                const dotPos = i / (infoItems.length - 1);
                return (
                  <motion.div
                    key={i}
                    style={{
                      position: 'absolute', left: `${dotPos * 100}%`, top: '50%', transform: 'translate(-50%, -50%)',
                      width: '1.4rem', height: '1.4rem', borderRadius: '50%',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontSize: '0.6rem', fontWeight: 800,
                      color: useTransform(scrollYProgress, [Math.max(0, dotPos - 0.03), dotPos + 0.02], ['rgba(0,0,0,0.25)', '#fff']),
                      background: useTransform(scrollYProgress, [Math.max(0, dotPos - 0.03), dotPos + 0.02], ['#e8e8e8', '#22c55e']),
                      boxShadow: useTransform(scrollYProgress, [Math.max(0, dotPos - 0.03), dotPos + 0.02], ['none', '0 2px 10px rgba(34,197,94,0.4)']),
                    }}
                  >
                    {item.num}
                  </motion.div>
                );
              })}
            </div>
          </div>

          {/* One card at a time — crossfade */}
          <div style={{ flex: 1, position: 'relative', overflow: 'hidden' }}>
            {infoItems.map((item, i) => {
              const segStart = i / infoItems.length;
              const segPeak = (i + 0.3) / infoItems.length;
              const segEnd = (i + 0.85) / infoItems.length;
              const segFadeOut = (i + 1) / infoItems.length;

              const cardOpacity = useTransform(
                scrollYProgress,
                [segStart, segPeak, segEnd, segFadeOut],
                [0, 1, 1, i === infoItems.length - 1 ? 1 : 0]
              );
              const cardY = useTransform(scrollYProgress, [segStart, segPeak], ['30px', '0px']);
              const IconComp = item.icon;

              return (
                <motion.div
                  key={i}
                  style={{
                    opacity: cardOpacity, y: cardY,
                    position: 'absolute', inset: 0,
                    display: 'flex', flexDirection: 'column', alignItems: 'center',
                    padding: '1rem 6vw', gap: '1rem',
                  }}
                >
                  <div
                    style={{
                      width: '55vw', maxWidth: '220px', aspectRatio: '3 / 4',
                      borderRadius: '1rem', overflow: 'hidden', background: '#fff',
                      boxShadow: '0 8px 32px rgba(0,0,0,0.10), 0 2px 8px rgba(34,197,94,0.08)',
                      border: '1px solid rgba(34,197,94,0.12)', flexShrink: 0,
                    }}
                  >
                    <img src={item.image} alt={item.title} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                  </div>
                  <div style={{ textAlign: 'center', maxWidth: '320px' }}>
                    <div style={{
                      width: '2.5rem', height: '2.5rem', borderRadius: '0.75rem',
                      background: 'rgba(34,197,94,0.08)', display: 'flex', alignItems: 'center',
                      justifyContent: 'center', margin: '0 auto 0.75rem',
                    }}>
                      <IconComp size={18} color="#22c55e" />
                    </div>
                    <h3 style={{
                      fontFamily: "'Georgia', 'Times New Roman', serif",
                      fontSize: '1.1rem', fontWeight: 700, fontStyle: 'italic',
                      color: 'var(--text-primary)', marginBottom: '0.5rem', lineHeight: 1.3,
                    }}>
                      {item.title}
                    </h3>
                    <p style={{ fontSize: '0.82rem', lineHeight: 1.55, color: 'var(--text-primary)', margin: 0 }}>
                      {item.desc}
                    </p>
                  </div>
                </motion.div>
              );
            })}
          </div>
        </div>
      </section>
    );
  }

  /* ─── DESKTOP: original side-by-side layout ────────────── */
  return (
    <section
      ref={containerRef}
      style={{ height: `${infoItems.length * 120}vh`, position: 'relative' }}
    >
      <div
        style={{
          position: 'sticky', top: 0, height: '100vh', overflow: 'hidden',
          background: 'var(--bg-primary)', display: 'flex', flexDirection: 'column',
        }}
      >
        {/* Top half: image cards */}
        <div style={{ flex: 1, display: 'flex', alignItems: 'flex-end', position: 'relative', overflow: 'hidden', minHeight: 0, padding: '1rem 6vw 1.5rem' }}>
          <div style={{ display: 'flex', gap: '3vw', width: '100%' }}>
            {infoItems.map((item, i) => {
              const segStart = i / infoItems.length;
              const segPeak = (i + 0.4) / infoItems.length;
              const segEnd = (i + 1) / infoItems.length;
              const y = useTransform(scrollYProgress, [segStart, segPeak, segEnd], ['-120%', '0%', '0%']);
              const opacity = useTransform(scrollYProgress, [segStart, segPeak - 0.02, segPeak], [0, 0.8, 1]);
              const scale = useTransform(scrollYProgress, [segStart, segPeak, segEnd], [0.7, 1, 0.95]);
              return (
                <motion.div key={i} style={{ y, opacity, scale, flex: '0 0 auto', width: `${100 / infoItems.length - 2}%`, display: 'flex', justifyContent: 'center' }}>
                  <div style={{ width: '75%', maxWidth: '180px', aspectRatio: '3 / 4', borderRadius: '1rem', overflow: 'hidden', background: '#fff', boxShadow: '0 8px 32px rgba(0,0,0,0.10), 0 2px 8px rgba(34,197,94,0.08)', border: '1px solid rgba(34,197,94,0.12)', position: 'relative' }}>
                    <img src={item.image} alt={item.title} style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
                    <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: '40%', background: 'linear-gradient(to top, rgba(34,197,94,0.15), transparent)', pointerEvents: 'none' }} />
                  </div>
                </motion.div>
              );
            })}
          </div>
        </div>

        {/* Timeline bar */}
        <div style={{ padding: '0 6vw', position: 'relative', zIndex: 10 }}>
          <div style={{ width: '100%', height: '4px', background: 'rgba(0,0,0,0.06)', borderRadius: '2px', position: 'relative' }}>
            <motion.div style={{ width: progressWidth, height: '100%', background: 'linear-gradient(90deg, #22c55e, #16a34a)', borderRadius: '2px', boxShadow: '0 0 12px rgba(34,197,94,0.4)' }} />
            {infoItems.map((item, i) => {
              const dotPos = i / (infoItems.length - 1);
              return (
                <motion.div
                  key={i}
                  style={{
                    position: 'absolute', left: `${dotPos * 100}%`, top: '50%', transform: 'translate(-50%, -50%)',
                    width: '2rem', height: '2rem', borderRadius: '50%',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: '0.7rem', fontWeight: 800,
                    color: useTransform(scrollYProgress, [Math.max(0, dotPos - 0.03), dotPos + 0.02], ['rgba(0,0,0,0.25)', '#ffffff']),
                    background: useTransform(scrollYProgress, [Math.max(0, dotPos - 0.03), dotPos + 0.02], ['#e8e8e8', '#22c55e']),
                    boxShadow: useTransform(scrollYProgress, [Math.max(0, dotPos - 0.03), dotPos + 0.02], ['none', '0 2px 10px rgba(34,197,94,0.4)']),
                  }}
                >
                  {item.num}
                </motion.div>
              );
            })}
          </div>
        </div>

        {/* Bottom half: text content */}
        <div style={{ flex: 1, display: 'flex', alignItems: 'flex-start', position: 'relative', overflow: 'hidden', padding: '2.5rem 6vw 3rem', minHeight: 0 }}>
          <div style={{ display: 'flex', gap: '3vw', width: '100%' }}>
            {infoItems.map((item, i) => {
              const segStart = i / infoItems.length;
              const segPeak = (i + 0.4) / infoItems.length;
              const segEnd = (i + 1) / infoItems.length;
              const y = useTransform(scrollYProgress, [segStart, segPeak, segEnd], ['80px', '0px', '0px']);
              const opacity = useTransform(scrollYProgress, [segStart, segPeak - 0.02, segPeak, segEnd - 0.05, segEnd], [0, 0.6, 1, 1, 1]);
              const IconComp = item.icon;
              return (
                <motion.div key={i} style={{ y, opacity, flex: '0 0 auto', width: `${100 / infoItems.length - 2}%` }}>
                  <div style={{ width: '2.5rem', height: '2.5rem', borderRadius: '0.75rem', background: 'rgba(34,197,94,0.08)', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: '1rem' }}>
                    <IconComp size={18} color="#22c55e" />
                  </div>
                  <h3 style={{ fontFamily: "'Georgia', 'Times New Roman', serif", fontSize: 'clamp(1rem, 1.5vw, 1.25rem)', fontWeight: 700, fontStyle: 'italic', color: 'var(--text-primary)', marginBottom: '0.6rem', lineHeight: 1.3 }}>
                    {item.title}
                  </h3>
                  <p style={{ fontSize: 'clamp(0.8rem, 1vw, 0.92rem)', lineHeight: 1.65, color: 'var(--text-primary)', margin: 0 }}>
                    {item.desc}
                  </p>
                </motion.div>
              );
            })}
          </div>
        </div>
      </div>
    </section>
  );
}
