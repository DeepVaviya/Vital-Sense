import { useRef, useEffect, memo } from 'react';

/**
 * HeatmapView — renders a smooth, thermal-camera-style perfusion heatmap
 * overlay on detected face ROIs (Forehead, Left Cheek, Right Cheek, Chin).
 *
 * Uses:
 *  - <canvas> with requestAnimationFrame for 60 FPS drawing (no React re-renders)
 *  - Radial gradients per ROI for glowing blob effect
 *  - ctx.filter = 'blur(...)' for seamless blending
 *  - globalCompositeOperation = 'lighter' for natural color overlap
 *  - Sine-wave simulated pulsing intensity per region
 *
 * Props:
 *   faces: array of { bbox: {x,y,width,height}, tracking_points: {} }
 *   stressScore: number 0-100  (influences base intensity)
 *   containerWidth: number
 *   containerHeight: number
 *   visible: boolean
 */

// ── Color mapping: intensity (0–1) → RGB ──
// Blue (cool/low) → Cyan → Green → Yellow → Red (hot/high)
function intensityToRGB(t) {
  // t is clamped to [0, 1]
  t = Math.max(0, Math.min(1, t));

  let r, g, b;
  if (t < 0.25) {
    // Blue → Cyan
    const s = t / 0.25;
    r = 0;
    g = Math.round(s * 180);
    b = Math.round(180 + s * 75); // 180→255
  } else if (t < 0.5) {
    // Cyan → Green
    const s = (t - 0.25) / 0.25;
    r = 0;
    g = Math.round(180 + s * 75); // 180→255
    b = Math.round(255 - s * 200); // 255→55
  } else if (t < 0.75) {
    // Green → Yellow
    const s = (t - 0.5) / 0.25;
    r = Math.round(s * 255);
    g = 255;
    b = Math.round(55 - s * 55); // 55→0
  } else {
    // Yellow → Red
    const s = (t - 0.75) / 0.25;
    r = 255;
    g = Math.round(255 - s * 210); // 255→45
    b = 0;
  }
  return { r, g, b };
}

// ── Draw a single heat blob with radial gradient ──
function drawHeatBlob(ctx, x, y, radius, intensity) {
  const { r, g, b } = intensityToRGB(intensity);

  const grad = ctx.createRadialGradient(x, y, 0, x, y, radius);
  grad.addColorStop(0, `rgba(${r}, ${g}, ${b}, 0.85)`);
  grad.addColorStop(0.3, `rgba(${r}, ${g}, ${b}, 0.55)`);
  grad.addColorStop(0.6, `rgba(${r}, ${g}, ${b}, 0.25)`);
  grad.addColorStop(1, `rgba(${r}, ${g}, ${b}, 0)`);

  ctx.fillStyle = grad;
  ctx.beginPath();
  ctx.arc(x, y, radius, 0, Math.PI * 2);
  ctx.fill();
}

// ── ROI definitions relative to face bbox ──
// Each ROI: offset from bbox top-left as fraction of bbox width/height,
// radius as fraction of bbox width, and a phase offset for pulsing uniqueness
const ROI_DEFS = [
  {
    name: 'forehead',
    offsetX: 0.50, offsetY: 0.18,
    radiusFactor: 0.38,
    phaseOffset: 0,
  },
  {
    name: 'leftCheek',
    offsetX: 0.28, offsetY: 0.60,
    radiusFactor: 0.28,
    phaseOffset: 1.2,
  },
  {
    name: 'rightCheek',
    offsetX: 0.72, offsetY: 0.60,
    radiusFactor: 0.28,
    phaseOffset: 2.4,
  },
  {
    name: 'chin',
    offsetX: 0.50, offsetY: 0.85,
    radiusFactor: 0.30,
    phaseOffset: 3.6,
  },
  {
    name: 'noseBridge',
    offsetX: 0.50, offsetY: 0.45,
    radiusFactor: 0.22,
    phaseOffset: 4.8,
  },
];

// ── Simulate pulsing intensity per ROI ──
// Uses sine wave with different frequencies + phases for organic feel
function getSimulatedIntensity(baseIntensity, phaseOffset, now) {
  // Primary slow oscillation (simulates blood flow)
  const pulse1 = Math.sin(now * 0.0015 + phaseOffset) * 0.15;
  // Secondary faster oscillation (heartbeat-like)
  const pulse2 = Math.sin(now * 0.004 + phaseOffset * 2.5) * 0.08;
  // Tertiary micro-variation
  const pulse3 = Math.sin(now * 0.009 + phaseOffset * 0.7) * 0.04;

  return Math.max(0.15, Math.min(0.95, baseIntensity + pulse1 + pulse2 + pulse3));
}

// ── Draw color scale legend ──
function drawLegend(ctx, cw, ch) {
  const legendW = 140;
  const legendH = 10;
  const x = cw - legendW - 14;
  const y = ch - legendH - 28;

  // Background pill
  ctx.save();
  ctx.filter = 'none';
  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = 'source-over';

  ctx.fillStyle = 'rgba(0, 0, 0, 0.65)';
  ctx.beginPath();
  ctx.roundRect(x - 10, y - 18, legendW + 20, legendH + 34, 8);
  ctx.fill();

  // Title
  ctx.fillStyle = 'rgba(255,255,255,0.85)';
  ctx.font = 'bold 9px Inter, system-ui, sans-serif';
  ctx.fillText('PERFUSION INTENSITY', x, y - 5);

  // Gradient bar
  const barGrad = ctx.createLinearGradient(x, y, x + legendW, y);
  barGrad.addColorStop(0, 'rgb(0, 130, 255)');
  barGrad.addColorStop(0.25, 'rgb(0, 220, 200)');
  barGrad.addColorStop(0.5, 'rgb(0, 255, 55)');
  barGrad.addColorStop(0.75, 'rgb(255, 255, 0)');
  barGrad.addColorStop(1, 'rgb(255, 45, 0)');

  ctx.fillStyle = barGrad;
  ctx.beginPath();
  ctx.roundRect(x, y, legendW, legendH, 5);
  ctx.fill();

  // Labels
  ctx.fillStyle = 'rgba(255,255,255,0.55)';
  ctx.font = '8px Inter, system-ui, sans-serif';
  ctx.fillText('Low', x, y + legendH + 11);
  ctx.textAlign = 'right';
  ctx.fillText('High', x + legendW, y + legendH + 11);
  ctx.textAlign = 'left';

  ctx.restore();
}


const HeatmapView = memo(function HeatmapView({
  faces = [],
  stressScore = 0,
  containerWidth = 640,
  containerHeight = 480,
  visible = false,
}) {
  const canvasRef = useRef(null);
  const rafRef = useRef(null);
  const facesRef = useRef(faces);
  const stressRef = useRef(stressScore);

  // Keep refs in sync without re-renders
  facesRef.current = faces;
  stressRef.current = stressScore;

  useEffect(() => {
    if (!visible) {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      // Clear the canvas when hidden
      const canvas = canvasRef.current;
      if (canvas) {
        const ctx = canvas.getContext('2d');
        ctx.clearRect(0, 0, canvas.width, canvas.height);
      }
      return;
    }

    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');

    const draw = () => {
      const cw = containerWidth;
      const ch = containerHeight;

      // Match canvas resolution to container
      if (canvas.width !== cw || canvas.height !== ch) {
        canvas.width = cw;
        canvas.height = ch;
      }

      // ── Clear ──
      ctx.clearRect(0, 0, cw, ch);

      const currentFaces = facesRef.current;
      if (!currentFaces || currentFaces.length === 0) {
        rafRef.current = requestAnimationFrame(draw);
        return;
      }

      const now = Date.now();
      const baseIntensity = 0.35 + (stressRef.current / 100) * 0.45;

      // ── Configure blending ──
      ctx.save();
      ctx.filter = 'blur(22px)';
      ctx.globalAlpha = 0.55;
      ctx.globalCompositeOperation = 'lighter';

      currentFaces.forEach((face) => {
        const bbox = face.bbox || {};
        if (!bbox.width || !bbox.height) return;

        // Mirror x for selfie camera (video has scaleX(-1))
        const faceLeft = (1 - bbox.x - bbox.width) * cw;
        const faceTop = bbox.y * ch;
        const faceW = bbox.width * cw;
        const faceH = bbox.height * ch;

        // Draw each ROI blob
        ROI_DEFS.forEach((roi) => {
          const blobX = faceLeft + roi.offsetX * faceW;
          const blobY = faceTop + roi.offsetY * faceH;
          const blobRadius = roi.radiusFactor * faceW;

          const intensity = getSimulatedIntensity(
            baseIntensity,
            roi.phaseOffset,
            now
          );

          drawHeatBlob(ctx, blobX, blobY, blobRadius, intensity);
        });
      });

      ctx.restore();

      // ── Legend (drawn without blur/blending) ──
      drawLegend(ctx, cw, ch);

      rafRef.current = requestAnimationFrame(draw);
    };

    rafRef.current = requestAnimationFrame(draw);

    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [visible, containerWidth, containerHeight]);

  if (!visible) return null;

  return (
    <canvas
      ref={canvasRef}
      className="absolute top-0 left-0 w-full h-full pointer-events-none"
      style={{ zIndex: 15, borderRadius: 'inherit' }}
    />
  );
});

export default HeatmapView;
