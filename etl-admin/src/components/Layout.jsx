import { useState } from 'react';
import { NavLink, Outlet } from 'react-router-dom';
import { useAuth } from '../lib/AuthContext';
import UpdateBanner from './UpdateBanner';

// menuCode dùng để lọc nav theo quyền THẬT (xem etl/lib/adminPermissions.js)
// — diem-stk-mapping yêu cầu CanEdit ngay cả để XEM (ảnh hưởng trực tiếp số
// liệu báo cáo doanh thu/giao dịch, không có mức "chỉ xem" riêng — xem
// etl/routes/admin/diemStkMapping.js).
const NAV = [
  { path: '/dashboard', label: 'Dashboard', icon: '📊', menuCode: 'dashboard' },
  { path: '/data-sources', label: 'Nguồn dữ liệu', icon: '🔌', menuCode: 'data-sources' },
  { path: '/sync-jobs', label: 'Đồng bộ', icon: '🔄', menuCode: 'sync-jobs' },
  { path: '/log', label: 'Log', icon: '🧾', menuCode: 'log' },
  { path: '/audit-log', label: 'Nhật ký thao tác', icon: '📜', menuCode: 'audit-log' },
  // Trước là 1 mục "Nhập chỉ tiêu" chung — tách 2 mục ĐỘC LẬP theo đúng 2
  // báo cáo tiêu thụ chỉ tiêu (Lãnh đạo Tập đoàn / HCRC), mỗi báo cáo do 1
  // nhóm khác nhau quản lý/nhập liệu, cần MenuCode riêng để giao quyền
  // tách bạch (xem etl/routes/admin/roles.js MENU_CATALOG).
  { path: '/sales-targets-corp', label: 'Chỉ tiêu Lãnh đạo Tập đoàn', icon: '🎯', menuCode: 'sales-targets-corp' },
  { path: '/sales-targets-hcrc', label: 'Chỉ tiêu HCRC', icon: '🎯', menuCode: 'sales-targets-hcrc' },
  { path: '/diem-stk-mapping', label: 'Ánh xạ Điểm - STK_ID', icon: '🧩', menuCode: 'diem-stk-mapping', editOnly: true },
  { path: '/core-item-list', label: 'Danh sách hàng Core', icon: '📦', menuCode: 'core-item-list', editOnly: true },
  { path: '/users', label: 'Phân quyền', icon: '🔐', menuCode: 'users' },
  { path: '/roles', label: 'Vai trò', icon: '🛡️', menuCode: 'roles' },
  { path: '/huong-dan', label: 'Hướng dẫn', icon: '❓', menuCode: 'huong-dan' }
];

export default function Layout() {
  const { me, isSystemRole, can, canEdit, logout } = useAuth();
  const nav = NAV.filter(item => (item.editOnly ? canEdit(item.menuCode) : can(item.menuCode)));
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
        <span className="mobile-topbar-title">HCRC · ETL</span>
      </div>
      {sidebarOpen && <div className="sidebar-backdrop" onClick={closeSidebar} />}
      <aside className={`sidebar${sidebarOpen ? ' open' : ''}`}>
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
