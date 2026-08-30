// pages/UsersPage.jsx — Trang "Phân quyền": CRUD admin.AdminUsers. Chỉ 2 vai
// trò (admin/viewer) — không có cây menu như frontend/ chính, quy mô trang
// quản trị ETL không cần tới mức đó.
import { useEffect, useState } from 'react';
import { api } from '../lib/api';
import { useAuth } from '../lib/AuthContext';
import DataTable from '../components/DataTable';

const EMPTY_FORM = { username: '', password: '', fullName: '', role: 'viewer' };

export default function UsersPage() {
  const { isAdmin } = useAuth();
  const [users, setUsers] = useState([]);
  const [form, setForm] = useState(EMPTY_FORM);
  const [error, setError] = useState('');

  function reload() {
    api.get('/users').then(setUsers).catch(err => setError(err.message));
  }
  useEffect(reload, []);

  async function createUser(e) {
    e.preventDefault();
    setError('');
    try {
      await api.post('/users', form);
      setForm(EMPTY_FORM);
      reload();
    } catch (err) { setError(err.message); }
  }

  async function toggleActive(user) {
    try {
      await api.put(`/users/${user.Id}`, { fullName: user.FullName, role: user.Role, isActive: !user.IsActive });
      reload();
    } catch (err) { setError(err.message); }
  }

  async function resetPassword(user) {
    const password = prompt(`Mật khẩu mới cho "${user.Username}":`);
    if (!password) return;
    try {
      await api.post(`/users/${user.Id}/reset-password`, { password });
      alert('Đã đặt lại mật khẩu.');
    } catch (err) { setError(err.message); }
  }

  return (
    <div className="page">
      <h1>Phân quyền</h1>
      {error && <p className="form-error">{error}</p>}

      {isAdmin && (
        <form className="inline-form" onSubmit={createUser}>
          <input placeholder="Username" value={form.username} onChange={(e) => setForm({ ...form, username: e.target.value })} required />
          <input placeholder="Mật khẩu" type="password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} required />
          <input placeholder="Họ tên" value={form.fullName} onChange={(e) => setForm({ ...form, fullName: e.target.value })} required />
          <select value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })}>
            <option value="viewer">viewer</option>
            <option value="admin">admin</option>
          </select>
          <button type="submit">Thêm người dùng</button>
        </form>
      )}

      <DataTable
        columns={[
          { key: 'Username', label: 'Username' },
          { key: 'FullName', label: 'Họ tên' },
          { key: 'Role', label: 'Vai trò' },
          { key: 'IsActive', label: 'Trạng thái', render: (u) => (u.IsActive ? 'Hoạt động' : 'Đã khoá') },
          isAdmin && {
            key: 'actions', label: '', render: (u) => (
              <>
                <button type="button" onClick={() => toggleActive(u)}>{u.IsActive ? 'Khoá' : 'Mở khoá'}</button>{' '}
                <button type="button" onClick={() => resetPassword(u)}>Đặt lại mật khẩu</button>
              </>
            )
          }
        ].filter(Boolean)}
        rows={users}
      />
    </div>
  );
}
