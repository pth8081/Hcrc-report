// components/Layout.jsx — Khung chung: sidebar (vẽ đúng theo me.menu, đã lọc
// quyền ở server) + vùng nội dung. Cây menu chỉ sâu 2 cấp (Hệ thống > 5 mục
// con) nên không cần dựng cây tổng quát nhiều cấp.
import { useState } from 'react';
import { NavLink, Outlet } from 'react-router-dom';
import { useAuth } from '../lib/AuthContext';

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
  'system-hcrc-workspace': '🔗'
};
function iconFor(code) { return ICONS[code] || '📄'; }

export default function Layout() {
  const { me, logout } = useAuth();
  const [systemOpen, setSystemOpen] = useState(true);
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
      <aside className="sidebar">
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
                  <NavLink to={item.path} end={item.code !== 'system'} className={({ isActive }) => (isActive ? 'active' : '')}>
                    <span className="nav-icon">{iconFor(item.code)}</span>
                    {item.label}
                  </NavLink>
                )}
                {hasChildren && systemOpen && (
                  <ul className="submenu">
                    {systemChildren.map(child => (
                      <li key={child.code}>
                        <NavLink to={child.path} className={({ isActive }) => (isActive ? 'active' : '')}>
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
          <button type="button" className="logout-link" onClick={logout}>↩ Đăng xuất</button>
        </div>
      </aside>
      <main className="content">
        <Outlet />
      </main>
    </div>
  );
}
