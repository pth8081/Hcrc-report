import { NavLink, Outlet } from 'react-router-dom';
import { useAuth } from '../lib/AuthContext';

const NAV = [
  { path: '/dashboard', label: 'Dashboard' },
  { path: '/data-sources', label: 'Nguồn dữ liệu' },
  { path: '/sync-jobs', label: 'Đồng bộ' },
  { path: '/log', label: 'Log' },
  { path: '/sales-targets', label: 'Nhập chỉ tiêu' },
  { path: '/users', label: 'Phân quyền' }
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
        <div className="sidebar-brand">HCRC · ETL</div>
        <ul className="menu">
          {nav.map(item => (
            <li key={item.path}>
              <NavLink to={item.path} className={({ isActive }) => (isActive ? 'active' : '')}>{item.label}</NavLink>
            </li>
          ))}
        </ul>
        <div className="sidebar-footer">
          <div className="user-name">{me?.username} <span className="role-badge">{me?.role}</span></div>
          <button type="button" onClick={logout}>Đăng xuất</button>
        </div>
      </aside>
      <main className="content">
        <Outlet />
      </main>
    </div>
  );
}
