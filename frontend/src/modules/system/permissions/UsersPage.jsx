// modules/system/permissions/UsersPage.jsx — Danh sách người dùng: tạo mới,
// khoá/mở, đặt lại mật khẩu, gán vai trò. Không có nút xoá (xem
// report-server/routes/users.js — lý do: giữ dấu vết AuditLog).
import { useEffect, useState } from 'react';
import { api } from '../../../lib/api';
import DataTable from '../../../components/DataTable';

export default function UsersPage() {
  const [users, setUsers] = useState([]);
  const [roles, setRoles] = useState([]);
  const [error, setError] = useState('');
  const [form, setForm] = useState({ username: '', password: '', fullName: '', email: '' });
  const [editingRolesFor, setEditingRolesFor] = useState(null);
  const [selectedRoleIds, setSelectedRoleIds] = useState([]);

  function reload() {
    api.get('/system/users').then(setUsers).catch(err => setError(err.message));
    api.get('/system/roles').then(setRoles).catch(err => setError(err.message));
  }
  useEffect(reload, []);

  async function createUser(e) {
    e.preventDefault();
    setError('');
    try {
      await api.post('/system/users', form);
      setForm({ username: '', password: '', fullName: '', email: '' });
      reload();
    } catch (err) { setError(err.message); }
  }

  async function toggleActive(user) {
    try {
      await api.put(`/system/users/${user.Id}`, { fullName: user.FullName, email: user.Email, isActive: !user.IsActive });
      reload();
    } catch (err) { setError(err.message); }
  }

  function openRoleEditor(user) {
    setEditingRolesFor(user);
    setSelectedRoleIds(user.roles.map(r => r.id));
  }

  async function saveRoles() {
    try {
      await api.put(`/system/users/${editingRolesFor.Id}/roles`, { roleIds: selectedRoleIds });
      setEditingRolesFor(null);
      reload();
    } catch (err) { setError(err.message); }
  }

  return (
    <div className="page">
      <h2>Người dùng</h2>
      {error && <p className="form-error">{error}</p>}

      <form className="inline-form" onSubmit={createUser}>
        <input placeholder="Username" value={form.username} onChange={(e) => setForm({ ...form, username: e.target.value })} required />
        <input placeholder="Mật khẩu" type="password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} required />
        <input placeholder="Họ tên" value={form.fullName} onChange={(e) => setForm({ ...form, fullName: e.target.value })} required />
        <input placeholder="Email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
        <button type="submit">Thêm người dùng</button>
      </form>

      <DataTable
        columns={[
          { key: 'Username', label: 'Username' },
          { key: 'FullName', label: 'Họ tên' },
          { key: 'roles', label: 'Vai trò', render: (u) => u.roles.map(r => r.name).join(', ') || '—' },
          { key: 'IsActive', label: 'Trạng thái', render: (u) => (u.IsActive ? 'Hoạt động' : 'Đã khoá') },
          {
            key: 'actions', label: '', render: (u) => (
              <>
                <button type="button" onClick={() => toggleActive(u)}>{u.IsActive ? 'Khoá' : 'Mở khoá'}</button>{' '}
                <button type="button" onClick={() => openRoleEditor(u)}>Gán vai trò</button>
              </>
            )
          }
        ]}
        rows={users}
      />

      {editingRolesFor && (
        <div className="modal">
          <div className="modal-body">
            <h3>Gán vai trò — {editingRolesFor.Username}</h3>
            {roles.map(r => (
              <label key={r.Id} className="checkbox-row">
                <input
                  type="checkbox"
                  checked={selectedRoleIds.includes(r.Id)}
                  onChange={(e) => setSelectedRoleIds(e.target.checked
                    ? [...selectedRoleIds, r.Id]
                    : selectedRoleIds.filter(id => id !== r.Id))}
                />
                {r.Name}
              </label>
            ))}
            <div className="modal-actions">
              <button type="button" onClick={saveRoles}>Lưu</button>
              <button type="button" onClick={() => setEditingRolesFor(null)}>Huỷ</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
