// components/Layout.jsx — Điều hướng cố định 4 trang — không cần đọc từ
// server như rp-user/ chính (không có cây menu/quyền cho quy mô nhỏ này,
// xem tài liệu kiến trúc, mục 03). Ẩn/hiện theo vai trò chỉ áp dụng ở TỪNG
// trang (vd nút thêm/sửa/xoá đối tác), không áp dụng ở cấp điều hướng.
import { NavLink, Outlet } from 'react-router-dom';
import { useAuth } from '../lib/AuthContext';

const NAV = [
  { path: '/consumers', label: 'Đối tác', icon: '🤝' },
  { path: '/data-sources', label: 'Nguồn dữ liệu', icon: '🔌' },
  { path: '/realtime-endpoints', label: 'Endpoint realtime', icon: '⚡' },
  { path: '/report-catalog', label: 'Báo cáo', icon: '📊' },
  { path: '/live', label: 'Kết nối hiện tại', icon: '🌐' },
  { path: '/history', label: 'Lịch sử', icon: '🕓' },
  { path: '/stats', label: 'Top truy vấn', icon: '📈' },
  { path: '/audit-log', label: 'Nhật ký thao tác', icon: '📜' },
  { path: '/admin-users', label: 'Tài khoản quản trị', icon: '🔐' }
];

export default function Layout() {
  const { me, isAdmin, logout } = useAuth();

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="sidebar-brand">
          <div className="h-logo">H</div>
          <div className="sidebar-brand-text">
            <span className="sidebar-brand-name">HCRC · API</span>
            <span className="sidebar-brand-sub">Quản trị đối tác</span>
          </div>
        </div>
        <ul className="menu">
          {NAV.map(item => (
            <li key={item.path}>
              <NavLink to={item.path} className={({ isActive }) => (isActive ? 'active' : '')}>
                <span className="nav-icon">{item.icon}</span>
                {item.label}
              </NavLink>
            </li>
          ))}
        </ul>
        <div className="sidebar-footer">
          <div className="user-name">{me?.username} <span className="role-badge">{isAdmin ? 'admin' : 'viewer'}</span></div>
          <button type="button" className="logout-link" onClick={logout}>↩ Đăng xuất</button>
        </div>
      </aside>
      <main className="content">
        <Outlet />
      </main>
    </div>
  );
}
