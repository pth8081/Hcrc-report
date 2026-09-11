// pages/UsersPage.jsx — Trang "Phân quyền": CRUD admin.AdminUsers + gán
// nhóm quyền (admin.AdminUserRoles, xem pages/RolesPage.jsx) — thay dropdown
// Role cố định cũ (admin/viewer/target_importer). canEdit('users') cho thao
// tác tài khoản THÔNG THƯỜNG (tạo/sửa/khoá/đặt lại mật khẩu); gán vai trò +
// đặt lại 2FA CHẶT hơn — chỉ isSystemRole thật mới thấy nút (server cũng
// chặn qua requireSystemRoleActor, xem etl/routes/admin/users.js).
import { useEffect, useState } from 'react';
import { api } from '../lib/api';
import { useAuth } from '../lib/AuthContext';
import DataTable from '../components/DataTable';

const EMPTY_FORM = { username: '', password: '', fullName: '' };

export default function UsersPage() {
  const { isSystemRole, canEdit } = useAuth();
  const canManage = canEdit('users');
  const [users, setUsers] = useState([]);
  const [roles, setRoles] = useState([]);
  const [form, setForm] = useState(EMPTY_FORM);
  const [error, setError] = useState('');
  const [editingUser, setEditingUser] = useState(null);
  const [editForm, setEditForm] = useState({ fullName: '', isActive: true });
  const [assigningUser, setAssigningUser] = useState(null);
  const [selectedRoleIds, setSelectedRoleIds] = useState([]);

  function reload() {
    api.get('/users').then(setUsers).catch(err => setError(err.message));
    api.get('/roles').then(setRoles).catch(err => setError(err.message));
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

  function openEdit(user) {
    setEditingUser(user);
    setEditForm({ fullName: user.FullName, isActive: !!user.IsActive });
  }

  async function saveEdit() {
    try {
      await api.put(`/users/${editingUser.Id}`, editForm);
      setEditingUser(null);
      reload();
    } catch (err) { setError(err.message); }
  }

  function openAssignRoles(user) {
    setAssigningUser(user);
    setSelectedRoleIds((user.roles || []).map(r => r.id));
  }

  async function saveRoles() {
    try {
      await api.put(`/users/${assigningUser.Id}/roles`, { roleIds: selectedRoleIds });
      setAssigningUser(null);
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

      {canManage && (
        <form className="inline-form" onSubmit={createUser}>
          <input placeholder="Username" value={form.username} onChange={(e) => setForm({ ...form, username: e.target.value })} required />
          <input placeholder="Mật khẩu" type="password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} required />
          <input placeholder="Họ tên" value={form.fullName} onChange={(e) => setForm({ ...form, fullName: e.target.value })} required />
          <button type="submit">Thêm người dùng</button>
        </form>
      )}
      {canManage && <p className="form-hint">Tài khoản mới chưa thấy trang nào — vào "Vai trò" hoặc bấm "Gán vai trò" bên dưới để cấp quyền.</p>}

      <DataTable
        columns={[
          { key: 'Username', label: 'Username' },
          { key: 'FullName', label: 'Họ tên' },
          { key: 'roles', label: 'Vai trò', render: (u) => (u.roles?.length ? u.roles.map(r => r.name).join(', ') : '—') },
          { key: 'IsActive', label: 'Trạng thái', render: (u) => (u.IsActive ? 'Hoạt động' : 'Đã khoá') },
          { key: 'TwoFactorEnabled', label: '2FA', render: (u) => (u.roles?.some(r => r.isSystemRole) ? (u.TwoFactorEnabled ? 'Đã bật' : 'Chưa bật') : '—') },
          (canManage || isSystemRole) && {
            key: 'actions', label: '', render: (u) => (
              <>
                {canManage && <button type="button" onClick={() => openEdit(u)}>Sửa</button>}{' '}
                {isSystemRole && <button type="button" onClick={() => openAssignRoles(u)}>Gán vai trò</button>}{' '}
                {isSystemRole && <button type="button" onClick={() => resetPassword(u)}>Đặt lại mật khẩu</button>}{' '}
                {isSystemRole && u.roles?.some(r => r.isSystemRole) && <button type="button" onClick={() => reset2fa(u)}>Đặt lại 2FA</button>}
              </>
            )
          }
        ].filter(Boolean)}
        rows={users}
      />

      {editingUser && (
        <div className="modal">
          <div className="modal-body">
            <h3>Sửa tài khoản — {editingUser.Username}</h3>
            <label>Họ tên</label>
            <input value={editForm.fullName} onChange={(e) => setEditForm({ ...editForm, fullName: e.target.value })} />
            <label className="checkbox-row">
              <input type="checkbox" checked={editForm.isActive} onChange={(e) => setEditForm({ ...editForm, isActive: e.target.checked })} />
              Hoạt động (bỏ chọn = khoá tài khoản, thu hồi phiên đăng nhập ngay)
            </label>
            <div className="modal-actions">
              <button type="button" onClick={saveEdit}>Lưu</button>
              <button type="button" onClick={() => setEditingUser(null)}>Đóng</button>
            </div>
          </div>
        </div>
      )}

      {assigningUser && (
        <div className="modal">
          <div className="modal-body">
            <h3>Gán vai trò — {assigningUser.Username}</h3>
            {roles.map(r => (
              <label key={r.Id} className="checkbox-row">
                <input
                  type="checkbox"
                  checked={selectedRoleIds.includes(r.Id)}
                  onChange={(e) => setSelectedRoleIds(e.target.checked
                    ? [...selectedRoleIds, r.Id]
                    : selectedRoleIds.filter(id => id !== r.Id))}
                />
                {r.Name}{r.IsSystemRole ? ' (hệ thống)' : ''}
              </label>
            ))}
            <div className="modal-actions">
              <button type="button" onClick={saveRoles}>Lưu</button>
              <button type="button" onClick={() => setAssigningUser(null)}>Đóng</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
