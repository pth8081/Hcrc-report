// components/Layout.jsx — Khung chung: sidebar (vẽ đúng theo me.menu, đã lọc
// quyền ở server) + vùng nội dung. Cây menu chỉ sâu 2 cấp (Hệ thống > 5 mục
// con) nên không cần dựng cây tổng quát nhiều cấp.
import { useState } from 'react';
import { NavLink, Outlet } from 'react-router-dom';
import { useAuth } from '../lib/AuthContext';
import UpdateBanner from './UpdateBanner';

// Icon theo "code" menu (đến từ CSDL app.MenuItems, không phải danh sách
// tĩnh) — mục mới thêm sau này không khớp map thì dùng icon mặc định 📄,
// không vỡ giao diện.
const ICONS = {
  home: '🏠',
  dashboard: '📊',
  reports: '📈',
  system: '⚙️',
  'system-permissions': '🔐',
  'system-report-catalog': '🗂️',
  'system-audit-log': '📜',
  'system-categories': '🏷️',
  'system-email-settings': '✉️',
  'system-email-schedules': '⏱️',
  'system-anomaly-alerts': '⚠️',
  'system-hcrc-workspace': '🔗',
  'huong-dan': '❓'
};
function iconFor(code) { return ICONS[code] || '📄'; }

export default function Layout() {
  const { me, logout } = useAuth();
  const [systemOpen, setSystemOpen] = useState(true);
  // Dưới breakpoint di động (xem styles.css @media max-width:880px), sidebar
  // chuyển từ dải cố định 240px cạnh nội dung sang drawer ẩn/hiện qua nút ☰
  // — mặc định đóng, tự đóng lại khi bấm 1 mục điều hướng thật (không đóng
  // khi chỉ bấm mở/đóng nhóm "Hệ thống").
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const closeSidebar = () => setSidebarOpen(false);
  const menu = me?.menu || [];
  // 3 nhóm báo cáo (mã "reports-*") gộp thành 1 mục sidebar duy nhất -> trang
  // /reports (xem modules/reports/ReportsPage.jsx) tự vẽ tab theo nhóm còn
  // được quyền — sidebar không cần biết có bao nhiêu nhóm.
  const reportGroups = menu.filter(m => m.code.startsWith('reports-'));
  const rootItems = menu.filter(m => !m.parentId && !m.code.startsWith('reports-'));
  const systemChildren = menu.filter(m => m.parentId);

  // Chèn đúng 1 mục "Báo cáo" vào vị trí các mục reports-* cũ từng đứng (ngay
  // trước "Hệ thống") — chỉ hiện nếu còn quyền ít nhất 1 nhóm.
  const navItems = [...rootItems];
  if (reportGroups.length) {
    const reportsItem = { code: 'reports', label: 'Báo cáo', path: '/reports' };
    const systemIdx = navItems.findIndex(i => i.code === 'system');
    if (systemIdx === -1) navItems.push(reportsItem);
    else navItems.splice(systemIdx, 0, reportsItem);
  }

  return (
    <div className="app-shell">
      <UpdateBanner />
      <div className="mobile-topbar">
        <button type="button" className="mobile-menu-toggle" onClick={() => setSidebarOpen(true)} aria-label="Mở menu">☰</button>
        <div className="h-logo">H</div>
        <span className="mobile-topbar-title">HCRC · Báo cáo</span>
      </div>
      {sidebarOpen && <div className="sidebar-backdrop" onClick={closeSidebar} />}
      <aside className={`sidebar${sidebarOpen ? ' open' : ''}`}>
        <div className="sidebar-brand">
          <div className="h-logo">H</div>
          <div className="sidebar-brand-text">
            <span className="sidebar-brand-name">HCRC</span>
            <span className="sidebar-brand-sub">Báo cáo &amp; phân tích</span>
          </div>
        </div>
        <ul className="menu">
          {navItems.map(item => {
            const hasChildren = item.code === 'system' && systemChildren.length > 0;
            return (
              <li key={item.code}>
                {hasChildren ? (
                  <button
                    type="button"
                    className="nav-group-toggle"
                    onClick={() => setSystemOpen(!systemOpen)}
                    aria-expanded={systemOpen}
                  >
                    <span className="nav-icon">{iconFor(item.code)}</span>
                    {item.label}
                    <span className="nav-chevron">{systemOpen ? '▾' : '▸'}</span>
                  </button>
                ) : (
                  <NavLink to={item.path} end={item.code !== 'system'} onClick={closeSidebar} className={({ isActive }) => (isActive ? 'active' : '')}>
                    <span className="nav-icon">{iconFor(item.code)}</span>
                    {item.label}
                  </NavLink>
                )}
                {hasChildren && systemOpen && (
                  <ul className="submenu">
                    {systemChildren.map(child => (
                      <li key={child.code}>
                        <NavLink to={child.path} onClick={closeSidebar} className={({ isActive }) => (isActive ? 'active' : '')}>
                          <span className="nav-icon">{iconFor(child.code)}</span>
                          {child.label}
                        </NavLink>
                      </li>
                    ))}
                  </ul>
                )}
              </li>
            );
          })}
        </ul>
        <div className="sidebar-footer">
          <div className="user-name">{me?.fullName}</div>
          <NavLink to="/account" onClick={closeSidebar} className={({ isActive }) => `account-link${isActive ? ' active' : ''}`}>👤 Tài khoản của tôi</NavLink>
          <button type="button" className="logout-link" onClick={logout}>↩ Đăng xuất</button>
          <div className="app-version">v{__APP_VERSION__}</div>
        </div>
      </aside>
      <main className="content">
        <Outlet />
      </main>
    </div>
  );
}
