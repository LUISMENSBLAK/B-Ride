import { useEffect, useState } from 'react';
import apiClient from '../api/client';
import styles from './Users.module.css';

interface Promo {
  _id: string;
  code: string;
  type: 'PERCENTAGE' | 'FIXED_AMOUNT';
  value: number;
  minRideValue: number;
  isActive: boolean;
  startDate: string;
  endDate: string;
  usageLimit: number;
  usedCount: number;
  description: string;
}

export default function Promos() {
  const [promos, setPromos] = useState<Promo[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [toast, setToast] = useState<{msg: string, type: 'success'|'error'} | null>(null);

  const [formData, setFormData] = useState({
    code: '', type: 'PERCENTAGE', value: '', startDate: '', endDate: '', usageLimit: '', minRideValue: '', description: ''
  });

  const fetchPromos = async () => {
    try {
      const res = await apiClient.get('/promos');
      if (res.data.success) setPromos(res.data.data);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchPromos(); }, []);

  const showToast = (msg: string, type: 'success'|'error') => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3000);
  };

  const handleToggle = async (id: string, currentStatus: boolean) => {
    try {
      await apiClient.put(`/promos/${id}`, { isActive: !currentStatus });
      fetchPromos();
      showToast(currentStatus ? 'Promoción desactivada' : 'Promoción activada', 'success');
    } catch (e: any) {
      showToast(e.response?.data?.message || 'Error', 'error');
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const res = await apiClient.post('/promos', {
        ...formData,
        value: Number(formData.value),
        usageLimit: Number(formData.usageLimit) || 0,
        minRideValue: Number(formData.minRideValue) || 0,
      });
      if (res.data.success) {
        showToast('Promoción creada', 'success');
        setShowModal(false);
        setFormData({ code: '', type: 'PERCENTAGE', value: '', startDate: '', endDate: '', usageLimit: '', minRideValue: '', description: '' });
        fetchPromos();
      }
    } catch (e: any) {
      showToast(e.response?.data?.message || 'Error al crear', 'error');
    }
  };

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <div>
          <h1 className={styles.title}>Promociones</h1>
          <p className={styles.subtitle}>Gestión de códigos de descuento y campañas.</p>
        </div>
        <button className={styles.refreshBtn} onClick={() => setShowModal(true)}>
          + Nuevo Código
        </button>
      </header>

      <div className={styles.tableWrap}>
        <table className={styles.table}>
          <thead>
            <tr>
              <th>Código</th>
              <th>Tipo</th>
              <th>Descuento</th>
              <th>Mínimo Viaje</th>
              <th>Usos</th>
              <th>Vigencia</th>
              <th>Estado</th>
            </tr>
          </thead>
          <tbody>
            {promos.length === 0 && !loading && (
              <tr><td colSpan={7}><div className={styles.empty}><p>No hay promociones registradas.</p></div></td></tr>
            )}
            {promos.map(p => (
              <tr key={p._id} className={!p.isActive ? styles.rowBlocked : ''}>
                <td><div style={{fontWeight: 'bold', color: 'var(--gold)', letterSpacing: 1}}>{p.code}</div></td>
                <td><span className={p.type === 'PERCENTAGE' ? styles.roleAdmin : styles.roleUser}>{p.type}</span></td>
                <td>{p.type === 'PERCENTAGE' ? `${p.value}%` : `$${p.value}`}</td>
                <td>${p.minRideValue}</td>
                <td>{p.usedCount} / {p.usageLimit === 0 ? '∞' : p.usageLimit}</td>
                <td>
                  <div style={{fontSize: 12, color: 'var(--text-secondary)'}}>
                    De: {new Date(p.startDate).toLocaleDateString()}<br/>
                    A: {new Date(p.endDate).toLocaleDateString()}
                  </div>
                </td>
                <td>
                  <button 
                    className={p.isActive ? styles.btnBlock : styles.btnUnblock} 
                    onClick={() => handleToggle(p._id, p.isActive)}
                  >
                    {p.isActive ? 'Desactivar' : 'Activar'}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {showModal && (
        <div style={{position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.8)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center'}}>
          <div style={{background: 'var(--surface)', padding: 30, borderRadius: 16, width: 400, maxWidth: '90%', border: '1px solid var(--border)'}}>
            <h2 style={{marginTop: 0, marginBottom: 20, color: 'var(--text)'}}>Nueva Promoción</h2>
            <form onSubmit={handleSubmit} style={{display: 'flex', flexDirection: 'column', gap: 15}}>
              <div>
                <label style={{display: 'block', fontSize: 13, color:'var(--text-secondary)', marginBottom: 5}}>Código</label>
                <input required className={styles.searchInput} style={{width: '100%', boxSizing: 'border-box'}} value={formData.code} onChange={e => setFormData({...formData, code: e.target.value.toUpperCase()})} />
              </div>
              <div style={{display: 'flex', gap: 10}}>
                <div style={{flex: 1}}>
                  <label style={{display: 'block', fontSize: 13, color:'var(--text-secondary)', marginBottom: 5}}>Tipo</label>
                  <select className={styles.select} style={{width: '100%', boxSizing: 'border-box'}} value={formData.type} onChange={e => setFormData({...formData, type: e.target.value as any})}>
                    <option value="PERCENTAGE">Porcentaje</option>
                    <option value="FIXED_AMOUNT">Monto Fijo</option>
                  </select>
                </div>
                <div style={{flex: 1}}>
                  <label style={{display: 'block', fontSize: 13, color:'var(--text-secondary)', marginBottom: 5}}>Valor</label>
                  <input type="number" required className={styles.searchInput} style={{width: '100%', boxSizing: 'border-box'}} value={formData.value} onChange={e => setFormData({...formData, value: e.target.value})} />
                </div>
              </div>
              <div style={{display: 'flex', gap: 10}}>
                <div style={{flex: 1}}>
                  <label style={{display: 'block', fontSize: 13, color:'var(--text-secondary)', marginBottom: 5}}>Mínimo ($)</label>
                  <input type="number" className={styles.searchInput} style={{width: '100%', boxSizing: 'border-box'}} value={formData.minRideValue} onChange={e => setFormData({...formData, minRideValue: e.target.value})} />
                </div>
                <div style={{flex: 1}}>
                  <label style={{display: 'block', fontSize: 13, color:'var(--text-secondary)', marginBottom: 5}}>Límite usos (0=∞)</label>
                  <input type="number" className={styles.searchInput} style={{width: '100%', boxSizing: 'border-box'}} value={formData.usageLimit} onChange={e => setFormData({...formData, usageLimit: e.target.value})} />
                </div>
              </div>
              <div style={{display: 'flex', gap: 10}}>
                <div style={{flex: 1}}>
                  <label style={{display: 'block', fontSize: 13, color:'var(--text-secondary)', marginBottom: 5}}>Fecha Inicio</label>
                  <input type="date" required className={styles.searchInput} style={{width: '100%', boxSizing: 'border-box'}} value={formData.startDate} onChange={e => setFormData({...formData, startDate: e.target.value})} />
                </div>
                <div style={{flex: 1}}>
                  <label style={{display: 'block', fontSize: 13, color:'var(--text-secondary)', marginBottom: 5}}>Fecha Fin</label>
                  <input type="date" required className={styles.searchInput} style={{width: '100%', boxSizing: 'border-box'}} value={formData.endDate} onChange={e => setFormData({...formData, endDate: e.target.value})} />
                </div>
              </div>
              <div>
                <label style={{display: 'block', fontSize: 13, color:'var(--text-secondary)', marginBottom: 5}}>Descripción</label>
                <input required className={styles.searchInput} style={{width: '100%', boxSizing: 'border-box'}} value={formData.description} onChange={e => setFormData({...formData, description: e.target.value})} />
              </div>
              
              <div style={{display: 'flex', gap: 10, marginTop: 10}}>
                <button type="button" className={styles.btnBlock} style={{flex: 1, padding: 12}} onClick={() => setShowModal(false)}>Cancelar</button>
                <button type="submit" className={styles.btnUnblock} style={{flex: 1, padding: 12}}>Crear</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {toast && (
        <div className={`${styles.toast} ${toast.type === 'success' ? styles.toastSuccess : styles.toastError}`}>
          {toast.type === 'success' ? '✅ ' : '❌ '}{toast.msg}
        </div>
      )}
    </div>
  );
}
