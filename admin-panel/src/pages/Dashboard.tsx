import { useEffect, useState } from 'react';
import apiClient from '../api/client';
import styles from './Dashboard.module.css';

interface Stats {
  totalUsers: number;
  pendingDriversCount: number;
  activeDriversCount: number;
  ridesToday: number;
  estimatedTotalIncome: number;
}

interface StatCardProps {
  label: string;
  value: string | number;
  icon: string;
  accent?: 'gold' | 'success' | 'warning' | 'info';
  delay?: number;
}

function StatCard({ label, value, icon, accent = 'gold', delay = 0 }: StatCardProps) {
  return (
    <div className={`${styles.card} ${styles[`accent_${accent}`]} animate-fade-in`}
      style={{ animationDelay: `${delay}ms` }}>
      <div className={styles.cardIcon}>{icon}</div>
      <div className={styles.cardBody}>
        <p className={styles.cardLabel}>{label}</p>
        <p className={styles.cardValue}>{value}</p>
      </div>
    </div>
  );
}

function SkeletonCard() {
  return (
    <div className={styles.card}>
      <div className={`skeleton ${styles.skeletonIcon}`} />
      <div className={styles.cardBody}>
        <div className={`skeleton ${styles.skeletonLabel}`} />
        <div className={`skeleton ${styles.skeletonValue}`} />
      </div>
    </div>
  );
}

export default function DashboardPage() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    const load = async () => {
      try {
        setLoading(true);
        const res = await apiClient.get('/admin/stats');
        setStats(res.data.data);
      } catch (e: any) {
        setError(e.response?.data?.message ?? 'Error cargando estadísticas');
      } finally {
        setLoading(false);
      }
    };
    load();
  }, []);

  const formatCurrency = (n: number) =>
    new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR' }).format(n);

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <div>
          <h1 className={styles.title}>Dashboard</h1>
          <p className={styles.subtitle}>Resumen general de la plataforma</p>
        </div>
        <div className={styles.badge}>
          <span className={styles.dot} />
          En tiempo real
        </div>
      </div>

      {error && (
        <div className={styles.errorBox}>⚠️ {error}</div>
      )}

      <div className={styles.grid}>
        {loading ? (
          Array.from({ length: 5 }).map((_, i) => <SkeletonCard key={i} />)
        ) : stats ? (
          <>
            <StatCard label="Usuarios Totales" value={stats.totalUsers} icon="👥" accent="info" delay={0} />
            <StatCard label="Conductores Activos" value={stats.activeDriversCount} icon="🟢" accent="success" delay={80} />
            <StatCard label="Conductores Pendientes" value={stats.pendingDriversCount} icon="⏳" accent="warning" delay={160} />
            <StatCard label="Viajes Hoy" value={stats.ridesToday} icon="🚗" accent="gold" delay={240} />
            <StatCard label="Ingresos Totales" value={formatCurrency(stats.estimatedTotalIncome)} icon="💰" accent="gold" delay={320} />
          </>
        ) : null}
      </div>

      <div className={styles.infoPanel}>
        <h2 className={styles.infoPanelTitle}>🚀 Panel de Control B-Ride</h2>
        <p className={styles.infoPanelText}>
          Usa el menú lateral para navegar entre las secciones. En <strong>Drivers Pending</strong> puedes aprobar o rechazar conductores. En <strong>Users</strong> puedes gestionar y bloquear cuentas.
        </p>
      </div>
    </div>
  );
}
