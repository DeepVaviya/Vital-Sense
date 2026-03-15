import { useState, useEffect } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Activity, Menu, X, UserPlus, MonitorSmartphone, BarChart3, Moon, Sun } from 'lucide-react';
import { useTheme } from '../ThemeContext';
import useIsMobile from '../hooks/useIsMobile';

const navLinks = [
  { to: '/', label: 'Home', icon: null },
  { to: '/register', label: 'Register', icon: UserPlus },
  { to: '/monitor', label: 'Monitor', icon: MonitorSmartphone },
  { to: '/analytics', label: 'Analytics', icon: BarChart3 },
];

export default function Navbar() {
  const [menuOpen, setMenuOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const { isDark, toggleTheme } = useTheme();
  const isMobile = useIsMobile();
  const location = useLocation();
  const isLanding = location.pathname === '/';
  const isDashboard = location.pathname === '/monitor' || location.pathname === '/analytics';

  useEffect(() => {
    if (isDashboard) {
      setScrolled(true);
      return;
    }
    if (!isLanding) {
      setScrolled(true);
      return;
    }
    const onScroll = () => {
      setScrolled(window.scrollY > window.innerHeight * (isMobile ? 2.5 : 4.8));
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    onScroll();
    return () => window.removeEventListener('scroll', onScroll);
  }, [isLanding, isDashboard]);

  // Colors adapt based on scroll state and theme
  const textColor = scrolled ? 'var(--text-primary)' : 'rgba(255,255,255,0.85)';
  const activeTextColor = scrolled ? '#22c55e' : '#ffffff';
  const activeBg = scrolled ? 'rgba(34,197,94,0.1)' : 'rgba(34,197,94,0.4)';
  const pillBg = scrolled ? 'var(--nav-bg)' : 'rgba(255,255,255,0.1)';
  const pillBorder = scrolled ? 'var(--glass-border)' : 'rgba(255,255,255,0.15)';
  const pillShadow = scrolled ? 'var(--nav-shadow)' : 'none';
  const logoColor = scrolled ? 'var(--text-primary)' : 'white';
  const logoShadow = scrolled ? 'none' : '0 1px 8px rgba(0,0,0,0.3)';

  return (
    <nav
      className="fixed top-0 left-0 right-0 z-50"
      style={{
        background: isDashboard ? 'var(--nav-bg)' : 'transparent',
        backdropFilter: isDashboard ? 'blur(12px)' : 'none',
        borderBottom: isDashboard ? '1px solid var(--nav-border)' : '1px solid transparent',
        boxShadow: isDashboard ? 'var(--nav-shadow)' : 'none',
        transition: 'all 0.4s ease',
      }}
    >
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          {/* Logo */}
          <Link to="/" className="flex items-center gap-2 no-underline">
            <div className="w-9 h-9 rounded-xl flex items-center justify-center"
                 style={{ background: 'linear-gradient(135deg, #22c55e, #059669)' }}>
              <Activity size={20} color="white" />
            </div>
            <span
              className="text-lg font-bold"
              style={{
                color: logoColor,
                textShadow: logoShadow,
                transition: 'color 0.4s, text-shadow 0.4s',
              }}
            >
              VitalSense
            </span>
          </Link>

          {/* Desktop Nav */}
          <div className="hidden md:flex items-center gap-2">
            <div className="flex items-center gap-1"
                 style={{
                   background: pillBg,
                   backdropFilter: 'blur(16px)',
                   borderRadius: '999px',
                   padding: '0.25rem',
                   border: `1px solid ${pillBorder}`,
                   boxShadow: pillShadow,
                   transition: 'all 0.4s ease',
                 }}>
              {navLinks.map((link) => {
                const isActive = location.pathname === link.to;
                return (
                  <Link
                    key={link.to}
                    to={link.to}
                    className="flex items-center gap-1.5 px-4 py-2 rounded-full text-sm font-medium no-underline"
                    style={{
                      color: isActive ? activeTextColor : textColor,
                      background: isActive ? activeBg : 'transparent',
                      transition: 'color 0.4s, background 0.4s',
                    }}
                  >
                    {link.icon && <link.icon size={15} />}
                    {link.label}
                  </Link>
                );
              })}
            </div>

            {/* Dark mode toggle */}
            <motion.button
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              onClick={toggleTheme}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                width: '36px',
                height: '36px',
                borderRadius: '50%',
                border: 'none',
                cursor: 'pointer',
                background: scrolled ? 'var(--pill-bg)' : 'rgba(255,255,255,0.1)',
                color: scrolled ? 'var(--text-primary)' : 'rgba(255,255,255,0.85)',
                transition: 'all 0.3s ease',
              }}
              title={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
            >
              {isDark ? <Sun size={16} /> : <Moon size={16} />}
            </motion.button>
          </div>

          {/* Mobile: toggle + menu button */}
          <div className="flex items-center gap-2 md:hidden">
            <button
              onClick={toggleTheme}
              className="p-2 border-0 bg-transparent cursor-pointer"
              style={{ color: logoColor, transition: 'color 0.4s' }}
            >
              {isDark ? <Sun size={20} /> : <Moon size={20} />}
            </button>
            <button className="p-2 border-0 bg-transparent cursor-pointer"
                    style={{ color: logoColor, transition: 'color 0.4s' }}
                    onClick={() => setMenuOpen(!menuOpen)}>
              {menuOpen ? <X size={24} /> : <Menu size={24} />}
            </button>
          </div>
        </div>
      </div>

      {/* Mobile menu */}
      {menuOpen && (
        <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }}
                    className="md:hidden px-4 py-4"
                    style={{ background: 'var(--nav-bg)', backdropFilter: 'blur(20px)' }}>
          <div className="flex flex-col gap-1">
            {navLinks.map((link) => {
              const isActive = location.pathname === link.to;
              return (
                <Link
                  key={link.to}
                  to={link.to}
                  className="flex items-center gap-2 text-sm font-medium no-underline py-3 px-3 rounded-xl"
                  style={{
                    color: isActive ? '#22c55e' : 'var(--text-primary)',
                    background: isActive ? 'rgba(34,197,94,0.08)' : 'transparent',
                  }}
                  onClick={() => setMenuOpen(false)}
                >
                  {link.icon && <link.icon size={16} />}
                  {link.label}
                </Link>
              );
            })}
          </div>
        </motion.div>
      )}
    </nav>
  );
}
