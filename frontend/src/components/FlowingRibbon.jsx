import { useRef } from 'react';
import { motion, useScroll, useTransform } from 'framer-motion';
import useIsMobile from '../hooks/useIsMobile';

/*
  A thick black ribbon/strip that flows through the page with wide sweeping curves.
  Uses a tall SVG with a filled path (not just a stroke) to create a real, thick ribbon.
  Starts after the scroll video section and flows through the content areas.
  The ribbon is drawn progressively as the user scrolls.
*/

export default function FlowingRibbon() {
  const isMobile = useIsMobile();
  const containerRef = useRef(null);
  const { scrollYProgress } = useScroll({
    target: containerRef,
    offset: ['start start', 'end end'],
  });

  // Draw the ribbon path progressively
  const pathLength = useTransform(scrollYProgress, [0, 1], [0, 1]);

  // Hide on mobile — the absolute positioning breaks with different scroll heights
  if (isMobile) return null;

  // The ribbon path with wide sweeping curves
  // This creates a thick band by using stroke-width on a single path
  const ribbonD = `
    M -200,0
    C 200,0 600,100 800,300
    S 1400,500 1600,700
    S 800,1100 400,1300
    S -200,1500 0,1800
    S 800,2000 1200,2200
    S 1800,2400 1600,2700
    S 800,3000 400,3100
    S -200,3300 100,3600
    S 800,3800 1200,3900
    S 1700,4100 1600,4400
    S 800,4700 300,4800
  `;

  return (
    <div
      ref={containerRef}
      style={{
        position: 'absolute',
        top: '500vh', /* Start after the scroll video (which is 500vh tall) */
        left: 0,
        width: '100%',
        height: 'calc(100% - 500vh - 200vh)', /* Stop before reveal footer */
        pointerEvents: 'none',
        zIndex: 5,
        overflow: 'visible',
      }}
    >
      <svg
        viewBox="0 0 1500 5000"
        preserveAspectRatio="xMidYMid slice"
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          width: '100%',
          height: '100%',
        }}
      >
        {/* Shadow layer for depth */}
        <motion.path
          d={ribbonD}
          fill="none"
          stroke="rgba(0,0,0,0.06)"
          strokeWidth="110"
          strokeLinecap="round"
          strokeLinejoin="round"
          style={{
            pathLength,
            filter: 'blur(20px)',
          }}
        />
        {/* Main thick ribbon */}
        <motion.path
          d={ribbonD}
          fill="none"
          stroke="#1a1a1a"
          strokeWidth="80"
          strokeLinecap="round"
          strokeLinejoin="round"
          style={{
            pathLength,
          }}
        />
        {/* Inner subtle highlight for 3D effect */}
        <motion.path
          d={ribbonD}
          fill="none"
          stroke="rgba(60,60,60,0.4)"
          strokeWidth="30"
          strokeLinecap="round"
          strokeLinejoin="round"
          style={{
            pathLength,
          }}
        />
      </svg>
    </div>
  );
}
