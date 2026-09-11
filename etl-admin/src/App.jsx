import { Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './lib/AuthContext';
import Layout from './components/Layout';
import RequireAuth from './components/RequireAuth';
import LoginPage from './pages/LoginPage';
import DashboardPage from './pages/DashboardPage';
import DataSourcesPage from './pages/DataSourcesPage';
import SyncJobsPage from './pages/SyncJobsPage';
import LogPage from './pages/LogPage';
import AuditLogPage from './pages/AuditLogPage';
import UsersPage from './pages/UsersPage';
import RolesPage from './pages/RolesPage';
import SalesTargetsPage from './pages/SalesTargetsPage';
import BranchCodeMapPage from './pages/BranchCodeMapPage';

// Vai trò hẹp (vd chỉ thấy "Nhập chỉ tiêu") không thấy "/dashboard" trong
// menu (xem components/Layout.jsx) — đưa thẳng vào trang đầu tiên họ thật
// sự vào được, tránh hạ cánh vào trang trống/không có trong nav.
const LANDING_ORDER = ['dashboard', 'sales-targets', 'data-sources', 'sync-jobs', 'users'];

function IndexRedirect() {
  const { can } = useAuth();
  const menuCode = LANDING_ORDER.find(code => can(code)) || 'dashboard';
  return <Navigate to={`/${menuCode}`} replace />;
}

export default function App() {
  return (
    <AuthProvider>
      <Routes>
        <Route path="/login" element={<LoginPage />} />

        <Route element={<RequireAuth><Layout /></RequireAuth>}>
          <Route path="/" element={<IndexRedirect />} />
          <Route path="/dashboard" element={<DashboardPage />} />
          <Route path="/data-sources" element={<DataSourcesPage />} />
          <Route path="/sync-jobs" element={<SyncJobsPage />} />
          <Route path="/log" element={<LogPage />} />
          <Route path="/audit-log" element={<AuditLogPage />} />
          <Route path="/sales-targets" element={<SalesTargetsPage />} />
          <Route path="/branch-code-map" element={<BranchCodeMapPage />} />
          <Route path="/users" element={<UsersPage />} />
          <Route path="/roles" element={<RolesPage />} />
        </Route>
      </Routes>
    </AuthProvider>
  );
}
