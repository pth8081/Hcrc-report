// modules/system/permissions/UsersPage.jsx — Danh sách người dùng: tạo mới,
// khoá/mở, đặt lại mật khẩu, gán vai trò. Không có nút xoá (xem
// rp-server/routes/users.js — lý do: giữ dấu vết AuditLog).
import { useEffect, useState } from 'react';
import { api } from '../../../lib/api';
import { useAuth } from '../../../lib/AuthContext';
import DataTable from '../../../components/DataTable';

export default function UsersPage() {
  const { me } = useAuth();
  const [users, setUsers] = useState([]);
  const [roles, setRoles] = useState([]);
  const [error, setError] = useState('');
  const [form, setForm] = useState({ username: '', password: '', fullName: '', email: '' });
  const [editingRolesFor, setEditingRolesFor] = useState(null);
  const [selectedRoleIds, setSelectedRoleIds] = useState([]);
  const [editingAuthFor, setEditingAuthFor] = useState(null);
  const [authForm, setAuthForm] = useState({ authSource: 'local', password: '' });
  const [syncing, setSyncing] = useState(false);

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
      await api.put(`/system/users/${user.Id}`, {
        fullName: user.FullName, email: user.Email, phone: user.Phone, department: user.Department, position: user.Position,
        isActive: !user.IsActive
      });
      reload();
    } catch (err) { setError(err.message); }
  }

  // account tạo qua "Đồng bộ tài khoản" mặc định IsActive=0 (chưa cho phép
  // kết nối) — nút "Mở khoá" ở đây chính là "cho phép kết nối" người dùng
  // muốn (xem rp-server/routes/users.js).
  function openAuthEditor(user) {
    setEditingAuthFor(user);
    setAuthForm({ authSource: user.AuthSource, password: '' });
  }

  async function saveAuthSource() {
    try {
      await api.put(`/system/users/${editingAuthFor.Id}/auth-source`, authForm);
      setEditingAuthFor(null);
      reload();
    } catch (err) { setError(err.message); }
  }

  // "Đồng bộ tài khoản" — bấm tay, gọi API HCRC Workspace lấy danh bạ (xem
  // trang "Xác thực HCRC Workspace" để cấu hình trước). Tài khoản mới luôn
  // IsActive=0 — vẫn phải bấm "Mở khoá" tay từng người mới cho kết nối được.
  async function syncAccounts() {
    setSyncing(true);
    setError('');
    try {
      const result = await api.post('/system/users/sync', {});
      let msg = `Đồng bộ xong: thêm ${result.added}, cập nhật ${result.updated}, tự khoá ${result.autoLocked.length}.`;
      if (result.skipped?.length) msg += ` Bỏ qua ${result.skipped.length} (trùng username) — xem log.`;
      alert(msg);
      reload();
    } catch (err) { setError(err.message); } finally { setSyncing(false); }
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

  // Giúp Admin khác bị mất thiết bị/cần khôi phục — 2FA vẫn BẮT BUỘC, chỉ
  // xoá đăng ký cũ, lần đăng nhập kế tiếp của họ bị bắt đăng ký lại từ đầu
  // (xem rp-server/routes/users.js). Chỉ Admin hệ thống mới làm được — server
  // đã chặn, ẩn nút ở đây cho gọn nếu người xem không phải Admin.
  async function reset2fa(user) {
    if (!confirm(`Đặt lại 2FA cho "${user.Username}"? Lần đăng nhập kế tiếp của họ sẽ phải đăng ký 2FA lại từ đầu.`)) return;
    try {
      await api.post(`/system/users/${user.Id}/reset-2fa`, {});
      alert('Đã đặt lại 2FA.');
      reload();
    } catch (err) { setError(err.message); }
  }

  return (
    <div className="page">
      <h2>Người dùng</h2>
      {error && <p className="form-error">{error}</p>}

      <div className="inline-form">
        <button type="button" onClick={syncAccounts} disabled={syncing}>{syncing ? 'Đang đồng bộ...' : 'Đồng bộ tài khoản (HCRC Workspace)'}</button>
      </div>

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
          { key: 'Department', label: 'Phòng ban', render: (u) => u.Department || '—' },
          { key: 'Position', label: 'Vị trí', render: (u) => u.Position || '—' },
          { key: 'Phone', label: 'Điện thoại', render: (u) => u.Phone || '—' },
          { key: 'Email', label: 'Email', render: (u) => u.Email || '—' },
          { key: 'AuthSource', label: 'Nguồn xác thực', render: (u) => (u.AuthSource === 'local' ? 'Local' : 'HCRC Workspace') },
          { key: 'roles', label: 'Vai trò', render: (u) => u.roles.map(r => r.name).join(', ') || '—' },
          { key: 'IsActive', label: 'Trạng thái', render: (u) => (u.IsActive ? 'Hoạt động' : 'Chưa cho phép kết nối / đã khoá') },
          { key: 'TwoFactorEnabled', label: '2FA', render: (u) => (!u.roles.some(r => r.isSystemRole) ? '—' : (u.TwoFactorEnabled ? 'Đã bật' : 'Chưa bật')) },
          {
            key: 'actions', label: '', render: (u) => (
              <>
                <button type="button" onClick={() => toggleActive(u)}>{u.IsActive ? 'Khoá' : 'Cho phép kết nối'}</button>{' '}
                <button type="button" onClick={() => openRoleEditor(u)}>Gán vai trò</button>{' '}
                {me?.isSystemRole && !u.roles.some(r => r.isSystemRole) && <button type="button" onClick={() => openAuthEditor(u)}>Nguồn xác thực</button>}{' '}
                {me?.isSystemRole && u.roles.some(r => r.isSystemRole) && <button type="button" onClick={() => reset2fa(u)}>Đặt lại 2FA</button>}
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

      {editingAuthFor && (
        <div className="modal">
          <div className="modal-body">
            <h3>Nguồn xác thực — {editingAuthFor.Username}</h3>
            <label className="checkbox-row">
              <input type="radio" name="authSource" checked={authForm.authSource === 'local'}
                onChange={() => setAuthForm({ ...authForm, authSource: 'local' })} />
              Local (mật khẩu quản lý ở report server)
            </label>
            <label className="checkbox-row">
              <input type="radio" name="authSource" checked={authForm.authSource === 'hcrcWorkspace'}
                onChange={() => setAuthForm({ ...authForm, authSource: 'hcrcWorkspace' })} />
              HCRC Workspace (mật khẩu quản lý bên hệ thống HCRC Workspace)
            </label>
            {authForm.authSource === 'local' && (
              <input placeholder="Mật khẩu (bỏ trống nếu tài khoản đã có mật khẩu local)" type="password"
                value={authForm.password} onChange={(e) => setAuthForm({ ...authForm, password: e.target.value })} />
            )}
            <div className="modal-actions">
              <button type="button" onClick={saveAuthSource}>Lưu</button>
              <button type="button" onClick={() => setEditingAuthFor(null)}>Huỷ</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
