import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Activity, Mail, Lock, User, ArrowRight, AlertCircle } from 'lucide-react';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000';

export default function Login() {
  const [isRegister, setIsRegister] = useState(false);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    const endpoint = isRegister ? '/api/register' : '/api/login';
    const body = isRegister
      ? { name, email, password }
      : { email, password };

    try {
      const res = await fetch(`${API_URL}${endpoint}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.detail || 'Something went wrong');
        setLoading(false);
        return;
      }

      localStorage.setItem('token', data.access_token);
      localStorage.setItem('user', JSON.stringify(data.user));
      navigate('/monitor');
    } catch (err) {
      setError('Cannot connect to server. Make sure the backend is running.');
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center px-4 pt-16"
         style={{ background: 'var(--bg-primary)' }}>
      {/* Background effects */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-1/3 left-1/3 w-80 h-80 rounded-full opacity-10 blur-3xl"
             style={{ background: 'radial-gradient(circle, #4f8cff, transparent)' }} />
        <div className="absolute bottom-1/3 right-1/3 w-80 h-80 rounded-full opacity-10 blur-3xl"
             style={{ background: 'radial-gradient(circle, #8b5cf6, transparent)' }} />
      </div>

      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}
                  className="w-full max-w-md relative">
        {/* Header */}
        <div className="text-center mb-8">
          <div className="w-14 h-14 rounded-2xl flex items-center justify-center mx-auto mb-4"
               style={{ background: 'linear-gradient(135deg, #4f8cff, #8b5cf6)' }}>
            <Activity size={28} color="white" />
          </div>
          <h1 className="text-2xl font-bold mb-2">
            {isRegister ? 'Create Account' : 'Welcome Back'}
          </h1>
          <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
            {isRegister
              ? 'Sign up to start monitoring your vitals'
              : 'Login to access your monitoring dashboard'}
          </p>
        </div>

        {/* Form */}
        <div className="glass-card p-8">
          {error && (
            <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }}
                        className="flex items-center gap-2 p-3 rounded-xl mb-6 text-sm"
                        style={{ background: 'rgba(255,107,157,0.1)', color: '#ff6b9d',
                                 border: '1px solid rgba(255,107,157,0.2)' }}>
              <AlertCircle size={16} /> {error}
            </motion.div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            {isRegister && (
              <div>
                <label className="block text-sm font-medium mb-2" style={{ color: 'var(--text-secondary)' }}>
                  Name
                </label>
                <div className="relative">
                  <User size={18} className="absolute left-3 top-1/2 -translate-y-1/2"
                        style={{ color: 'var(--text-muted)' }} />
                  <input
                    type="text" value={name} onChange={(e) => setName(e.target.value)}
                    placeholder="Your name" required
                    className="w-full pl-10 pr-4 py-3 rounded-xl text-sm border-0 outline-none"
                    style={{ background: 'rgba(255,255,255,0.05)', color: 'var(--text-primary)',
                             border: '1px solid var(--glass-border)' }}
                  />
                </div>
              </div>
            )}

            <div>
              <label className="block text-sm font-medium mb-2" style={{ color: 'var(--text-secondary)' }}>
                Email
              </label>
              <div className="relative">
                <Mail size={18} className="absolute left-3 top-1/2 -translate-y-1/2"
                      style={{ color: 'var(--text-muted)' }} />
                <input
                  type="email" value={email} onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@example.com" required
                  className="w-full pl-10 pr-4 py-3 rounded-xl text-sm border-0 outline-none"
                  style={{ background: 'rgba(255,255,255,0.05)', color: 'var(--text-primary)',
                           border: '1px solid var(--glass-border)' }}
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium mb-2" style={{ color: 'var(--text-secondary)' }}>
                Password
              </label>
              <div className="relative">
                <Lock size={18} className="absolute left-3 top-1/2 -translate-y-1/2"
                      style={{ color: 'var(--text-muted)' }} />
                <input
                  type="password" value={password} onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••" required minLength={6}
                  className="w-full pl-10 pr-4 py-3 rounded-xl text-sm border-0 outline-none"
                  style={{ background: 'rgba(255,255,255,0.05)', color: 'var(--text-primary)',
                           border: '1px solid var(--glass-border)' }}
                />
              </div>
            </div>

            <motion.button
              whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}
              type="submit" disabled={loading}
              className="w-full py-3.5 rounded-xl text-sm font-bold text-white border-0 cursor-pointer flex items-center justify-center gap-2 mt-6"
              style={{ background: 'linear-gradient(135deg, #4f8cff, #8b5cf6)',
                       opacity: loading ? 0.7 : 1 }}>
              {loading ? 'Please wait...' : (isRegister ? 'Create Account' : 'Sign In')}
              {!loading && <ArrowRight size={16} />}
            </motion.button>
          </form>

          <div className="text-center mt-6">
            <button onClick={() => { setIsRegister(!isRegister); setError(''); }}
                    className="text-sm border-0 bg-transparent cursor-pointer"
                    style={{ color: '#4f8cff' }}>
              {isRegister ? 'Already have an account? Sign In' : "Don't have an account? Register"}
            </button>
          </div>
        </div>
      </motion.div>
    </div>
  );
}
