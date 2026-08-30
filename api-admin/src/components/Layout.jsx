// components/Layout.jsx — Điều hướng cố định 4 trang — không cần đọc từ
// server như rp-user/ chính (không có cây menu/quyền cho quy mô nhỏ này,
// xem tài liệu kiến trúc, mục 03). Ẩn/hiện theo vai trò chỉ áp dụng ở TỪNG
// trang (vd nút thêm/sửa/xoá đối tác), không áp dụng ở cấp điều hướng.
import { NavLink, Outlet } from 'react-router-dom';
import { useAuth } from '../lib/AuthContext';

const NAV = [
  { path: '/consumers', label: 'Đối tác' },
  { path: '/data-sources', label: 'Nguồn dữ liệu' },
  { path: '/live', label: 'Kết nối hiện tại' },
  { path: '/history', label: 'Lịch sử' },
  { path: '/stats', label: 'Top truy vấn' }
];

export default function Layout() {
  const { me, isAdmin, logout } = useAuth();

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="sidebar-brand">HCRC · API</div>
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
