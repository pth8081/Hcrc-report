import { NavLink, Outlet } from 'react-router-dom';
import { useAuth } from '../lib/AuthContext';

// menuCode dùng để lọc nav theo quyền THẬT (xem etl/lib/adminPermissions.js)
// — branch-code-map yêu cầu CanEdit ngay cả để XEM (giữ đúng hành vi cũ,
// requireMenuEdit áp cho mọi route kể cả GET — xem etl/routes/admin/branchCodeMap.js).
const NAV = [
  { path: '/dashboard', label: 'Dashboard', icon: '📊', menuCode: 'dashboard' },
  { path: '/data-sources', label: 'Nguồn dữ liệu', icon: '🔌', menuCode: 'data-sources' },
  { path: '/sync-jobs', label: 'Đồng bộ', icon: '🔄', menuCode: 'sync-jobs' },
  { path: '/log', label: 'Log', icon: '🧾', menuCode: 'log' },
  { path: '/audit-log', label: 'Nhật ký thao tác', icon: '📜', menuCode: 'audit-log' },
  { path: '/sales-targets', label: 'Nhập chỉ tiêu', icon: '🎯', menuCode: 'sales-targets' },
  { path: '/branch-code-map', label: 'Ánh xạ mã chi nhánh', icon: '🔗', menuCode: 'branch-code-map', editOnly: true },
  { path: '/users', label: 'Phân quyền', icon: '🔐', menuCode: 'users' },
  { path: '/roles', label: 'Vai trò', icon: '🛡️', menuCode: 'roles' }
];

export default function Layout() {
  const { me, isSystemRole, can, canEdit, logout } = useAuth();
  const nav = NAV.filter(item => (item.editOnly ? canEdit(item.menuCode) : can(item.menuCode)));

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="sidebar-brand">
          <div className="h-logo">H</div>
          <div className="sidebar-brand-text">
            <span className="sidebar-brand-name">HCRC · ETL</span>
            <span className="sidebar-brand-sub">Quản trị đồng bộ</span>
          </div>
        </div>
        <ul className="menu">
          {nav.map(item => (
            <li key={item.path}>
              <NavLink to={item.path} className={({ isActive }) => (isActive ? 'active' : '')}>
                <span className="nav-icon">{item.icon}</span>
                {item.label}
              </NavLink>
            </li>
          ))}
        </ul>
        <div className="sidebar-footer">
          <div className="user-name">{me?.username} {isSystemRole && <span className="role-badge">hệ thống</span>}</div>
          <button type="button" className="logout-link" onClick={logout}>↩ Đăng xuất</button>
        </div>
      </aside>
      <main className="content">
        <Outlet />
      </main>
    </div>
  );
}
