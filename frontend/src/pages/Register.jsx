import { useState, useRef, useCallback, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import {
  Camera, User, CheckCircle, Upload, Loader2, ArrowRight, Sparkles
} from 'lucide-react';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000';

export default function Register() {
  const navigate = useNavigate();
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const streamRef = useRef(null);

  const [name, setName] = useState('');
  const [age, setAge] = useState('');
  const [step, setStep] = useState('form'); // form, camera, captured, submitting, success
  const [capturedImage, setCapturedImage] = useState(null);
  const [error, setError] = useState('');
  const [cameraActive, setCameraActive] = useState(false);

  // Start camera
  const startCamera = useCallback(async () => {
    try {
      setError('');
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { width: { ideal: 640 }, height: { ideal: 480 }, facingMode: 'user' },
        audio: false,
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.onloadedmetadata = () => {
          videoRef.current.play();
          setCameraActive(true);
        };
      }
    } catch (err) {
      setError('Camera access is required for face registration.');
    }
  }, []);

  // Stop camera
  const stopCamera = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(t => t.stop());
      streamRef.current = null;
    }
    setCameraActive(false);
  }, []);

  // Capture photo
  const capturePhoto = useCallback(() => {
    if (!videoRef.current || !canvasRef.current) return;
    const video = videoRef.current;
    const canvas = canvasRef.current;
    canvas.width = video.videoWidth || 640;
    canvas.height = video.videoHeight || 480;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    const dataUrl = canvas.toDataURL('image/jpeg', 0.9);
    setCapturedImage(dataUrl);
    stopCamera();
    setStep('captured');
  }, [stopCamera]);

  // Generate a simple embedding from the image (using canvas pixel analysis)
  // This creates a 128-dim feature vector from color/spatial statistics
  const extractSimpleEmbedding = useCallback((imageDataUrl) => {
    return new Promise((resolve) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        canvas.width = 128;
        canvas.height = 128;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, 128, 128);
        const imageData = ctx.getImageData(0, 0, 128, 128);
        const data = imageData.data;

        // Extract 128-dim embedding from spatial color blocks
        const embedding = [];
        const blockSize = 16; // 8x8 grid of 16x16 blocks = 64 blocks
        for (let by = 0; by < 128; by += blockSize) {
          for (let bx = 0; bx < 128; bx += blockSize) {
            let rSum = 0, gSum = 0, count = 0;
            for (let y = by; y < by + blockSize; y++) {
              for (let x = bx; x < bx + blockSize; x++) {
                const idx = (y * 128 + x) * 4;
                rSum += data[idx];
                gSum += data[idx + 1];
                count++;
              }
            }
            embedding.push(rSum / count / 255.0);
            embedding.push(gSum / count / 255.0);
          }
        }

        // Normalize to unit vector
        const norm = Math.sqrt(embedding.reduce((sum, v) => sum + v * v, 0)) || 1;
        const normalized = embedding.map(v => v / norm);
        resolve(normalized);
      };
      img.src = imageDataUrl;
    });
  }, []);

  // Submit registration
  const handleSubmit = useCallback(async () => {
    if (!name.trim() || !age || !capturedImage) return;
    setStep('submitting');
    setError('');

    try {
      // Extract embedding from captured face
      const embedding = await extractSimpleEmbedding(capturedImage);

      const response = await fetch(`${API_URL}/api/register-face`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: name.trim(),
          age: parseInt(age),
          face_embedding: embedding,
          photo_base64: capturedImage,
        }),
      });

      if (!response.ok) {
        const errData = await response.json().catch(() => ({}));
        throw new Error(errData.detail || 'Registration failed');
      }

      const userData = await response.json();
      // Store registration info locally
      localStorage.setItem('registered_user', JSON.stringify(userData));
      setStep('success');

      // Navigate to monitor after brief delay
      setTimeout(() => navigate('/monitor'), 2000);
    } catch (err) {
      setError(err.message || 'Registration failed. Please try again.');
      setStep('captured');
    }
  }, [name, age, capturedImage, navigate, extractSimpleEmbedding]);

  // Open camera when moving to camera step
  useEffect(() => {
    if (step === 'camera') {
      startCamera();
    }
    return () => stopCamera();
  }, [step, startCamera, stopCamera]);

  // Cleanup on unmount
  useEffect(() => {
    return () => stopCamera();
  }, [stopCamera]);

  return (
    <div className="min-h-screen pt-20 pb-10 px-4" style={{ background: 'var(--bg-primary)' }}>
      <div className="max-w-xl mx-auto">
        {/* Header */}
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}
                    className="text-center mb-8">
          <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full mb-6 text-sm font-medium"
               style={{ background: 'rgba(79,140,255,0.1)', border: '1px solid rgba(79,140,255,0.2)', color: '#4f8cff' }}>
            <User size={16} /> User Registration
          </div>
          <h1 className="text-3xl sm:text-4xl font-bold mb-3">
            Register Your <span className="gradient-text">Identity</span>
          </h1>
          <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
            Register with your face to enable personalized health monitoring and analytics
          </p>
        </motion.div>

        {/* Progress Steps */}
        <div className="flex items-center justify-center gap-2 mb-8">
          {['Details', 'Face Photo', 'Complete'].map((label, i) => {
            const stepMap = { 0: ['form'], 1: ['camera', 'captured', 'submitting'], 2: ['success'] };
            const isActive = stepMap[i]?.includes(step);
            const isDone = i === 0 ? step !== 'form' : i === 1 ? step === 'success' : false;
            return (
              <div key={i} className="flex items-center gap-2">
                {i > 0 && <div className="w-8 h-px" style={{ background: isDone || isActive ? '#4f8cff' : 'var(--glass-border)' }} />}
                <div className="flex items-center gap-1.5">
                  <div className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold"
                       style={{
                         background: isDone ? '#4f8cff' : isActive ? 'rgba(79,140,255,0.2)' : 'var(--pill-bg)',
                         color: isDone ? 'white' : isActive ? '#4f8cff' : 'var(--text-muted)',
                         border: `1px solid ${isDone || isActive ? '#4f8cff' : 'var(--glass-border)'}`,
                       }}>
                    {isDone ? '✓' : i + 1}
                  </div>
                  <span className="text-xs font-medium hidden sm:inline"
                        style={{ color: isDone || isActive ? '#4f8cff' : 'var(--text-muted)' }}>
                    {label}
                  </span>
                </div>
              </div>
            );
          })}
        </div>

        {/* Step: Form */}
        <AnimatePresence mode="wait">
          {step === 'form' && (
            <motion.div key="form" initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }}
                        exit={{ opacity: 0, x: 20 }} className="glass-card p-8">
              <h2 className="text-lg font-bold mb-6">Personal Details</h2>

              <div className="space-y-5">
                <div>
                  <label className="block text-sm font-medium mb-2" style={{ color: 'var(--text-secondary)' }}>
                    Full Name
                  </label>
                  <input
                    id="register-name"
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="Enter your full name"
                    className="w-full px-4 py-3 rounded-xl text-sm border-0 outline-none"
                    style={{
                      background: 'var(--bg-secondary)',
                      color: 'var(--text-primary)',
                      border: '1px solid var(--glass-border)',
                    }}
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium mb-2" style={{ color: 'var(--text-secondary)' }}>
                    Age
                  </label>
                  <input
                    id="register-age"
                    type="number"
                    value={age}
                    onChange={(e) => setAge(e.target.value)}
                    placeholder="Enter your age"
                    min="1"
                    max="150"
                    className="w-full px-4 py-3 rounded-xl text-sm border-0 outline-none"
                    style={{
                      background: 'var(--bg-secondary)',
                      color: 'var(--text-primary)',
                      border: '1px solid var(--glass-border)',
                    }}
                  />
                </div>
              </div>

              <motion.button
                id="next-to-camera"
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                onClick={() => {
                  if (!name.trim()) { setError('Please enter your name'); return; }
                  if (!age || age < 1) { setError('Please enter a valid age'); return; }
                  setError('');
                  setStep('camera');
                }}
                disabled={!name.trim() || !age}
                className="w-full mt-6 px-6 py-3.5 rounded-xl text-sm font-bold text-white border-0 cursor-pointer flex items-center justify-center gap-2"
                style={{
                  background: name.trim() && age
                    ? 'linear-gradient(135deg, #4f8cff, #8b5cf6)'
                    : 'rgba(255,255,255,0.1)',
                  opacity: name.trim() && age ? 1 : 0.5,
                }}>
                <Camera size={18} /> Capture Face Photo <ArrowRight size={16} />
              </motion.button>

              {error && (
                <p className="text-sm mt-3 text-center" style={{ color: '#ff6b9d' }}>{error}</p>
              )}
            </motion.div>
          )}

          {/* Step: Camera */}
          {step === 'camera' && (
            <motion.div key="camera" initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }}
                        exit={{ opacity: 0, x: 20 }} className="glass-card p-6">
              <h2 className="text-lg font-bold mb-4">Capture Your Face</h2>
              <p className="text-xs mb-4" style={{ color: 'var(--text-secondary)' }}>
                Position your face in the center of the frame and click Capture
              </p>

              <div className="relative rounded-2xl overflow-hidden mb-4"
                   style={{ background: '#0d0d14', aspectRatio: '4/3' }}>
                <video ref={videoRef} autoPlay playsInline muted
                       className="w-full h-full object-cover"
                       style={{ transform: 'scaleX(-1)' }} />

                {/* Face guide overlay */}
                {cameraActive && (
                  <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                    <div className="w-48 h-60 rounded-[50%] border-2 border-dashed"
                         style={{ borderColor: 'rgba(79,140,255,0.5)' }} />
                  </div>
                )}

                {cameraActive && (
                  <div className="absolute top-3 left-3 flex items-center gap-2 px-3 py-1.5 rounded-full"
                       style={{ background: 'rgba(0,0,0,0.6)' }}>
                    <div className="w-2 h-2 rounded-full animate-pulse" style={{ background: '#06d6a0' }} />
                    <span className="text-xs font-medium" style={{ color: '#06d6a0' }}>LIVE</span>
                  </div>
                )}

                {error && (
                  <div className="absolute inset-0 flex items-center justify-center"
                       style={{ background: 'rgba(10,10,15,0.9)' }}>
                    <p className="text-sm font-medium text-center px-6" style={{ color: '#ff6b9d' }}>{error}</p>
                  </div>
                )}
              </div>

              <div className="flex gap-3">
                <button onClick={() => { stopCamera(); setStep('form'); }}
                        className="flex-1 px-4 py-3 rounded-xl text-sm font-medium cursor-pointer border-0"
                        style={{ background: 'var(--bg-secondary)', color: 'var(--text-secondary)',
                                 border: '1px solid var(--glass-border)' }}>
                  Back
                </button>
                <motion.button
                  id="capture-face"
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                  onClick={capturePhoto}
                  disabled={!cameraActive}
                  className="flex-1 px-4 py-3 rounded-xl text-sm font-bold text-white border-0 cursor-pointer flex items-center justify-center gap-2"
                  style={{ background: cameraActive ? 'linear-gradient(135deg, #4f8cff, #8b5cf6)' : 'rgba(255,255,255,0.1)' }}>
                  <Camera size={16} /> Capture
                </motion.button>
              </div>

              <canvas ref={canvasRef} className="hidden" />
            </motion.div>
          )}

          {/* Step: Captured / Submitting */}
          {(step === 'captured' || step === 'submitting') && (
            <motion.div key="captured" initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }}
                        exit={{ opacity: 0, x: 20 }} className="glass-card p-6">
              <h2 className="text-lg font-bold mb-4">Confirm Your Photo</h2>

              <div className="relative rounded-2xl overflow-hidden mb-4"
                   style={{ aspectRatio: '4/3' }}>
                {capturedImage && (
                  <img src={capturedImage} alt="Captured face"
                       className="w-full h-full object-cover"
                       style={{ transform: 'scaleX(-1)' }} />
                )}
                <div className="absolute top-3 right-3 flex items-center gap-2 px-3 py-1.5 rounded-full"
                     style={{ background: 'rgba(0,0,0,0.6)' }}>
                  <CheckCircle size={14} style={{ color: '#06d6a0' }} />
                  <span className="text-xs font-medium" style={{ color: '#06d6a0' }}>Captured</span>
                </div>
              </div>

              <div className="glass-card p-4 mb-4" style={{ background: 'var(--bg-secondary)' }}>
                <div className="flex justify-between text-sm mb-2">
                  <span style={{ color: 'var(--text-muted)' }}>Name</span>
                  <span className="font-medium">{name}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span style={{ color: 'var(--text-muted)' }}>Age</span>
                  <span className="font-medium">{age}</span>
                </div>
              </div>

              {error && (
                <p className="text-sm mb-3 text-center" style={{ color: '#ff6b9d' }}>{error}</p>
              )}

              <div className="flex gap-3">
                <button onClick={() => { setCapturedImage(null); setStep('camera'); }}
                        disabled={step === 'submitting'}
                        className="flex-1 px-4 py-3 rounded-xl text-sm font-medium cursor-pointer border-0"
                        style={{ background: 'var(--bg-secondary)', color: 'var(--text-secondary)',
                                 border: '1px solid var(--glass-border)' }}>
                  Retake
                </button>
                <motion.button
                  id="submit-registration"
                  whileHover={{ scale: step !== 'submitting' ? 1.02 : 1 }}
                  whileTap={{ scale: step !== 'submitting' ? 0.98 : 1 }}
                  onClick={handleSubmit}
                  disabled={step === 'submitting'}
                  className="flex-1 px-4 py-3 rounded-xl text-sm font-bold text-white border-0 cursor-pointer flex items-center justify-center gap-2"
                  style={{ background: 'linear-gradient(135deg, #06d6a0, #4f8cff)' }}>
                  {step === 'submitting' ? (
                    <><Loader2 size={16} className="animate-spin" /> Registering...</>
                  ) : (
                    <><Upload size={16} /> Register</>
                  )}
                </motion.button>
              </div>
            </motion.div>
          )}

          {/* Step: Success */}
          {step === 'success' && (
            <motion.div key="success" initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }}
                        className="glass-card p-10 text-center">
              <motion.div
                initial={{ scale: 0 }} animate={{ scale: 1 }}
                transition={{ type: 'spring', delay: 0.2 }}
                className="w-20 h-20 rounded-3xl flex items-center justify-center mx-auto mb-6"
                style={{ background: 'linear-gradient(135deg, rgba(6,214,160,0.2), rgba(79,140,255,0.2))' }}>
                <Sparkles size={36} style={{ color: '#06d6a0' }} />
              </motion.div>
              <h2 className="text-2xl font-bold mb-3">Registration Complete!</h2>
              <p className="text-sm mb-6" style={{ color: 'var(--text-secondary)' }}>
                Your face has been registered successfully. Redirecting to monitoring...
              </p>
              <div className="flex items-center justify-center gap-2 text-sm" style={{ color: '#4f8cff' }}>
                <Loader2 size={14} className="animate-spin" /> Redirecting...
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
