import { useRef, useEffect, useCallback } from 'react';
import { useScroll, useTransform, motion } from 'framer-motion';
import useIsMobile from '../hooks/useIsMobile';

const FRAME_COUNT = 240;

function getFrameSrc(index) {
  const num = Math.min(Math.max(Math.round(index), 1), FRAME_COUNT);
  return `/frames/frame_${String(num).padStart(4, '0')}.jpg`;
}

export default function ScrollVideo() {
  const isMobile = useIsMobile();
  const containerRef = useRef(null);
  const canvasRef = useRef(null);
  const imagesRef = useRef([]);
  const currentFrameRef = useRef(0);

  const { scrollYProgress } = useScroll({
    target: containerRef,
    offset: ['start start', 'end end'],
  });

  const frameIndex = useTransform(scrollYProgress, [0, 1], [1, FRAME_COUNT]);

  // Preload images
  useEffect(() => {
    const imgs = [];
    let loadedCount = 0;
    for (let i = 1; i <= FRAME_COUNT; i++) {
      const img = new Image();
      img.src = getFrameSrc(i);
      img.onload = () => {
        loadedCount++;
        if (loadedCount === 1) {
          // Draw the first frame immediately
          const canvas = canvasRef.current;
          if (canvas) {
            canvas.width = img.naturalWidth;
            canvas.height = img.naturalHeight;
            const ctx = canvas.getContext('2d');
            ctx.drawImage(img, 0, 0);
          }
        }
      };
      imgs[i] = img;
    }
    imagesRef.current = imgs;
  }, []);

  // Render frame on scroll
  const renderFrame = useCallback((index) => {
    const roundedIndex = Math.min(Math.max(Math.round(index), 1), FRAME_COUNT);
    if (roundedIndex === currentFrameRef.current) return;
    currentFrameRef.current = roundedIndex;

    const canvas = canvasRef.current;
    const img = imagesRef.current[roundedIndex];
    if (!canvas || !img || !img.complete) return;

    const ctx = canvas.getContext('2d');
    canvas.width = img.naturalWidth;
    canvas.height = img.naturalHeight;
    ctx.drawImage(img, 0, 0);
  }, []);

  useEffect(() => {
    const unsubscribe = frameIndex.on('change', renderFrame);
    return () => unsubscribe();
  }, [frameIndex, renderFrame]);

  return (
    <div ref={containerRef} style={{ height: isMobile ? '300vh' : '500vh', position: 'relative' }}>
      <div
        style={{
          position: 'sticky',
          top: 0,
          width: '100vw',
          height: '100vh',
          overflow: 'hidden',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: '#000',
        }}
      >
        <canvas
          ref={canvasRef}
          style={{
            width: '100%',
            height: '100%',
            objectFit: 'cover',
            display: 'block',
          }}
        />
        {/* Overlay gradient for transition */}
        <motion.div
          style={{
            position: 'absolute',
            bottom: 0,
            left: 0,
            right: 0,
            height: '30%',
            background: 'linear-gradient(to top, var(--bg-primary), transparent)',
            opacity: useTransform(scrollYProgress, [0.7, 1], [0, 1]),
          }}
        />
        {/* Title overlay */}
        <motion.div
          style={{
            position: 'absolute',
            bottom: '15%',
            left: '50%',
            x: '-50%',
            textAlign: 'center',
            opacity: useTransform(scrollYProgress, [0, 0.15, 0.5, 0.7], [1, 1, 0.8, 0]),
          }}
        >
          <h1
            className="font-display"
            style={{
              fontSize: 'clamp(2.5rem, 6vw, 5rem)',
              fontWeight: 900,
              color: 'white',
              textShadow: '0 4px 30px rgba(0,0,0,0.5)',
              lineHeight: 1.1,
            }}
          >
            VitalSense
          </h1>
          <p
            style={{
              fontSize: 'clamp(1rem, 2vw, 1.3rem)',
              color: 'rgba(255,255,255,0.8)',
              marginTop: '1rem',
              fontWeight: 300,
            }}
          >
            Contactless Physiological Monitoring
          </p>
        </motion.div>
      </div>
    </div>
  );
}
