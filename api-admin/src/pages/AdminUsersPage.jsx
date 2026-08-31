// pages/AdminUsersPage.jsx — Danh sách tài khoản quản trị api-admin/ + "Đặt
// lại 2FA" cho admin khác bị mất thiết bị (xem routes/admin/users.js — CHỈ
// mới có 2 việc này, KHÔNG có tạo/sửa/xoá tài khoản: vẫn qua
// scripts/seedAdmin.js như trước, quy mô nhỏ không cần CRUD đầy đủ).
import { useEffect, useState } from 'react';
import { api } from '../lib/api';
import DataTable from '../components/DataTable';

export default function AdminUsersPage() {
  const [users, setUsers] = useState([]);
  const [error, setError] = useState('');

  function reload() {
    api.get('/users').then(setUsers).catch(err => setError(err.message));
  }
  useEffect(reload, []);

  async function reset2fa(user) {
    if (!confirm(`Đặt lại 2FA cho "${user.Username}"? Lần đăng nhập kế tiếp của họ sẽ phải đăng ký 2FA lại từ đầu.`)) return;
    try {
      await api.post(`/users/${user.Id}/reset-2fa`, {});
      alert('Đã đặt lại 2FA.');
      reload();
    } catch (err) { setError(err.message); }
  }

  return (
    <div className="page">
      <h1>Tài khoản quản trị</h1>
      <p className="muted">Tạo/sửa tài khoản qua <code>scripts/seedAdmin.js</code> (DBA chạy tay) — trang này chỉ xem danh sách và hỗ trợ đặt lại 2FA cho nhau.</p>
      {error && <p className="form-error">{error}</p>}
      <DataTable
        columns={[
          { key: 'Username', label: 'Username' },
          { key: 'FullName', label: 'Họ tên' },
          { key: 'Role', label: 'Vai trò' },
          { key: 'IsActive', label: 'Trạng thái', render: (u) => (u.IsActive ? 'Hoạt động' : 'Đã khoá') },
          { key: 'TwoFactorEnabled', label: '2FA', render: (u) => (u.Role !== 'admin' ? '—' : (u.TwoFactorEnabled ? 'Đã bật' : 'Chưa bật')) },
          {
            key: 'actions', label: '', render: (u) => (
              u.Role === 'admin' && <button type="button" onClick={() => reset2fa(u)}>Đặt lại 2FA</button>
            )
          }
        ]}
        rows={users}
      />
    </div>
  );
}
