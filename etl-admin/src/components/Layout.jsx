import { NavLink, Outlet } from 'react-router-dom';
import { useAuth } from '../lib/AuthContext';

const NAV = [
  { path: '/dashboard', label: 'Dashboard' },
  { path: '/data-sources', label: 'Nguồn dữ liệu' },
  { path: '/sync-jobs', label: 'Đồng bộ' },
  { path: '/log', label: 'Log' },
  { path: '/users', label: 'Phân quyền' }
];

export default function Layout() {
  const { me, isAdmin, logout } = useAuth();

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="sidebar-brand">HCRC · ETL</div>
        <ul className="menu">
          {NAV.map(item => (
            <li key={item.path}>
              <NavLink to={item.path} className={({ isActive }) => (isActive ? 'active' : '')}>{item.label}</NavLink>
            </li>
          ))}
        </ul>
        <div className="sidebar-footer">
          <div className="user-name">{me?.username} <span className="role-badge">{isAdmin ? 'admin' : 'viewer'}</span></div>
          <button type="button" onClick={logout}>Đăng xuất</button>
        </div>
      </aside>
      <main className="content">
        <Outlet />
      </main>
    </div>
  );
}
