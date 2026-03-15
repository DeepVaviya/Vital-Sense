import { useRef, useState } from 'react';
import { motion, useScroll, useTransform } from 'framer-motion';
import useIsMobile from '../hooks/useIsMobile';

/* ─── Data ────────────────────────────────────────────────── */
const heroLine1 = 'Your Health,';
const heroLine2 = 'Reimagined.';
const tagline = 'No wearables. No sensors. Just your webcam.';

const paragraphs = [
  {
    label: '01 — WHAT',
    words: 'VitalSense is a revolutionary contactless health monitoring platform that measures your vital signs through your webcam using advanced computer vision and signal processing'.split(' '),
  },
  {
    label: '02 — HOW',
    words: 'Our platform leverages imaging photoplethysmography to detect subtle color changes in your skin caused by blood flow combined with MediaPipe Face Mesh for 468-point facial landmark tracking'.split(' '),
  },
  {
    label: '03 — WHO',
    words: 'Whether you are a healthcare professional monitoring patients or an individual tracking your daily wellness VitalSense provides real-time insights with multi-person support and comprehensive analytics'.split(' '),
  },
];

/* ─── Hoverable Word ──────────────────────────────────────── */
function HoverWord({ children, style }) {
  const [hovered, setHovered] = useState(false);

  return (
    <motion.span
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      animate={
        hovered
          ? {
              color: '#22c55e',
              scale: 1.08,
              textShadow: '0 0 20px rgba(34,197,94,0.3)',
            }
          : {
              color: style?.color || 'var(--text-secondary)',
              scale: 1,
              textShadow: '0 0 0px transparent',
            }
      }
      transition={{ duration: 0.2, ease: 'easeOut' }}
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

/* ─── Scroll-reveal word ──────────────────────────────────── */
function RevealWord({ word, scrollYProgress, start, end }) {
  const opacity = useTransform(scrollYProgress, [start, end], [0.1, 1]);
  const y = useTransform(scrollYProgress, [start, end], [12, 0]);
  const blur = useTransform(scrollYProgress, [start, end], [4, 0]);
  const filterVal = useTransform(blur, (v) => `blur(${v}px)`);

  return (
    <motion.span
      style={{
        opacity,
        y,
        filter: filterVal,
        display: 'inline-block',
        marginRight: '0.35em',
      }}
    >
      <HoverWord>{word}</HoverWord>
    </motion.span>
  );
}

/* ─── Hero title character animation ─────────────────────── */
function AnimatedChar({ char, scrollYProgress, start, end, index }) {
  const opacity = useTransform(scrollYProgress, [start, end], [0, 1]);
  const y = useTransform(scrollYProgress, [start, end], [60, 0]);
  const rotateX = useTransform(scrollYProgress, [start, end], [45, 0]);

  return (
    <motion.span
      style={{
        opacity,
        y,
        rotateX,
        display: 'inline-block',
        transformPerspective: 600,
        transformOrigin: 'center bottom',
      }}
    >
      <HoverWord
        style={{
          color: 'var(--text-primary)',
          fontWeight: 900,
        }}
      >
        {char === ' ' ? '\u00A0' : char}
      </HoverWord>
    </motion.span>
  );
}

/* ─── Main Component ──────────────────────────────────────── */
export default function ScrollTextSection() {
  const isMobile = useIsMobile();
  const containerRef = useRef(null);
  const { scrollYProgress } = useScroll({
    target: containerRef,
    offset: ['start start', 'end end'],
  });

  // Ranges for different animation phases
  const titleOpacity = useTransform(scrollYProgress, [0, 0.05], [0, 1]);
  const labelOpacity = useTransform(scrollYProgress, [0, 0.03], [0, 1]);
  const taglineOpacity = useTransform(scrollYProgress, [0.08, 0.14], [0, 1]);
  const taglineY = useTransform(scrollYProgress, [0.08, 0.14], [30, 0]);

  // Divider line animation
  const dividerWidth = useTransform(scrollYProgress, [0.14, 0.2], ['0%', '100%']);

  return (
    <section ref={containerRef} style={{ height: isMobile ? '300vh' : '400vh', position: 'relative' }}>
      <div
        style={{
          position: 'sticky',
          top: 0,
          height: '100vh',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: isMobile ? 'flex-start' : 'center',
          padding: isMobile ? '5rem 5vw 2rem' : '0 8vw',
          background: 'var(--bg-primary)',
          overflow: 'hidden',
        }}
      >
        {/* Label */}
        <motion.div style={{ opacity: labelOpacity, marginBottom: isMobile ? '1rem' : '2rem' }}>
          <span
            style={{
              display: 'inline-block',
              padding: '0.4rem 1.2rem',
              borderRadius: '999px',
              fontSize: isMobile ? '0.7rem' : '0.8rem',
              fontWeight: 700,
              color: 'var(--accent-green)',
              background: 'rgba(34,197,94,0.08)',
              border: '1px solid rgba(34,197,94,0.15)',
              letterSpacing: '0.15em',
              textTransform: 'uppercase',
            }}
          >
            About the Project
          </span>
        </motion.div>

        {/* Big title — character-by-character reveal */}
        <motion.div style={{ opacity: titleOpacity, marginBottom: isMobile ? '0.25rem' : '0.5rem' }}>
          <h2
            className="font-display"
            style={{
              fontSize: isMobile ? 'clamp(1.8rem, 6vw, 3rem)' : 'clamp(3rem, 7vw, 6rem)',
              fontWeight: 900,
              lineHeight: 1.05,
              letterSpacing: '-0.03em',
              color: 'var(--text-primary)',
            }}
          >
            {heroLine1.split('').map((char, i) => {
              const total = heroLine1.length;
              const start = i / total * 0.06;
              const end = start + 0.03;
              return (
                <AnimatedChar
                  key={`l1-${i}`}
                  char={char}
                  scrollYProgress={scrollYProgress}
                  start={start}
                  end={end}
                  index={i}
                />
              );
            })}
            <br />
            {heroLine2.split('').map((char, i) => {
              const total = heroLine2.length;
              const start = 0.03 + i / total * 0.06;
              const end = start + 0.03;
              return (
                <AnimatedChar
                  key={`l2-${i}`}
                  char={char}
                  scrollYProgress={scrollYProgress}
                  start={start}
                  end={end}
                  index={i}
                />
              );
            })}
          </h2>
        </motion.div>

        {/* Tagline */}
        <motion.p
          className="font-display"
          style={{
            opacity: taglineOpacity,
            y: taglineY,
            fontSize: 'clamp(1.1rem, 2vw, 1.5rem)',
            fontWeight: 400,
            color: 'var(--text-muted)',
            marginBottom: isMobile ? '1.5rem' : '3rem',
            letterSpacing: '-0.01em',
          }}
        >
          {tagline}
        </motion.p>

        {/* Animated divider */}
        <motion.div
          style={{
            width: dividerWidth,
            height: '2px',
            background: 'linear-gradient(90deg, var(--accent-green), transparent)',
            marginBottom: isMobile ? '1.5rem' : '3rem',
          }}
        />

        {/* Paragraphs — word-by-word reveal with blur + hover */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: isMobile ? '1fr' : 'repeat(auto-fit, minmax(280px, 1fr))',
            gap: isMobile ? '2rem' : '3rem',
            maxWidth: '1100px',
          }}
        >
          {paragraphs.map((para, pi) => {
            const sectionStart = 0.2 + pi * 0.25;

            return (
              <div key={pi}>
                {/* Section label */}
                <motion.span
                  style={{
                    display: 'block',
                    fontSize: '0.7rem',
                    fontWeight: 700,
                    letterSpacing: '0.2em',
                    textTransform: 'uppercase',
                    color: 'var(--accent-green)',
                    marginBottom: '1rem',
                    opacity: useTransform(
                      scrollYProgress,
                      [sectionStart, sectionStart + 0.05],
                      [0, 1]
                    ),
                  }}
                >
                  {para.label}
                </motion.span>

                {/* Words */}
                <div style={{ lineHeight: 1.8, fontSize: '1rem' }}>
                  {para.words.map((word, wi) => {
                    const wordStart =
                      sectionStart + 0.03 + (wi / para.words.length) * 0.18;
                    const wordEnd = wordStart + 0.04;
                    return (
                      <RevealWord
                        key={wi}
                        word={word}
                        scrollYProgress={scrollYProgress}
                        start={wordStart}
                        end={wordEnd}
                      />
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
