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
      {/* Lado del Formulario */}
      <div className={styles.formSide}>
        <div className={styles.card}>
          <div className={styles.logoWrap}>
            <img src="/icon.png" alt="B-Ride Admin" className={styles.logo} />
          </div>

          <h1 className={styles.title}>B-Ride Admin</h1>
          <p className={styles.subtitle}>Inicia sesión con tu cuenta ADMIN</p>

          <form onSubmit={handleSubmit} className={styles.form} noValidate>
            <div className={styles.field}>
              <label htmlFor="email" className={styles.label}>Email</label>
              <input
                id="email"
                type="email"
                className={styles.input}
                placeholder="admin@bride.com"
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
              {loading ? (
                <span className={styles.spinner} />
              ) : (
                'Iniciar sesión'
              )}
            </button>
          </form>
        </div>
      </div>

      {/* Lado Visual Creativo */}
      <div className={styles.visualSide}>
        <div className={styles.patternOverlay} />
        <h2 className={styles.visualText}>Bienvenido al panel de operaciones B-Ride</h2>
      </div>
    </div>
  );
}
