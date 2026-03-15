import { memo } from 'react';
import { motion } from 'framer-motion';

/**
 * FaceBoxes — renders bounding boxes, names, tracking dots for every
 * tracked facial point, and animated overlays on the camera feed.
 *
 * Props:
 *   faces: array of { face_id, bbox, roi_points, tracking_points, name }
 *   containerWidth: number (pixel width of the camera container)
 *   containerHeight: number (pixel height of the camera container)
 *   viewMode: 'normal' | 'signal' | 'heatmap'
 */

// Which tracking points to show per view mode
const TRACKING_GROUPS = {
  // ROI points: skin color extraction regions for rPPG
  roi: {
    points: ['forehead', 'left_cheek', 'right_cheek'],
    color: '#06d6a0',
    label: 'ROI',
    showLabel: true,
    size: 'medium',
  },
  // Eye tracking points
  eyes: {
    points: [
      'left_iris', 'right_iris',
      'left_eye_inner', 'left_eye_outer', 'left_eye_top', 'left_eye_bottom',
      'right_eye_inner', 'right_eye_outer', 'right_eye_top', 'right_eye_bottom',
    ],
    color: '#e879f9',
    irisColor: '#00ffff',
    label: 'Eye',
    showLabel: false,
    size: 'small',
  },
  // Nose & chin — respiration tracking (micro-movements)
  respiration: {
    points: ['nose_tip', 'nose_bridge', 'chin', 'jaw_left', 'jaw_right'],
    color: '#ffd166',
    label: 'Resp',
    showLabel: true,
    size: 'small',
  },
  // Eyebrows — expression tracking
  eyebrows: {
    points: [
      'left_eyebrow_inner', 'left_eyebrow_mid', 'left_eyebrow_outer',
      'right_eyebrow_inner', 'right_eyebrow_mid', 'right_eyebrow_outer',
    ],
    color: '#ff8c42',
    label: 'Brow',
    showLabel: false,
    size: 'tiny',
  },
  // Mouth — expression tracking
  mouth: {
    points: ['mouth_left', 'mouth_right', 'mouth_top', 'mouth_bottom'],
    color: '#ff6b9d',
    label: 'Mouth',
    showLabel: false,
    size: 'tiny',
  },
  // Chest — respiration tracking zone
  chest: {
    points: ['chest_center', 'chest_left', 'chest_right', 'chest_upper', 'chest_lower'],
    color: '#4fd1c5',
    label: 'Resp',
    showLabel: true,
    size: 'medium',
  },
};

// Friendly labels for tracking points
const POINT_LABELS = {
  forehead: 'Forehead',
  left_cheek: 'L.Cheek',
  right_cheek: 'R.Cheek',
  nose_tip: 'Nose',
  chin: 'Chin',
  left_iris: 'L.Iris',
  right_iris: 'R.Iris',
  jaw_left: 'L.Jaw',
  jaw_right: 'R.Jaw',
  chest_center: 'Chest',
  chest_left: 'L.Chest',
  chest_right: 'R.Chest',
  chest_upper: 'Upper',
  chest_lower: 'Lower',
};

const DOT_SIZES = {
  medium: { dot: 8, ring: 20 },
  small: { dot: 5, ring: 14 },
  tiny: { dot: 3, ring: 10 },
};

const FaceBoxes = memo(function FaceBoxes({ faces = [], containerWidth = 640, containerHeight = 480, viewMode = 'normal' }) {
  if (!faces || faces.length === 0) return null;

  return (
    <div className="absolute inset-0 pointer-events-none" style={{ zIndex: 10 }}>
      {faces.map((face) => {
        const bbox = face.bbox || {};
        // Convert normalized coords to pixels (mirrored horizontally since camera is flipped)
        const left = (1 - bbox.x - bbox.width) * containerWidth;
        const top = bbox.y * containerHeight;
        const width = bbox.width * containerWidth;
        const height = bbox.height * containerHeight;

        const isRecognized = face.name && face.name !== 'Unknown' && face.name !== 'Unknown User';
        const accentColor = isRecognized ? '#4f8cff' : '#ff8c42';

        const trackingPts = face.tracking_points || {};

        return (
          <div key={face.face_id ?? face.face_index ?? 0}>
            {/* Bounding Box */}
            <div
              className="absolute"
              style={{
                left: `${left}px`,
                top: `${top}px`,
                width: `${width}px`,
                height: `${height}px`,
                border: '2px solid',
                borderColor: accentColor,
                borderRadius: '12px',
                willChange: 'left, top, width, height',
              }}
            >
              {/* Corner accents */}
              {['top-left', 'top-right', 'bottom-left', 'bottom-right'].map((corner) => {
                const isTop = corner.includes('top');
                const isLeft = corner.includes('left');
                return (
                  <div
                    key={corner}
                    className="absolute"
                    style={{
                      [isTop ? 'top' : 'bottom']: '-2px',
                      [isLeft ? 'left' : 'right']: '-2px',
                      width: '16px',
                      height: '16px',
                      [isTop ? 'borderTop' : 'borderBottom']: '3px solid',
                      [isLeft ? 'borderLeft' : 'borderRight']: '3px solid',
                      borderColor: accentColor,
                      [isTop && isLeft ? 'borderTopLeftRadius' : '']: '8px',
                      [isTop && !isLeft ? 'borderTopRightRadius' : '']: '8px',
                      [!isTop && isLeft ? 'borderBottomLeftRadius' : '']: '8px',
                      [!isTop && !isLeft ? 'borderBottomRightRadius' : '']: '8px',
                    }}
                  />
                );
              })}

              {/* Name label */}
              <div
                className="absolute left-1/2 -translate-x-1/2 px-3 py-1 rounded-lg text-xs font-bold whitespace-nowrap"
                style={{
                  bottom: '-28px',
                  background: isRecognized
                    ? 'rgba(79,140,255,0.9)' : 'rgba(255,140,66,0.9)',
                  color: 'white',
                  backdropFilter: 'blur(8px)',
                  transition: 'background 0.3s ease',
                }}
              >
                {isRecognized ? face.name : 'Unknown'}
              </div>
            </div>

            {/* ========== TRACKING DOTS ========== */}
            {(viewMode === 'signal' || viewMode === 'normal') && Object.entries(TRACKING_GROUPS).map(([groupKey, group]) => {
              return group.points.map((ptName, ptIdx) => {
                const pt = trackingPts[ptName];
                if (!pt) return null;

                const px = (1 - pt.x) * containerWidth;
                const py = pt.y * containerHeight;

                // Use special color for iris points
                const isIris = ptName.includes('iris');
                const dotColor = isIris ? (group.irisColor || group.color) : group.color;
                const sizes = DOT_SIZES[isIris ? 'medium' : group.size] || DOT_SIZES.small;
                const showLabel = group.showLabel && !!POINT_LABELS[ptName];

                return (
                  <TrackingDot
                    key={`${groupKey}-${ptName}`}
                    x={px}
                    y={py}
                    label={showLabel ? POINT_LABELS[ptName] : null}
                    color={dotColor}
                    dotSize={sizes.dot}
                    ringSize={sizes.ring}
                    delay={ptIdx * 0.1}
                    pulse={isIris || groupKey === 'roi'}
                  />
                );
              });
            })}

            {/* ── Connection lines between eye points ── */}
            {(viewMode === 'signal') && trackingPts.left_eye_inner && trackingPts.left_eye_outer && (
              <EyeOutline
                points={[
                  trackingPts.left_eye_outer,
                  trackingPts.left_eye_top,
                  trackingPts.left_eye_inner,
                  trackingPts.left_eye_bottom,
                ]}
                containerWidth={containerWidth}
                containerHeight={containerHeight}
                color="#e879f980"
              />
            )}
            {(viewMode === 'signal') && trackingPts.right_eye_inner && trackingPts.right_eye_outer && (
              <EyeOutline
                points={[
                  trackingPts.right_eye_outer,
                  trackingPts.right_eye_top,
                  trackingPts.right_eye_inner,
                  trackingPts.right_eye_bottom,
                ]}
                containerWidth={containerWidth}
                containerHeight={containerHeight}
                color="#e879f980"
              />
            )}
          </div>
        );
      })}
    </div>
  );
});

/**
 * Animated tracking dot representing a tracked facial point
 */
function TrackingDot({ x, y, label, color, dotSize = 6, ringSize = 16, delay = 0, pulse = true }) {
  return (
    <div
      className="absolute flex flex-col items-center"
      style={{
        left: `${x}px`,
        top: `${y}px`,
        transform: 'translate(-50%, -50%)',
        willChange: 'left, top',
      }}
    >
      {/* Outer pulse ring (only for key points) */}
      {pulse && (
        <motion.div
          animate={{
            scale: [1, 1.8, 1],
            opacity: [0.5, 0, 0.5],
          }}
          transition={{
            duration: 1.8,
            repeat: Infinity,
            delay,
            ease: 'easeInOut',
          }}
          className="absolute rounded-full"
          style={{
            width: `${ringSize}px`,
            height: `${ringSize}px`,
            background: color,
            opacity: 0.25,
          }}
        />
      )}
      {/* Inner solid dot */}
      <motion.div
        animate={pulse ? {
          scale: [0.85, 1.15, 0.85],
          boxShadow: [
            `0 0 3px ${color}`,
            `0 0 10px ${color}`,
            `0 0 3px ${color}`,
          ],
        } : {}}
        transition={pulse ? {
          duration: 1.8,
          repeat: Infinity,
          delay,
          ease: 'easeInOut',
        } : {}}
        className="rounded-full"
        style={{
          width: `${dotSize}px`,
          height: `${dotSize}px`,
          background: color,
          zIndex: 2,
          boxShadow: `0 0 4px ${color}`,
        }}
      />
      {/* Label */}
      {label && (
        <span
          className="absolute text-center whitespace-nowrap"
          style={{
            top: `${dotSize + 6}px`,
            fontSize: '8px',
            fontWeight: 700,
            color,
            textShadow: '0 1px 4px rgba(0,0,0,0.9)',
            letterSpacing: '0.3px',
          }}
        >
          {label}
        </span>
      )}
    </div>
  );
}

/**
 * SVG outline connecting eye points (for signal tracking view)
 */
function EyeOutline({ points, containerWidth, containerHeight, color }) {
  if (!points || points.length < 4) return null;

  const coords = points
    .filter(p => p)
    .map(p => ({
      x: (1 - p.x) * containerWidth,
      y: p.y * containerHeight,
    }));

  if (coords.length < 3) return null;

  const pathData = coords.map((c, i) => `${i === 0 ? 'M' : 'L'} ${c.x} ${c.y}`).join(' ') + ' Z';

  return (
    <svg
      className="absolute inset-0 pointer-events-none"
      width={containerWidth}
      height={containerHeight}
      style={{ zIndex: 11 }}
    >
      <path
        d={pathData}
        fill="none"
        stroke={color}
        strokeWidth="1.5"
        strokeLinejoin="round"
        style={{}}
      />
    </svg>
  );
}

export default FaceBoxes;
