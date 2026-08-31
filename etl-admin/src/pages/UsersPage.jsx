// pages/UsersPage.jsx — Trang "Phân quyền": CRUD admin.AdminUsers. 3 vai trò
// (admin/viewer/target_importer — vai trò hẹp, chỉ vào được trang "Nhập chỉ
// tiêu", xem lib/AuthContext.jsx) — không có cây menu như rp-user/ chính,
// quy mô trang quản trị ETL không cần tới mức đó.
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

  // Giúp admin khác bị mất thiết bị/cần khôi phục — 2FA vẫn BẮT BUỘC, chỉ
  // xoá đăng ký cũ, lần đăng nhập kế tiếp của họ bị bắt đăng ký lại từ đầu
  // (xem etl/routes/admin/users.js).
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
      <h1>Phân quyền</h1>
      {error && <p className="form-error">{error}</p>}

      {isAdmin && (
        <form className="inline-form" onSubmit={createUser}>
          <input placeholder="Username" value={form.username} onChange={(e) => setForm({ ...form, username: e.target.value })} required />
          <input placeholder="Mật khẩu" type="password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} required />
          <input placeholder="Họ tên" value={form.fullName} onChange={(e) => setForm({ ...form, fullName: e.target.value })} required />
          <select value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })}>
            <option value="viewer">viewer</option>
            <option value="target_importer">target_importer (chỉ Nhập chỉ tiêu)</option>
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
          { key: 'TwoFactorEnabled', label: '2FA', render: (u) => (u.Role !== 'admin' ? '—' : (u.TwoFactorEnabled ? 'Đã bật' : 'Chưa bật')) },
          isAdmin && {
            key: 'actions', label: '', render: (u) => (
              <>
                <button type="button" onClick={() => toggleActive(u)}>{u.IsActive ? 'Khoá' : 'Mở khoá'}</button>{' '}
                <button type="button" onClick={() => resetPassword(u)}>Đặt lại mật khẩu</button>{' '}
                {u.Role === 'admin' && <button type="button" onClick={() => reset2fa(u)}>Đặt lại 2FA</button>}
              </>
            )
          }
        ].filter(Boolean)}
        rows={users}
      />
    </div>
  );
}
