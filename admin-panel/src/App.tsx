import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { useAuthStore } from './store/authStore';
import Layout from './components/Layout';
import LoginPage from './pages/Login';
import DashboardPage from './pages/Dashboard';
import DriversPendingPage from './pages/DriversPending';
import UsersPage from './pages/Users';
import RidesPage from './pages/Rides';
import SOSPage from './pages/SOS';
import PromosPage from './pages/Promos';
import AnalyticsPage from './pages/Analytics';

import { useEffect } from 'react';

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, hydrate } = useAuthStore();

  useEffect(() => {
    hydrate();
  }, [hydrate]);

  // Prevent flicker during hydrate basically if not authenticated check localStorage
  const hasToken = !!localStorage.getItem('admin_token');
  if (!isAuthenticated && hasToken) return null; // Wait for hydrate

  return isAuthenticated ? <>{children}</> : <Navigate to="/login" replace />;
}

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route
          path="/"
          element={
            <ProtectedRoute>
              <Layout />
            </ProtectedRoute>
          }
        >
          <Route index element={<Navigate to="/dashboard" replace />} />
          <Route path="dashboard" element={<DashboardPage />} />
          <Route path="drivers-pending" element={<DriversPendingPage />} />
          <Route path="rides" element={<RidesPage />} />
          <Route path="users" element={<UsersPage />} />
          <Route path="sos" element={<SOSPage />} />
          <Route path="promos" element={<PromosPage />} />
          <Route path="analytics" element={<AnalyticsPage />} />
        </Route>
        <Route path="*" element={<Navigate to="/dashboard" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
