import { NavLink, Outlet } from 'react-router-dom';
import { useAuth } from '../lib/AuthContext';

const NAV = [
  { path: '/dashboard', label: 'Dashboard', icon: '📊' },
  { path: '/data-sources', label: 'Nguồn dữ liệu', icon: '🔌' },
  { path: '/sync-jobs', label: 'Đồng bộ', icon: '🔄' },
  { path: '/log', label: 'Log', icon: '🧾' },
  { path: '/audit-log', label: 'Nhật ký thao tác', icon: '📜' },
  { path: '/sales-targets', label: 'Nhập chỉ tiêu', icon: '🎯' },
  { path: '/users', label: 'Phân quyền', icon: '🔐' }
];

export default function Layout() {
  const { me, isAdmin, isTargetImporter, logout } = useAuth();
  // target_importer là vai trò HẸP — CHỈ thấy đúng "Nhập chỉ tiêu", không
  // thấy DataSources/SyncJobs/Log/Users (hạ tầng ETL thật, không liên quan
  // tới việc nhập chỉ tiêu — xem etl/lib/adminAuth.js).
  const nav = isTargetImporter ? NAV.filter(item => item.path === '/sales-targets') : NAV;

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
          <div className="user-name">{me?.username} <span className="role-badge">{me?.role}</span></div>
          <button type="button" className="logout-link" onClick={logout}>↩ Đăng xuất</button>
        </div>
      </aside>
      <main className="content">
        <Outlet />
      </main>
    </div>
  );
}
