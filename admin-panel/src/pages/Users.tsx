import { useEffect, useState, useCallback } from 'react';
import apiClient from '../api/client';
import styles from './Users.module.css';

interface User {
  _id: string;
  name: string;
  email: string;
  role: string;
  isBlocked: boolean;
  phoneNumber?: string;
  avgRating?: number;
  createdAt: string;
  driverApprovalStatus?: string;
}

const ROLE_OPTIONS = ['', 'USER', 'DRIVER', 'ADMIN'];

export default function UsersPage() {
  const [users, setUsers] = useState<User[]>([]);
  const [filtered, setFiltered] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState('');
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [toast, setToast] = useState<{ msg: string; type: 'success' | 'error' } | null>(null);

  const showToast = (msg: string, type: 'success' | 'error' = 'success') => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3500);
  };

  const load = useCallback(async () => {
    try {
      setLoading(true);
      setError('');
      const params: Record<string, string> = {};
      if (roleFilter) params.role = roleFilter;
      const res = await apiClient.get('/admin/users', { params });
      setUsers(res.data.data);
    } catch (e: any) {
      setError(e.response?.data?.message ?? 'Error cargando usuarios');
    } finally {
      setLoading(false);
    }
  }, [roleFilter]);

  useEffect(() => { load(); }, [load]);

  // Client-side search
  useEffect(() => {
    const q = search.toLowerCase();
    if (!q) {
      setFiltered(users);
    } else {
      setFiltered(users.filter(
        (u) => u.name.toLowerCase().includes(q) || u.email.toLowerCase().includes(q)
      ));
    }
  }, [search, users]);

  const banUser = async (id: string, currentlyBlocked: boolean) => {
    setActionLoading(id);
    try {
      await apiClient.put(`/admin/users/${id}/ban`);
      setUsers((prev) => prev.map((u) => u._id === id ? { ...u, isBlocked: !currentlyBlocked } : u));
      showToast(currentlyBlocked ? '🔓 Usuario desbloqueado.' : '🔒 Usuario bloqueado.');
    } catch (e: any) {
      showToast(e.response?.data?.message ?? 'Error', 'error');
    } finally {
      setActionLoading(null);
    }
  };

  const roleClass = (role: string) => {
    if (role === 'ADMIN') return styles.roleAdmin;
    if (role === 'DRIVER') return styles.roleDriver;
    return styles.roleUser;
  };

  return (
    <div className={styles.page}>
      {toast && (
        <div className={`${styles.toast} ${toast.type === 'error' ? styles.toastError : styles.toastSuccess}`}>
          {toast.msg}
        </div>
      )}

      <div className={styles.header}>
        <div>
          <h1 className={styles.title}>Users</h1>
          <p className={styles.subtitle}>
            {loading ? 'Cargando…' : `${filtered.length} usuario${filtered.length !== 1 ? 's' : ''}`}
          </p>
        </div>
        <button className={styles.refreshBtn} onClick={load} disabled={loading}>
          {loading ? '⏳' : '🔄'} Actualizar
        </button>
      </div>

      {/* Filters */}
      <div className={styles.filterBar}>
        <input
          className={styles.searchInput}
          placeholder="🔍 Buscar por nombre o email…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <select
          className={styles.select}
          value={roleFilter}
          onChange={(e) => setRoleFilter(e.target.value)}
        >
          {ROLE_OPTIONS.map((r) => (
            <option key={r} value={r}>{r || 'Todos los roles'}</option>
          ))}
        </select>
      </div>

      {error && <div className={styles.errorBox}>⚠️ {error}</div>}

      {loading ? (
        <div className={styles.tableWrap}>
          <div className={styles.skeletonList}>
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className={`skeleton ${styles.skeletonRow}`} />
            ))}
          </div>
        </div>
      ) : filtered.length === 0 ? (
        <div className={styles.empty}>
          <span className={styles.emptyIcon}>👀</span>
          <p>No se encontraron usuarios.</p>
        </div>
      ) : (
        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th>Usuario</th>
                <th>Rol</th>
                <th>Estado</th>
                <th>Rating</th>
                <th>Registrado</th>
                <th>Acciones</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((u, i) => (
                <tr
                  key={u._id}
                  className={`animate-fade-in ${u.isBlocked ? styles.rowBlocked : ''}`}
                  style={{ animationDelay: `${i * 40}ms` }}
                >
                  <td>
                    <div className={styles.userCell}>
                      <div className={styles.userAvatar}>{u.name.charAt(0).toUpperCase()}</div>
                      <div>
                        <div className={styles.userName}>{u.name}</div>
                        <div className={styles.userEmail}>{u.email}</div>
                        {u.phoneNumber && <div className={styles.userPhone}>{u.phoneNumber}</div>}
                      </div>
                    </div>
                  </td>
                  <td>
                    <span className={`${styles.roleBadge} ${roleClass(u.role)}`}>{u.role}</span>
                  </td>
                  <td>
                    <span className={u.isBlocked ? styles.statusBlocked : styles.statusActive}>
                      {u.isBlocked ? '🔒 Bloqueado' : '✅ Activo'}
                    </span>
                  </td>
                  <td>
                    <span className={styles.rating}>
                      ⭐ {u.avgRating != null ? u.avgRating.toFixed(1) : '—'}
                    </span>
                  </td>
                  <td>
                    <span className={styles.date}>
                      {new Date(u.createdAt).toLocaleDateString('es-ES')}
                    </span>
                  </td>
                  <td>
                    <button
                      className={u.isBlocked ? styles.btnUnblock : styles.btnBlock}
                      onClick={() => banUser(u._id, u.isBlocked)}
                      disabled={actionLoading === u._id || u.role === 'ADMIN'}
                      title={u.role === 'ADMIN' ? 'No puedes bloquear a un ADMIN' : ''}
                    >
                      {actionLoading === u._id ? '⏳' : u.isBlocked ? '🔓 Desbloquear' : '🔒 Bloquear'}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
