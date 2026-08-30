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
import ReportsModulePage from './modules/reports/ReportsModulePage';
import PermissionsPage from './modules/system/permissions/PermissionsPage';
import ReportCatalogPage from './modules/system/report-catalog/ReportCatalogPage';
import AuditLogPage from './modules/system/audit-log/AuditLogPage';
import CategoriesPage from './modules/system/categories/CategoriesPage';
import EmailSettingsPage from './modules/system/email-settings/EmailSettingsPage';

export default function App() {
  return (
    <AuthProvider>
      <Routes>
        <Route path="/login" element={<LoginPage />} />

        <Route element={<Layout />}>
          <Route path="/" element={<RequireMenuAccess code="home"><HomePage /></RequireMenuAccess>} />
          <Route path="/dashboard" element={<RequireMenuAccess code="dashboard"><DashboardPage /></RequireMenuAccess>} />

          <Route path="/reports/kinh-doanh" element={
            <RequireMenuAccess code="reports-kinh-doanh"><ReportsModulePage menuCode="reports-kinh-doanh" title="Báo cáo kinh doanh" /></RequireMenuAccess>
          } />
          <Route path="/reports/van-hanh" element={
            <RequireMenuAccess code="reports-van-hanh"><ReportsModulePage menuCode="reports-van-hanh" title="Báo cáo vận hành" /></RequireMenuAccess>
          } />
          <Route path="/reports/mua-hang" element={
            <RequireMenuAccess code="reports-mua-hang"><ReportsModulePage menuCode="reports-mua-hang" title="Báo cáo Mua hàng" /></RequireMenuAccess>
          } />

          <Route path="/system/permissions" element={<RequireMenuAccess code="system-permissions"><PermissionsPage /></RequireMenuAccess>} />
          <Route path="/system/report-catalog" element={<RequireMenuAccess code="system-report-catalog"><ReportCatalogPage /></RequireMenuAccess>} />
          <Route path="/system/audit-log" element={<RequireMenuAccess code="system-audit-log"><AuditLogPage /></RequireMenuAccess>} />
          <Route path="/system/categories" element={<RequireMenuAccess code="system-categories"><CategoriesPage /></RequireMenuAccess>} />
          <Route path="/system/email-settings" element={<RequireMenuAccess code="system-email-settings"><EmailSettingsPage /></RequireMenuAccess>} />
        </Route>
      </Routes>
    </AuthProvider>
  );
}
