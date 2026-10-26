import { useEffect, useState } from 'react';
import { NavLink, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '../lib/AuthContext';
import UpdateBanner from './UpdateBanner';

// menuCode dùng để lọc nav theo quyền THẬT (xem etl/lib/adminPermissions.js)
// — diem-stk-mapping yêu cầu CanEdit ngay cả để XEM (ảnh hưởng trực tiếp số
// liệu báo cáo doanh thu/giao dịch, không có mức "chỉ xem" riêng — xem
// etl/routes/admin/diemStkMapping.js).
//
// Bản 10.11 — gộp các mục "Chỉ tiêu ..." và các mục cấu hình ít dùng vào 2
// nhóm có thể đóng/mở (field `group`, xem GROUPS bên dưới) cho menu gọn lại
// — path/menuCode của từng mục GIỮ NGUYÊN, không đổi quyền/route/báo cáo.
const GROUPS = {
  target: { label: 'Chỉ tiêu', icon: '🎯' },
  config: { label: 'Cấu hình khác', icon: '⚙️' }
};

const NAV = [
  { path: '/dashboard', label: 'Dashboard', icon: '📊', menuCode: 'dashboard' },
  { path: '/data-sources', label: 'Nguồn dữ liệu', icon: '🔌', menuCode: 'data-sources' },
  { path: '/connection-status', label: 'Trạng thái kết nối', icon: '📶', menuCode: 'connection-status' },
  { path: '/log-space-status', label: 'Giám sát Log CSDL', icon: '📈', menuCode: 'log-space-status' },
  { path: '/sync-jobs', label: 'Đồng bộ', icon: '🔄', menuCode: 'sync-jobs' },
  { path: '/schema-monitor', label: 'Giám sát cấu trúc CSDL', icon: '🧬', menuCode: 'schema-monitor' },
  { path: '/log', label: 'Log', icon: '🧾', menuCode: 'log' },
  { path: '/audit-log', label: 'Nhật ký thao tác', icon: '📜', menuCode: 'audit-log' },
  // Trước là 1 mục "Nhập chỉ tiêu" chung — tách 2 mục ĐỘC LẬP theo đúng 2
  // báo cáo tiêu thụ chỉ tiêu (Lãnh đạo Tập đoàn / HCRC), mỗi báo cáo do 1
  // nhóm khác nhau quản lý/nhập liệu, cần MenuCode riêng để giao quyền
  // tách bạch (xem etl/routes/admin/roles.js MENU_CATALOG).
  { path: '/sales-targets-corp', label: 'Chỉ tiêu Lãnh đạo Tập đoàn', icon: '🎯', menuCode: 'sales-targets-corp', group: 'target' },
  { path: '/sales-targets-hcrc', label: 'Chỉ tiêu HCRC', icon: '🎯', menuCode: 'sales-targets-hcrc', group: 'target' },
  // Bản 10.11 — đổi tên nhãn hiển thị thành "...(HCRC)" cho rõ đây là chỉ
  // tiêu phục vụ báo cáo "Doanh thu theo ngành hàng" bản HCRC (phân biệt với
  // mục "...(LDTD)" ngay bên dưới) — path/menuCode GIỮ NGUYÊN, không đổi gì
  // khác.
  { path: '/sales-targets-nganhhang-dt', label: 'Chỉ tiêu Doanh thu theo ngành hàng (HCRC)', icon: '🎯', menuCode: 'sales-targets-nganhhang-dt', group: 'target' },
  { path: '/sales-targets-nganhhang-nh', label: 'Chỉ tiêu Nhập hàng theo ngành hàng', icon: '🎯', menuCode: 'sales-targets-nganhhang-nh', group: 'target' },
  { path: '/sales-targets-nganhhang-dt-ldtd', label: 'Chỉ tiêu Doanh thu theo ngành hàng (LDTD)', icon: '🎯', menuCode: 'sales-targets-nganhhang-dt-ldtd', group: 'target' },
  { path: '/diem-stk-mapping', label: 'Ánh xạ Điểm - STK_ID', icon: '🧩', menuCode: 'diem-stk-mapping', editOnly: true, group: 'config' },
  { path: '/nso-stores', label: 'Siêu thị NSO', icon: '🏬', menuCode: 'nso-stores', editOnly: true, group: 'config' },
  { path: '/core-item-list', label: 'Danh sách hàng Core', icon: '📦', menuCode: 'core-item-list', editOnly: true, group: 'config' },
  { path: '/stock-alert-thresholds', label: 'Cảnh báo hàng tồn', icon: '⚠️', menuCode: 'stock-alert-thresholds', editOnly: true, group: 'config' },
  { path: '/users', label: 'Phân quyền', icon: '🔐', menuCode: 'users' },
  { path: '/roles', label: 'Vai trò', icon: '🛡️', menuCode: 'roles' },
  // Chứng chỉ TLS (bản 8.71) — KHÔNG đi qua hệ thống RoleMenuAccess thông
  // thường (systemOnly, không có menuCode) — thao tác nắm private key của
  // hệ thống, không thể giao cho 1 tài khoản "quản lý thông thường" nào,
  // CHỈ tài khoản vai trò hệ thống thật mới thấy mục này.
  { path: '/tls-certificate', label: 'Chứng chỉ TLS', icon: '🔒', systemOnly: true },
  { path: '/huong-dan', label: 'Hướng dẫn', icon: '❓', menuCode: 'huong-dan' }
];

export default function Layout() {
  const { me, isSystemRole, can, canEdit, logout } = useAuth();
  const nav = NAV.filter(item => (item.systemOnly ? isSystemRole : (item.editOnly ? canEdit(item.menuCode) : can(item.menuCode))));
  // Bản 10.11 — gộp các mục liên tiếp cùng `group` thành 1 "entry" nhóm có
  // thể đóng/mở, giữ nguyên thứ tự + lọc quyền ở trên (nếu 1 nhóm bị lọc hết
  // thì không render gì, không có nhóm rỗng).
  const navEntries = [];
  for (const item of nav) {
    if (item.group) {
      const last = navEntries[navEntries.length - 1];
      if (last && last.type === 'group' && last.group === item.group) {
        last.items.push(item);
      } else {
        navEntries.push({ type: 'group', group: item.group, items: [item] });
      }
    } else {
      navEntries.push({ type: 'item', item });
    }
  }
  const location = useLocation();
  // Mặc định đóng cả 2 nhóm (menu gọn) — tự mở nhóm chứa trang đang xem khi
  // vào thẳng URL đó (vd mở link/bookmark), không tự đóng lại khi điều
  // hướng sang trang khác (người dùng tự bấm đóng nếu muốn).
  const [openGroups, setOpenGroups] = useState(() => {
    const activeItem = NAV.find(item => item.path === location.pathname);
    return activeItem?.group ? new Set([activeItem.group]) : new Set();
  });
  useEffect(() => {
    const activeItem = NAV.find(item => item.path === location.pathname);
    if (activeItem?.group) {
      setOpenGroups(prev => (prev.has(activeItem.group) ? prev : new Set(prev).add(activeItem.group)));
    }
  }, [location.pathname]);
  function toggleGroup(key) {
    setOpenGroups(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  }
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
          {navEntries.map(entry => {
            if (entry.type === 'item') {
              const item = entry.item;
              return (
                <li key={item.path}>
                  <NavLink to={item.path} onClick={closeSidebar} className={({ isActive }) => (isActive ? 'active' : '')}>
                    <span className="nav-icon">{item.icon}</span>
                    {item.label}
                  </NavLink>
                </li>
              );
            }
            const meta = GROUPS[entry.group];
            const isOpen = openGroups.has(entry.group);
            return (
              <li key={`group-${entry.group}`} className={`menu-group${isOpen ? ' open' : ''}`}>
                <button type="button" className="menu-group-toggle" onClick={() => toggleGroup(entry.group)}>
                  <span><span className="nav-icon">{meta.icon}</span>{meta.label}</span>
                  <span className="chev">▶</span>
                </button>
                <ul className="menu-group-items">
                  {entry.items.map(item => (
                    <li key={item.path}>
                      <NavLink to={item.path} onClick={closeSidebar} className={({ isActive }) => (isActive ? 'active' : '')}>
                        <span className="nav-icon">{item.icon}</span>
                        {item.label}
                      </NavLink>
                    </li>
                  ))}
                </ul>
              </li>
            );
          })}
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
