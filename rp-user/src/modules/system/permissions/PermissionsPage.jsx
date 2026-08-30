// modules/system/permissions/PermissionsPage.jsx — Trang "Phân quyền" gồm 2
// tab (Người dùng, Vai trò) trên cùng 1 route — không tách route riêng vì cả
// hai luôn được dùng cùng nhau khi quản trị quyền.
import { useState } from 'react';
import UsersPage from './UsersPage';
import RolesPage from './RolesPage';

export default function PermissionsPage() {
  const [tab, setTab] = useState('users');

  return (
    <div className="page">
      <h1>Phân quyền</h1>
      <div className="tabs">
        <button type="button" className={tab === 'users' ? 'active' : ''} onClick={() => setTab('users')}>Người dùng</button>
        <button type="button" className={tab === 'roles' ? 'active' : ''} onClick={() => setTab('roles')}>Vai trò</button>
      </div>
      {tab === 'users' ? <UsersPage /> : <RolesPage />}
    </div>
  );
}
