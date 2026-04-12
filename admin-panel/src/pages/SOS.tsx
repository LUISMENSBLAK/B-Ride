import { useEffect, useState } from 'react';
import apiClient from '../api/client';
import styles from './Users.module.css';

interface SOSAlert {
  _id: string;
  user: { _id: string; name: string; email: string; phoneNumber?: string };
  ride: string;
  location: { latitude: number; longitude: number };
  status: 'ACTIVE' | 'RESOLVED';
  createdAt: string;
  resolvedAt?: string;
  resolutionNote?: string;
}

export default function SOS() {
  const [alerts, setAlerts] = useState<SOSAlert[]>([]);
  const [loading, setLoading] = useState(true);
  const [resolvingId, setResolvingId] = useState<string | null>(null);
  const [resolveNote, setResolveNote] = useState('');
  const [toast, setToast] = useState<{msg: string, type: 'success'|'error'} | null>(null);

  const fetchAlerts = async () => {
    try {
      const res = await apiClient.get('/sos');
      if (res.data.success) {
        setAlerts(res.data.data);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAlerts();
    const interval = setInterval(fetchAlerts, 30000); // Polling every 30s
    return () => clearInterval(interval);
  }, []);

  const handleResolve = async (id: string) => {
    if (!resolveNote) {
      showToast('Ingresa una nota de resolución', 'error');
      return;
    }
    try {
      const res = await apiClient.put(`/sos/${id}/resolve`, { resolutionNote: resolveNote });
      if (res.data.success) {
        showToast('Incidente resuelto', 'success');
        setResolvingId(null);
        setResolveNote('');
        fetchAlerts();
      }
    } catch (e: any) {
      showToast(e.response?.data?.message || 'Error al resolver', 'error');
    }
  };

  const showToast = (msg: string, type: 'success'|'error') => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3000);
  };

  const activeCount = alerts.filter(a => a.status === 'ACTIVE').length;

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <div>
          <h1 className={styles.title}>
            Emergencias (SOS)
            {activeCount > 0 && <span style={{marginLeft: 10, display: 'inline-block', width: 12, height: 12, borderRadius: '50%', backgroundColor: 'red', animation: 'pulsate 1.5s infinite'}}></span>}
          </h1>
          <p className={styles.subtitle}>Centro de respuesta a emergencias de la plataforma.</p>
        </div>
        <button className={styles.refreshBtn} onClick={fetchAlerts} disabled={loading}>
          {loading ? 'Cargando...' : 'Actualizar'}
        </button>
      </header>

      <div className={styles.tableWrap}>
        <table className={styles.table}>
          <thead>
            <tr>
              <th>Usuario / Ride</th>
              <th>Teléfono</th>
              <th>Ubicación</th>
              <th>Fecha y Hora</th>
              <th>Estado</th>
              <th>Acciones</th>
            </tr>
          </thead>
          <tbody>
            {alerts.length === 0 && !loading && (
              <tr>
                <td colSpan={6}>
                  <div className={styles.empty}>
                    <div className={styles.emptyIcon}>🛡️</div>
                    <p>Zero incidents. Todo está tranquilo.</p>
                  </div>
                </td>
              </tr>
            )}
            {alerts.map((alert) => (
              <tr key={alert._id} className={alert.status === 'RESOLVED' ? styles.rowBlocked : ''}>
                <td>
                  <div style={{fontWeight: 'bold', color: 'var(--text)'}}>{alert.user?.name || 'Usuario B-Ride'}</div>
                  <div style={{fontSize: 12, color: 'var(--text-muted)'}}>Ride: {alert.ride || 'N/A'}</div>
                </td>
                <td><div className={styles.userPhone}>{alert.user?.phoneNumber || 'No disponible'}</div></td>
                <td>
                  <a 
                    href={`https://maps.google.com/?q=${alert.location.latitude},${alert.location.longitude}`} 
                    target="_blank" rel="noopener noreferrer"
                    style={{color: 'var(--gold)', textDecoration: 'none'}}
                  >
                    Ver en Mapa
                  </a>
                </td>
                <td>
                  <div className={styles.date}>{new Date(alert.createdAt).toLocaleString()}</div>
                </td>
                <td>
                  {alert.status === 'ACTIVE' 
                    ? <span className={styles.statusBlocked}>ACTIVA</span> 
                    : <span className={styles.statusActive}>RESUELTA</span>}
                </td>
                <td>
                  {alert.status === 'ACTIVE' ? (
                    resolvingId === alert._id ? (
                      <div style={{display: 'flex', gap: 5, flexDirection: 'column'}}>
                        <input 
                          type="text" 
                          placeholder="Nota de resolución..." 
                          className={styles.searchInput} 
                          style={{minWidth: 150, padding: 5, fontSize: 12}}
                          value={resolveNote}
                          onChange={(e) => setResolveNote(e.target.value)}
                        />
                        <div style={{display: 'flex', gap: 5}}>
                          <button className={styles.btnUnblock} onClick={() => handleResolve(alert._id)}>Guardar</button>
                          <button className={styles.btnBlock} style={{background: 'var(--surface)'}} onClick={() => {setResolvingId(null); setResolveNote('')}}>X</button>
                        </div>
                      </div>
                    ) : (
                      <button className={styles.btnBlock} onClick={() => setResolvingId(alert._id)}>Resolver</button>
                    )
                  ) : (
                     <div style={{fontSize: 11, color: 'var(--text-secondary)'}}>{alert.resolutionNote || 'Sin nota'}</div>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <style>{`
        @keyframes pulsate {
          0% { transform: scale(1); opacity: 1; }
          50% { transform: scale(1.5); opacity: 0.5; }
          100% { transform: scale(1); opacity: 1; }
        }
      `}</style>
      
      {toast && (
        <div className={`${styles.toast} ${toast.type === 'success' ? styles.toastSuccess : styles.toastError}`}>
          {toast.type === 'success' ? '✅ ' : '❌ '}{toast.msg}
        </div>
      )}
    </div>
  );
}
