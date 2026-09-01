// App.jsx — Toàn bộ route khớp đúng cây menu ở app/schema.sql (app.MenuItems).
// Thêm 1 route mới LUÔN đi kèm thêm đúng 1 dòng MenuItems + RequireMenuAccess
// cùng code — không có menu nào không có route chặn tương ứng.
import { Routes, Route } from 'react-router-dom';
import { AuthProvider } from './lib/AuthContext';
import Layout from './components/Layout';
import RequireMenuAccess from './components/RequireMenuAccess';
import LoginPage from './pages/LoginPage';
import HomePage from './modules/home/HomePage';
import DashboardPage from './modules/dashboard/DashboardPage';
import ReportsPage from './modules/reports/ReportsPage';
import PermissionsPage from './modules/system/permissions/PermissionsPage';
import ReportCatalogPage from './modules/system/report-catalog/ReportCatalogPage';
import AuditLogPage from './modules/system/audit-log/AuditLogPage';
import CategoriesPage from './modules/system/categories/CategoriesPage';
import EmailSettingsPage from './modules/system/email-settings/EmailSettingsPage';
import EmailSchedulesPage from './modules/system/email-schedules/EmailSchedulesPage';
import AnomalyAlertsPage from './modules/system/anomaly-alerts/AnomalyAlertsPage';
import HcrcWorkspaceSettingsPage from './modules/system/hcrc-workspace/HcrcWorkspaceSettingsPage';

export default function App() {
  return (
    <AuthProvider>
      <Routes>
        <Route path="/login" element={<LoginPage />} />

        <Route element={<Layout />}>
          <Route path="/" element={<RequireMenuAccess code="home"><HomePage /></RequireMenuAccess>} />
          <Route path="/dashboard" element={<RequireMenuAccess code="dashboard"><DashboardPage /></RequireMenuAccess>} />

          {/* 1 route gộp cho MỌI nhóm báo cáo (mã "reports-*") — tab chọn nhóm vẽ
              BÊN TRONG trang, xem modules/reports/ReportsPage.jsx. Vào được nếu
              có quyền ÍT NHẤT 1 nhóm; trang tự ẩn nhóm không có quyền. */}
          <Route path="/reports" element={
            <RequireMenuAccess codes={['reports-kinh-doanh', 'reports-van-hanh', 'reports-mua-hang']}><ReportsPage /></RequireMenuAccess>
          } />

          <Route path="/system/permissions" element={<RequireMenuAccess code="system-permissions"><PermissionsPage /></RequireMenuAccess>} />
          <Route path="/system/report-catalog" element={<RequireMenuAccess code="system-report-catalog"><ReportCatalogPage /></RequireMenuAccess>} />
          <Route path="/system/audit-log" element={<RequireMenuAccess code="system-audit-log"><AuditLogPage /></RequireMenuAccess>} />
          <Route path="/system/categories" element={<RequireMenuAccess code="system-categories"><CategoriesPage /></RequireMenuAccess>} />
          <Route path="/system/email-settings" element={<RequireMenuAccess code="system-email-settings"><EmailSettingsPage /></RequireMenuAccess>} />
          <Route path="/system/email-schedules" element={<RequireMenuAccess code="system-email-schedules"><EmailSchedulesPage /></RequireMenuAccess>} />
          <Route path="/system/anomaly-alerts" element={<RequireMenuAccess code="system-anomaly-alerts"><AnomalyAlertsPage /></RequireMenuAccess>} />
          <Route path="/system/hcrc-workspace" element={<RequireMenuAccess code="system-hcrc-workspace"><HcrcWorkspaceSettingsPage /></RequireMenuAccess>} />
        </Route>
      </Routes>
    </AuthProvider>
  );
}
