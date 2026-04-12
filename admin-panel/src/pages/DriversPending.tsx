import { useEffect, useState, useCallback } from 'react';
import apiClient from '../api/client';
import styles from './DriversPending.module.css';

interface Driver {
  _id: string;
  name: string;
  email: string;
  phoneNumber?: string;
  driverApprovalStatus: string;
  vehicle?: {
    make?: string;
    model?: string;
    year?: number;
    plate?: string;
    color?: string;
  };
  createdAt: string;
}

export default function DriversPendingPage() {
  const [drivers, setDrivers] = useState<Driver[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [rejectModal, setRejectModal] = useState<{ id: string; name: string } | null>(null);
  const [rejectReason, setRejectReason] = useState('');
  const [toast, setToast] = useState<{ msg: string; type: 'success' | 'error' } | null>(null);

  const showToast = (msg: string, type: 'success' | 'error' = 'success') => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3500);
  };

  const load = useCallback(async () => {
    try {
      setLoading(true);
      setError('');
      const res = await apiClient.get('/admin/drivers/pending');
      setDrivers(res.data.data);
    } catch (e: any) {
      setError(e.response?.data?.message ?? 'Error cargando conductores');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const approve = async (id: string) => {
    setActionLoading(id + '_approve');
    try {
      await apiClient.put(`/admin/drivers/${id}/approve`);
      setDrivers((prev) => prev.filter((d) => d._id !== id));
      showToast('✅ Conductor aprobado exitosamente.');
    } catch (e: any) {
      showToast(e.response?.data?.message ?? 'Error al aprobar', 'error');
    } finally {
      setActionLoading(null);
    }
  };

  const reject = async () => {
    if (!rejectModal || !rejectReason.trim()) return;
    setActionLoading(rejectModal.id + '_reject');
    try {
      await apiClient.put(`/admin/drivers/${rejectModal.id}/reject`, { rejectionReason: rejectReason });
      setDrivers((prev) => prev.filter((d) => d._id !== rejectModal.id));
      showToast('❌ Conductor rechazado.');
      setRejectModal(null);
      setRejectReason('');
    } catch (e: any) {
      showToast(e.response?.data?.message ?? 'Error al rechazar', 'error');
    } finally {
      setActionLoading(null);
    }
  };

  const statusColor = (status: string) => {
    if (status === 'DOCS_SUBMITTED') return styles.statusSubmitted;
    if (status === 'UNDER_REVIEW') return styles.statusReview;
    return styles.statusPending;
  };

  const statusLabel = (status: string) => {
    const map: Record<string, string> = {
      DOCS_SUBMITTED: 'Docs enviados',
      UNDER_REVIEW: 'En revisión',
      PENDING_DOCS: 'Pendiente docs',
    };
    return map[status] ?? status;
  };

  return (
    <div className={styles.page}>
      {/* Toast */}
      {toast && (
        <div className={`${styles.toast} ${toast.type === 'error' ? styles.toastError : styles.toastSuccess}`}>
          {toast.msg}
        </div>
      )}

      {/* Reject Modal */}
      {rejectModal && (
        <div className={styles.overlay} onClick={() => setRejectModal(null)}>
          <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
            <h3 className={styles.modalTitle}>Rechazar conductor</h3>
            <p className={styles.modalSub}>Conductor: <strong>{rejectModal.name}</strong></p>
            <textarea
              className={styles.textarea}
              placeholder="Motivo del rechazo (obligatorio)…"
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
              rows={4}
            />
            <div className={styles.modalActions}>
              <button className={styles.btnSecondary} onClick={() => setRejectModal(null)}>Cancelar</button>
              <button
                className={styles.btnDanger}
                onClick={reject}
                disabled={!rejectReason.trim() || actionLoading !== null}
              >
                {actionLoading ? 'Procesando…' : 'Confirmar rechazo'}
              </button>
            </div>
          </div>
        </div>
      )}

      <div className={styles.header}>
        <div>
          <h1 className={styles.title}>Drivers Pending</h1>
          <p className={styles.subtitle}>
            {loading ? 'Cargando…' : `${drivers.length} conductor${drivers.length !== 1 ? 'es' : ''} pendiente${drivers.length !== 1 ? 's' : ''} de revisión`}
          </p>
        </div>
        <button className={styles.refreshBtn} onClick={load} disabled={loading}>
          {loading ? '⏳' : '🔄'} Actualizar
        </button>
      </div>

      {error && <div className={styles.errorBox}>⚠️ {error}</div>}

      {loading ? (
        <div className={styles.skeletonList}>
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className={`${styles.card} skeleton`} style={{ height: 120 }} />
          ))}
        </div>
      ) : drivers.length === 0 ? (
        <div className={styles.empty}>
          <span className={styles.emptyIcon}>🎉</span>
          <p>No hay conductores pendientes de revisión.</p>
        </div>
      ) : (
        <div className={styles.list}>
          {drivers.map((d, i) => (
            <div
              key={d._id}
              className={`${styles.card} animate-fade-in`}
              style={{ animationDelay: `${i * 60}ms` }}
            >
              <div className={styles.cardMain}>
                <div className={styles.avatar}>{d.name.charAt(0).toUpperCase()}</div>
                <div className={styles.info}>
                  <div className={styles.nameRow}>
                    <span className={styles.name}>{d.name}</span>
                    <span className={`${styles.status} ${statusColor(d.driverApprovalStatus)}`}>
                      {statusLabel(d.driverApprovalStatus)}
                    </span>
                  </div>
                  <span className={styles.email}>{d.email}</span>
                  {d.phoneNumber && <span className={styles.phone}>📞 {d.phoneNumber}</span>}
                  {d.vehicle?.make && (
                    <span className={styles.vehicle}>
                      🚗 {d.vehicle.make} {d.vehicle.model} {d.vehicle.year && `(${d.vehicle.year})`}
                      {d.vehicle.plate && ` · ${d.vehicle.plate}`}
                      {d.vehicle.color && ` · ${d.vehicle.color}`}
                    </span>
                  )}
                  <span className={styles.date}>
                    Registrado: {new Date(d.createdAt).toLocaleDateString('es-ES')}
                  </span>
                </div>
              </div>
              <div className={styles.actions}>
                <button
                  className={styles.btnApprove}
                  onClick={() => approve(d._id)}
                  disabled={actionLoading !== null}
                >
                  {actionLoading === d._id + '_approve' ? '⏳' : '✅'} Aprobar
                </button>
                <button
                  className={styles.btnReject}
                  onClick={() => setRejectModal({ id: d._id, name: d.name })}
                  disabled={actionLoading !== null}
                >
                  ❌ Rechazar
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
