import { useEffect, useState } from 'react';
import apiClient from '../api/client';
import styles from './Dashboard.module.css';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';

interface Stats {
  totalUsers: number;
  pendingDriversCount: number;
  activeDriversCount: number;
  ridesToday: number;
  estimatedTotalIncome: number;
}

interface DriverLocation {
  _id: string;
  name: string;
  avgRating: number;
  currentLocation: {
    latitude: number;
    longitude: number;
  }
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
  const [activeLocations, setActiveLocations] = useState<DriverLocation[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    const load = async () => {
      try {
        setLoading(true);
        const res = await apiClient.get('/admin/stats');
        setStats(res.data.data);
        const locRes = await apiClient.get('/admin/drivers/active-locations');
        if (locRes.data.success) setActiveLocations(locRes.data.data);
      } catch (e: any) {
        setError(e.response?.data?.message ?? 'Error cargando estadísticas');
      } finally {
        setLoading(false);
      }
    };
    load();
  }, []);

  useEffect(() => {
    if (loading) return;
    
    const loadLeaflet = () => {
      return new Promise<void>((resolve) => {
        if ((window as any).L) { resolve(); return; }
        
        const link = document.createElement('link');
        link.rel = 'stylesheet';
        link.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';
        document.head.appendChild(link);

        const script = document.createElement('script');
        script.src = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js';
        script.onload = () => resolve();
        document.head.appendChild(script);
      });
    };

    loadLeaflet().then(() => {
      const L = (window as any).L;
      const mapElem = document.getElementById('driversMap');
      if (mapElem && L) {
         if ((window as any).leafletMapInstance) {
             (window as any).leafletMapInstance.remove();
         }
         // Start in MX City
         const map = L.map('driversMap').setView([19.4326, -99.1332], 11);
         (window as any).leafletMapInstance = map;

         L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
            attribution: '© OpenStreetMap contributors'
         }).addTo(map);

         activeLocations.forEach(d => {
             if (d.currentLocation?.latitude && d.currentLocation?.longitude) {
                 const marker = L.marker([d.currentLocation.latitude, d.currentLocation.longitude]).addTo(map);
                 marker.bindPopup(`<b>${d.name}</b><br/>Rating: ⭐ ${d.avgRating?.toFixed(1) || 5.0}`);
             }
         });
      }
    });

  }, [loading, activeLocations]);

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

      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr)', gap: 24, marginTop: 24 }}>
        {/* Gráfico Recharts */}
        <div style={{ background: 'var(--surface)', padding: 20, borderRadius: 16, border: '1px solid var(--border)' }}>
          <h2 style={{ margin: '0 0 16px 0', fontSize: 18, color: 'var(--text)' }}>Ingresos Semanales (Estimado)</h2>
          <div style={{ width: '100%', height: 350 }}>
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={[
                { name: 'Lun', obj: 1200 },
                { name: 'Mar', obj: 2100 },
                { name: 'Mie', obj: 1800 },
                { name: 'Jue', obj: 2400 },
                { name: 'Vie', obj: 3500 },
                { name: 'Sab', obj: 4200 },
                { name: 'Dom', obj: 3100 },
              ]}>
                <defs>
                  <linearGradient id="colorObj" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#DFB300" stopOpacity={0.3}/>
                    <stop offset="95%" stopColor="#DFB300" stopOpacity={0}/>
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                <XAxis dataKey="name" stroke="var(--text-muted)" fontSize={12} tickLine={false} axisLine={false} />
                <YAxis stroke="var(--text-muted)" fontSize={12} tickLine={false} axisLine={false} tickFormatter={(v) => `$${v}`} />
                <Tooltip 
                  contentStyle={{ backgroundColor: 'var(--surface-high)', borderColor: 'var(--border)', borderRadius: 8, color: 'var(--text)' }}
                  itemStyle={{ color: '#DFB300' }}
                />
                <Area type="monotone" dataKey="obj" stroke="#DFB300" strokeWidth={3} fillOpacity={1} fill="url(#colorObj)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Mapa Leaflet */}
        <div style={{ background: 'var(--surface)', padding: 20, borderRadius: 16, border: '1px solid var(--border)' }}>
          <h2 style={{ margin: '0 0 16px 0', fontSize: 18, color: 'var(--text)' }}>Conductores activos ahora</h2>
          <div id="driversMap" style={{ height: 350, width: '100%', borderRadius: 12, backgroundColor: '#eee', zIndex: 0 }}></div>
        </div>
      </div>
    </div>
  );
}
