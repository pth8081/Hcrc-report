// modules/system/permissions/PermissionsPage.jsx — Trang "Phân quyền" gồm 3
// tab (Người dùng, Vai trò, Ma trận) trên cùng 1 route — không tách route
// riêng vì cả ba luôn được dùng cùng nhau khi quản trị quyền.
// Tab "Ma trận" (bản 8.94, theo yêu cầu người dùng) — xem tổng quan quyền
// báo cáo/Dashboard dạng bảng lưới, BỔ SUNG thêm cách xem/sửa quyền, KHÔNG
// thay thế 2 tab cũ (PermissionMatrixPage.jsx).
import { useState } from 'react';
import UsersPage from './UsersPage';
import RolesPage from './RolesPage';
import PermissionMatrixPage from './PermissionMatrixPage';

export default function PermissionsPage() {
  const [tab, setTab] = useState('users');

  return (
    <div className={tab === 'matrix' ? 'page page--wide' : 'page'}>
      <h1>Phân quyền</h1>
      <div className="tabs">
        <button type="button" className={tab === 'users' ? 'active' : ''} onClick={() => setTab('users')}>Người dùng</button>
        <button type="button" className={tab === 'roles' ? 'active' : ''} onClick={() => setTab('roles')}>Vai trò</button>
        <button type="button" className={tab === 'matrix' ? 'active' : ''} onClick={() => setTab('matrix')}>Ma trận</button>
      </div>
      {tab === 'users' && <UsersPage />}
      {tab === 'roles' && <RolesPage />}
      {tab === 'matrix' && <PermissionMatrixPage />}
    </div>
  );
}
