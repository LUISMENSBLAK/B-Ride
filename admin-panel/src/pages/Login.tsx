import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import apiClient from '../api/client';
import { useAuthStore } from '../store/authStore';
import styles from './Login.module.css';

export default function LoginPage() {
  const navigate = useNavigate();
  const { login } = useAuthStore();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const res = await apiClient.post('/auth/login', { email, password });
      const { accessToken, ...userData } = res.data.data;

      if (userData.role !== 'ADMIN') {
        setError('Acceso denegado. Se requiere rol ADMIN.');
        setLoading(false);
        return;
      }

      login(accessToken, userData);
      navigate('/dashboard');
    } catch (err: any) {
      setError(err.response?.data?.message ?? 'Error de conexión con el servidor.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className={styles.page}>
      {/* ── Formulario ── */}
      <div className={styles.formSide}>
        <div className={styles.card}>
          <div className={styles.logoWrap}>
            <img src="/icon.png" alt="B-Ride" className={styles.logo} />
          </div>

          <h1 className={styles.title}>B-Ride Admin</h1>
          <p className={styles.subtitle}>Acceso exclusivo para operadores</p>

          <form onSubmit={handleSubmit} className={styles.form} noValidate>
            <div className={styles.field}>
              <label htmlFor="email" className={styles.label}>Correo electrónico</label>
              <input
                id="email"
                type="email"
                className={styles.input}
                placeholder="admin@brideapp.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                autoComplete="email"
                required
              />
            </div>

            <div className={styles.field}>
              <label htmlFor="password" className={styles.label}>Contraseña</label>
              <input
                id="password"
                type="password"
                className={styles.input}
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="current-password"
                required
              />
            </div>

            {error && (
              <div className={styles.errorBox}>
                <span>⚠️</span> {error}
              </div>
            )}

            <button type="submit" className={styles.btn} disabled={loading}>
              {loading ? <span className={styles.spinner} /> : 'Iniciar sesión'}
            </button>
          </form>
        </div>
      </div>

      {/* ── Panel Visual Derecho con SVG Wixárika ── */}
      <div className={styles.visualSide}>
        <svg
          className={styles.wixarikaSvg}
          viewBox="0 0 800 900"
          preserveAspectRatio="xMidYMid slice"
          xmlns="http://www.w3.org/2000/svg"
        >
          {/* Gradient background */}
          <defs>
            <linearGradient id="bgGrad" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#0D0520" />
              <stop offset="50%" stopColor="#1A0A35" />
              <stop offset="100%" stopColor="#0D0520" />
            </linearGradient>
          </defs>
          <rect width="800" height="900" fill="url(#bgGrad)" />

          {/* Rombos grandes — fondo */}
          {[
            [100, 120], [400, 60], [680, 140],
            [200, 320], [550, 280], [760, 380],
            [80, 520],  [350, 480], [640, 540],
            [150, 720], [480, 680], [720, 760],
            [300, 860], [600, 820],
          ].map(([cx, cy], i) => (
            <polygon
              key={`diamond-${i}`}
              points={`${cx},${cy - 36} ${cx + 36},${cy} ${cx},${cy + 36} ${cx - 36},${cy}`}
              fill="none"
              stroke={i % 3 === 0 ? '#F5C518' : i % 3 === 1 ? '#00D4C8' : '#FF5722'}
              strokeWidth="1.2"
              opacity="0.35"
            />
          ))}

          {/* Rombos pequeños — detalle interior */}
          {[
            [100, 120], [400, 60], [680, 140],
            [200, 320], [550, 280], [760, 380],
            [80, 520],  [350, 480], [640, 540],
            [150, 720], [480, 680], [720, 760],
            [300, 860], [600, 820],
          ].map(([cx, cy], i) => (
            <polygon
              key={`inner-${i}`}
              points={`${cx},${cy - 16} ${cx + 16},${cy} ${cx},${cy + 16} ${cx - 16},${cy}`}
              fill={i % 3 === 0 ? 'rgba(245,197,24,0.08)' : i % 3 === 1 ? 'rgba(0,212,200,0.08)' : 'rgba(255,87,34,0.08)'}
              stroke={i % 3 === 0 ? '#F5C518' : i % 3 === 1 ? '#00D4C8' : '#FF5722'}
              strokeWidth="0.8"
              opacity="0.5"
            />
          ))}

          {/* Líneas horizontales decorativas */}
          {[200, 400, 600, 780].map((y, i) => (
            <line key={`hline-${i}`} x1="0" y1={y} x2="800" y2={y}
              stroke="#F5C518" strokeWidth="0.4" opacity="0.12" />
          ))}

          {/* Líneas diagonales — tejido */}
          {[0, 100, 200, 300, 400, 500, 600, 700, 800].map((x, i) => (
            <line key={`dline-${i}`} x1={x} y1="0" x2={x - 200} y2="900"
              stroke="#00D4C8" strokeWidth="0.4" opacity="0.08" />
          ))}

          {/* Puntos en intersecciones */}
          {[
            [100,120],[400,60],[680,140],
            [200,320],[550,280],[760,380],
            [80,520],[350,480],[640,540],
            [150,720],[480,680],[720,760],
          ].map(([cx, cy], i) => (
            <circle key={`dot-${i}`} cx={cx} cy={cy} r="3"
              fill={i % 3 === 0 ? '#F5C518' : i % 3 === 1 ? '#00D4C8' : '#FF5722'}
              opacity="0.5"
            />
          ))}
        </svg>

        <div className={styles.visualContent}>
          <div className={styles.visualDivider} />
          <h2 className={styles.visualText}>
            Bienvenido al panel de operaciones B-Ride
          </h2>
          <div className={styles.visualDivider} />
        </div>
      </div>
    </div>
  );
}
