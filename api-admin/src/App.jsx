import { Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './lib/AuthContext';
import Layout from './components/Layout';
import RequireAuth from './components/RequireAuth';
import LoginPage from './pages/LoginPage';
import ConsumersPage from './pages/ConsumersPage';
import DataSourcesPage from './pages/DataSourcesPage';
import RealtimeEndpointsPage from './pages/RealtimeEndpointsPage';
import RealtimeWriteEndpointsPage from './pages/RealtimeWriteEndpointsPage';
import ReportCatalogPage from './pages/ReportCatalogPage';
import LivePage from './pages/LivePage';
import HistoryPage from './pages/HistoryPage';
import StatsPage from './pages/StatsPage';
import AuditLogPage from './pages/AuditLogPage';
import AdminUsersPage from './pages/AdminUsersPage';
import RolesPage from './pages/RolesPage';

// Vai trò hẹp không thấy "/consumers" trong menu (xem components/Layout.jsx)
// — đưa thẳng vào trang đầu tiên họ thật sự vào được, tránh hạ cánh vào
// trang trống/không có trong nav. Đầy đủ MỌI MenuCode có thể cấp quyền
// (mirror routes/admin/roles.js MENU_CATALOG) — trước đây thiếu
// realtime-endpoints/realtime-write-endpoints/report-catalog/roles, cùng
// lỗi đã sửa bên etl-admin (xem chú thích tương tự trong etl-admin/src/App.jsx).
const LANDING_ORDER = ['consumers', 'data-sources', 'realtime-endpoints', 'realtime-write-endpoints', 'report-catalog', 'live', 'history', 'stats', 'audit-log', 'users', 'roles'];

function IndexRedirect() {
  const { can } = useAuth();
  const menuCode = LANDING_ORDER.find(code => can(code)) || 'consumers';
  return <Navigate to={`/${menuCode === 'users' ? 'admin-users' : menuCode}`} replace />;
}

export default function App() {
  return (
    <AuthProvider>
      <Routes>
        <Route path="/login" element={<LoginPage />} />

        <Route element={<RequireAuth><Layout /></RequireAuth>}>
          <Route path="/" element={<IndexRedirect />} />
          <Route path="/consumers" element={<ConsumersPage />} />
          <Route path="/data-sources" element={<DataSourcesPage />} />
          <Route path="/realtime-endpoints" element={<RealtimeEndpointsPage />} />
          <Route path="/realtime-write-endpoints" element={<RealtimeWriteEndpointsPage />} />
          <Route path="/report-catalog" element={<ReportCatalogPage />} />
          <Route path="/live" element={<LivePage />} />
          <Route path="/history" element={<HistoryPage />} />
          <Route path="/stats" element={<StatsPage />} />
          <Route path="/audit-log" element={<AuditLogPage />} />
          <Route path="/admin-users" element={<AdminUsersPage />} />
          <Route path="/roles" element={<RolesPage />} />
        </Route>
      </Routes>
    </AuthProvider>
  );
}
