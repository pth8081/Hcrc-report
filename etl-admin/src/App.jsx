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
import AccountPage from './pages/AccountPage';

// Vai trò hẹp (vd chỉ thấy "Nhập chỉ tiêu") không thấy "/dashboard" trong
// menu (xem components/Layout.jsx) — đưa thẳng vào trang đầu tiên họ thật
// sự vào được, tránh hạ cánh vào trang trống/không có trong nav.
// Đầy đủ MỌI MenuCode có thể cấp quyền (mirror routes/admin/roles.js
// MENU_CATALOG) — trước đây thiếu roles/log/audit-log/branch-code-map,
// khiến 1 tài khoản CHỈ được cấp 1 trong 4 trang này bị điều hướng về
// '/dashboard' (trang không thấy được) ngay sau đăng nhập thay vì vào đúng
// trang mình có quyền.
const LANDING_ORDER = ['dashboard', 'sales-targets-corp', 'sales-targets-hcrc', 'data-sources', 'sync-jobs', 'branch-code-map', 'log', 'audit-log', 'users', 'roles'];

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
          {/* Trước là 1 route "/sales-targets" chung — tách 2 instance ĐỘC
              LẬP của cùng 1 component theo đúng 2 báo cáo tiêu thụ chỉ tiêu
              (xem chú thích đầu pages/SalesTargetsPage.jsx). */}
          <Route path="/sales-targets-corp" element={
            <SalesTargetsPage menuCode="sales-targets-corp" apiBase="/sales-targets-corp" title="Chỉ tiêu Lãnh đạo Tập đoàn" />
          } />
          <Route path="/sales-targets-hcrc" element={
            <SalesTargetsPage menuCode="sales-targets-hcrc" apiBase="/sales-targets-hcrc" title="Chỉ tiêu HCRC" />
          } />
          <Route path="/branch-code-map" element={<BranchCodeMapPage />} />
          <Route path="/users" element={<UsersPage />} />
          <Route path="/roles" element={<RolesPage />} />
          <Route path="/account" element={<AccountPage />} />
        </Route>
      </Routes>
    </AuthProvider>
  );
}
