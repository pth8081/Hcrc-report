// components/Layout.jsx — Điều hướng lọc theo quyền THẬT (nhóm quyền động,
// xem api-server/lib/adminPermissions.js) — thay danh sách cố định cũ (mọi
// admin/viewer thấy MỌI trang, chỉ nút thêm/sửa/xoá gói theo vai trò).
import { useState } from 'react';
import { NavLink, Outlet } from 'react-router-dom';
import { useAuth } from '../lib/AuthContext';
import UpdateBanner from './UpdateBanner';

const NAV = [
  { path: '/consumers', label: 'Đối tác', icon: '🤝', menuCode: 'consumers' },
  { path: '/data-sources', label: 'Nguồn dữ liệu', icon: '🔌', menuCode: 'data-sources' },
  { path: '/realtime-endpoints', label: 'Endpoint realtime', icon: '⚡', menuCode: 'realtime-endpoints' },
  { path: '/realtime-write-endpoints', label: 'Endpoint ghi', icon: '✍️', menuCode: 'realtime-write-endpoints' },
  { path: '/report-catalog', label: 'Báo cáo', icon: '📊', menuCode: 'report-catalog' },
  { path: '/live', label: 'Kết nối hiện tại', icon: '🌐', menuCode: 'live' },
  { path: '/history', label: 'Lịch sử', icon: '🕓', menuCode: 'history' },
  { path: '/stats', label: 'Top truy vấn', icon: '📈', menuCode: 'stats' },
  { path: '/audit-log', label: 'Nhật ký thao tác', icon: '📜', menuCode: 'audit-log' },
  { path: '/admin-users', label: 'Tài khoản quản trị', icon: '🔐', menuCode: 'users' },
  { path: '/roles', label: 'Vai trò', icon: '🛡️', menuCode: 'roles' }
];

export default function Layout() {
  const { me, isSystemRole, can, logout } = useAuth();
  const nav = NAV.filter(item => can(item.menuCode));
  // Dưới breakpoint di động (xem styles.css @media max-width:880px), sidebar
  // chuyển từ dải cố định 240px cạnh nội dung sang drawer ẩn/hiện qua nút ☰.
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const closeSidebar = () => setSidebarOpen(false);

  return (
    <div className="app-shell">
      <UpdateBanner />
      <div className="mobile-topbar">
        <button type="button" className="mobile-menu-toggle" onClick={() => setSidebarOpen(true)} aria-label="Mở menu">☰</button>
        <div className="h-logo">H</div>
        <span className="mobile-topbar-title">HCRC · API</span>
      </div>
      {sidebarOpen && <div className="sidebar-backdrop" onClick={closeSidebar} />}
      <aside className={`sidebar${sidebarOpen ? ' open' : ''}`}>
        <div className="sidebar-brand">
          <div className="h-logo">H</div>
          <div className="sidebar-brand-text">
            <span className="sidebar-brand-name">HCRC · API</span>
            <span className="sidebar-brand-sub">Quản trị đối tác</span>
          </div>
        </div>
        <ul className="menu">
          {nav.map(item => (
            <li key={item.path}>
              <NavLink to={item.path} onClick={closeSidebar} className={({ isActive }) => (isActive ? 'active' : '')}>
                <span className="nav-icon">{item.icon}</span>
                {item.label}
              </NavLink>
            </li>
          ))}
        </ul>
        <div className="sidebar-footer">
          <div className="user-name">{me?.username} {isSystemRole && <span className="role-badge">hệ thống</span>}</div>
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
