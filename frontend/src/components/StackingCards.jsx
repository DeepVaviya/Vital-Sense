import { useRef, useEffect, useState } from 'react';
import { motion, useScroll, useMotionValue, useInView } from 'framer-motion';

const cards = [
  {
    title: 'Heart Rate Monitoring',
    desc: 'Real-time BPM calculated from facial blood flow using imaging photoplethysmography (rPPG). No wearable sensors required — just your webcam.',
    stat: '72 BPM',
    accent: '#22c55e',
    image: '/images/cards/heartrate.png',
  },
  {
    title: 'Respiration Tracking',
    desc: 'Breath rate detected via micro-motion analysis of facial landmarks with optical flow algorithms in real-time.',
    stat: '16 RPM',
    accent: '#059669',
    image: '/images/cards/respiration.png',
  },
  {
    title: 'HRV Analysis',
    desc: 'RMSSD and SDNN metrics computed from inter-beat intervals for deep autonomic nervous system health insights.',
    stat: '42 ms',
    accent: '#10b981',
    image: '/images/cards/hrv.png',
  },
  {
    title: 'Cognitive Load Detection',
    desc: 'Estimates mental workload from HRV patterns, heart rate slopes, and breathing irregularity signals in real-time.',
    stat: 'Medium',
    accent: '#34d399',
    image: '/images/cards/cognitive.png',
  },
  {
    title: 'Stress Assessment',
    desc: 'Composite stress score derived from low HRV, elevated heart rate, and rapid breathing patterns for wellness insights.',
    stat: 'Low',
    accent: '#16a34a',
    image: '/images/cards/stress.png',
  },
];

/* 
 * Follows the Skiper UI StickyCard_003 pattern exactly:
 * - useScroll({ target }) for viewport scroll position
 * - useInView to capture scroll position when card reaches its sticky point
 * - animate scale (1→0) and rotation (0→80°) based on scroll distance past capture point
 * - ALL cards animate, no exceptions
 */
function StickyCard({ card, index }) {
  const vertMargin = 10;
  const container = useRef(null);
  const [maxScrollY, setMaxScrollY] = useState(Infinity);

  const scaleVal = useMotionValue(1);
  const rotateVal = useMotionValue(0);

  // Get viewport scroll position (scrollY is absolute px, not 0-1 progress)
  const { scrollY } = useScroll({ target: container });

  // Only fires when card enters the top 10% of viewport (= at its sticky position)
  const isInView = useInView(container, {
    margin: `0px 0px -${100 - vertMargin}% 0px`,
    once: true,
  });

  // Capture scroll position when card first becomes sticky
  useEffect(() => {
    if (isInView && maxScrollY === Infinity) {
      setMaxScrollY(scrollY.get());
    }
  }, [isInView]);

  // Animate based on how far past the capture point we've scrolled
  useEffect(() => {
    const unsubscribe = scrollY.on('change', (currentY) => {
      let animVal = 1;
      if (currentY > maxScrollY) {
        animVal = Math.max(0, 1 - (currentY - maxScrollY) / 8000);
      }
      scaleVal.set(animVal);
      rotateVal.set((1 - animVal) * 80);
    });
    return unsubscribe;
  }, [maxScrollY, scrollY, scaleVal, rotateVal]);

  return (
    <motion.div
      ref={container}
      style={{
        scale: scaleVal,
        rotate: rotateVal,
        position: 'sticky',
        top: `${vertMargin}vh`,
        height: `${100 - 2 * vertMargin}vh`,
        width: '100%',
        maxWidth: '1000px',
        borderRadius: '2rem',
        overflow: 'hidden',
        background: 'var(--card-bg)',
        border: '1px solid rgba(0,0,0,0.08)',
        boxShadow: '0 20px 60px rgba(0,0,0,0.1), 0 4px 16px rgba(0,0,0,0.05)',
        willChange: 'transform',
        transformOrigin: 'center center',
      }}
    >
      {/* Full card image — rotates WITH the card */}
      <img
        src={card.image}
        alt={card.title}
        style={{
          position: 'absolute',
          inset: 0,
          width: '100%',
          height: '100%',
          objectFit: 'cover',
        }}
      />

      {/* Content overlay at bottom */}
      <div
        style={{
          position: 'absolute',
          bottom: 0,
          left: 0,
          right: 0,
          padding: '3rem 3.5rem',
          background:
            'linear-gradient(to top, rgba(255,255,255,0.98) 0%, rgba(255,255,255,0.92) 45%, rgba(255,255,255,0) 100%)',
        }}
      >
        {/* Stat badge */}
        <div
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '0.5rem',
            padding: '0.4rem 1.1rem',
            borderRadius: '999px',
            background: 'rgba(255,255,255,0.9)',
            border: `1.5px solid ${card.accent}40`,
            marginBottom: '1rem',
          }}
        >
          <span
            style={{
              width: '7px',
              height: '7px',
              borderRadius: '50%',
              background: card.accent,
            }}
          />
          <span
            style={{
              fontSize: '0.9rem',
              fontWeight: 700,
              color: card.accent,
              letterSpacing: '0.02em',
            }}
          >
            {card.stat}
          </span>
        </div>

        {/* Title */}
        <h3
          className="font-display"
          style={{
            fontSize: 'clamp(1.5rem, 2.5vw, 2.2rem)',
            fontWeight: 800,
            color: 'var(--text-primary)',
            marginBottom: '0.75rem',
            lineHeight: 1.2,
          }}
        >
          {card.title}
        </h3>

        {/* Description */}
        <p
          style={{
            fontSize: '1rem',
            lineHeight: 1.7,
            color: 'rgba(0,0,0,0.55)',
            margin: 0,
            maxWidth: '550px',
          }}
        >
          {card.desc}
        </p>
      </div>
    </motion.div>
  );
}

export default function StackingCards() {
  // Lenis smooth scroll
  useEffect(() => {
    let lenis;
    const initLenis = async () => {
      const Lenis = (await import('lenis')).default;
      lenis = new Lenis({
        duration: 1.2,
        easing: (t) => Math.min(1, 1.001 - Math.pow(2, -10 * t)),
        touchMultiplier: 2,
        smoothWheel: true,
      });
      function raf(time) {
        lenis.raf(time);
        requestAnimationFrame(raf);
      }
      requestAnimationFrame(raf);
    };
    initLenis();
    return () => {
      if (lenis) lenis.destroy();
    };
  }, []);

  return (
    <section
      style={{
        background: 'var(--bg-primary)',
        position: 'relative',
        /* overflow must NOT be hidden — rotated cards must be visible */
        overflow: 'visible',
      }}
    >
      {/* Section title */}
      <div
        style={{
          textAlign: 'center',
          padding: '6rem 4vw 3rem',
        }}
      >
        <span
          style={{
            display: 'inline-block',
            padding: '0.4rem 1.2rem',
            borderRadius: '999px',
            fontSize: '0.85rem',
            fontWeight: 600,
            color: '#22c55e',
            background: 'rgba(34,197,94,0.08)',
            border: '1px solid rgba(34,197,94,0.12)',
            letterSpacing: '0.05em',
            textTransform: 'uppercase',
            marginBottom: '1.5rem',
          }}
        >
          Capabilities
        </span>
        <h2
          className="font-display"
          style={{
            fontSize: 'clamp(2rem, 4vw, 3.5rem)',
            fontWeight: 800,
            color: 'var(--text-primary)',
          }}
        >
          Real-Time{' '}
          <span
            style={{
              background: 'linear-gradient(135deg, #22c55e, #059669, #34d399)',
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
              backgroundClip: 'text',
            }}
          >
            Vital Signs
          </span>
        </h2>
      </div>

      {/*
        Cards as direct flex children — same sticky top, gap provides scroll room.
        Cards naturally stack because later cards have higher DOM order (painted later).
        Rotated/scaled cards are visible behind because overflow is visible.
      */}
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: '10vh',
          padding: '0 4vw',
          paddingTop: '30vh',
          paddingBottom: '50vh',
          overflow: 'visible',
        }}
      >
        {cards.map((card, i) => (
          <StickyCard key={i} card={card} index={i} />
        ))}
      </div>
    </section>
  );
}