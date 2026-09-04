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
import SalesTargetsPage from './pages/SalesTargetsPage';
import BranchCodeMapPage from './pages/BranchCodeMapPage';

// target_importer không thấy "/dashboard" trong menu (xem Layout.jsx) —
// đưa thẳng vào trang họ thật sự dùng được, tránh hạ cánh vào trang trống/
// không có trong nav.
function IndexRedirect() {
  const { isTargetImporter } = useAuth();
  return <Navigate to={isTargetImporter ? '/sales-targets' : '/dashboard'} replace />;
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
        </Route>
      </Routes>
    </AuthProvider>
  );
}
