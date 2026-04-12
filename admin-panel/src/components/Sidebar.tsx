import { NavLink, useNavigate } from 'react-router-dom';
import { useAuthStore } from '../store/authStore';
import styles from './Sidebar.module.css';

const NAV_ITEMS = [
  { to: '/dashboard', label: 'Dashboard', icon: '📊' },
  { to: '/drivers-pending', label: 'Drivers Pending', icon: '🚗' },
  { to: '/users', label: 'Users', icon: '👥' },
  { to: '/sos', label: 'SOS', icon: '🚨' },
  { to: '/promos', label: 'Promos', icon: '🎁' },
  { to: '/analytics', label: 'Analytics', icon: '📈' },
];

export default function Sidebar() {
  const { user, logout } = useAuthStore();
  const navigate = useNavigate();

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  return (
    <aside className={styles.sidebar}>
      {/* Logo */}
      <div className={styles.logoWrap}>
        <img src="/icon.png" alt="B-Ride" className={styles.logo} />
        <span className={styles.logoLabel}>B-Ride<span className={styles.logoAdmin}>Admin</span></span>
      </div>

      {/* Navigation */}
      <nav className={styles.nav}>
        {NAV_ITEMS.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            className={({ isActive }) =>
              `${styles.navItem} ${isActive ? styles.navItemActive : ''}`
            }
          >
            <span className={styles.navIcon}>{item.icon}</span>
            <span>{item.label}</span>
          </NavLink>
        ))}
      </nav>

      {/* User info + logout */}
      <div className={styles.footer}>
        <div className={styles.userInfo}>
          <div className={styles.avatar}>{user?.name?.charAt(0).toUpperCase() ?? 'A'}</div>
          <div className={styles.userMeta}>
            <span className={styles.userName}>{user?.name ?? 'Admin'}</span>
            <span className={styles.userRole}>ADMIN</span>
          </div>
        </div>
        <button className={styles.logoutBtn} onClick={handleLogout} title="Cerrar sesión">
          ⏻
        </button>
      </div>
    </aside>
  );
}
