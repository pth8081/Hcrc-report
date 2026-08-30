// components/Layout.jsx — Khung chung: sidebar (vẽ đúng theo me.menu, đã lọc
// quyền ở server) + vùng nội dung. Cây menu chỉ sâu 2 cấp (Hệ thống > 5 mục
// con) nên không cần dựng cây tổng quát nhiều cấp.
import { NavLink, Outlet } from 'react-router-dom';
import { useAuth } from '../lib/AuthContext';

export default function Layout() {
  const { me, logout } = useAuth();
  const menu = me?.menu || [];
  const rootItems = menu.filter(m => !m.parentId);
  const systemChildren = menu.filter(m => m.parentId);

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="sidebar-brand">HCRC</div>
        <ul className="menu">
          {rootItems.map(item => (
            <li key={item.code}>
              <NavLink to={item.path} end={item.code !== 'system'} className={({ isActive }) => (isActive ? 'active' : '')}>
                {item.label}
              </NavLink>
              {item.code === 'system' && systemChildren.length > 0 && (
                <ul className="submenu">
                  {systemChildren.map(child => (
                    <li key={child.code}>
                      <NavLink to={child.path} className={({ isActive }) => (isActive ? 'active' : '')}>
                        {child.label}
                      </NavLink>
                    </li>
                  ))}
                </ul>
              )}
            </li>
          ))}
        </ul>
        <div className="sidebar-footer">
          <div className="user-name">{me?.fullName}</div>
          <button type="button" onClick={logout}>Đăng xuất</button>
        </div>
      </aside>
      <main className="content">
        <Outlet />
      </main>
    </div>
  );
}
