// pages/RolesPage.jsx — Trang "Vai trò": CRUD admin.Roles + gán quyền menu
// (kèm cờ CanEdit — xem api-server/routes/admin/roles.js). Vai trò hệ thống
// (admin) không sửa/xoá được — server đã chặn, ở đây chỉ ẩn nút cho gọn.
// Đơn giản hơn RolesPage.jsx bên rp-user (chỉ 1 lớp quyền menu, không có
// report/domain access).
import { useEffect, useState } from 'react';
import { api } from '../lib/api';
import { useAuth } from '../lib/AuthContext';
import DataTable from '../components/DataTable';

export default function RolesPage() {
  const { isSystemRole, canEdit } = useAuth();
  const canEditRoles = canEdit('roles');
  const [roles, setRoles] = useState([]);
  const [menuCatalog, setMenuCatalog] = useState([]);
  const [error, setError] = useState('');
  const [form, setForm] = useState({ code: '', name: '' });
  const [editingAccessFor, setEditingAccessFor] = useState(null);
  const [access, setAccess] = useState({}); // { [menuCode]: { checked, canEdit } }

  function reload() {
    api.get('/roles').then(setRoles).catch(err => setError(err.message));
    api.get('/roles/menu-catalog').then(setMenuCatalog).catch(err => setError(err.message));
  }
  useEffect(reload, []);

  async function createRole(e) {
    e.preventDefault();
    setError('');
    try {
      await api.post('/roles', form);
      setForm({ code: '', name: '' });
      reload();
    } catch (err) { setError(err.message); }
  }

  async function deleteRole(role) {
    if (!confirm(`Xoá vai trò "${role.Name}"?`)) return;
    try {
      await api.del(`/roles/${role.Id}`);
      reload();
    } catch (err) { setError(err.message); }
  }

  async function openAccessEditor(role) {
    setEditingAccessFor(role);
    const { menuAccess } = await api.get(`/roles/${role.Id}/access`);
    const byCode = new Map(menuAccess.map(m => [m.menuCode, m.canEdit]));
    const next = {};
    for (const m of menuCatalog) next[m.code] = { checked: byCode.has(m.code), canEdit: byCode.get(m.code) || false };
    setAccess(next);
  }

  function setChecked(code, checked) {
    setAccess({ ...access, [code]: { ...access[code], checked, canEdit: checked ? access[code]?.canEdit : false } });
  }
  function setCanEdit(code, canEdit) {
    setAccess({ ...access, [code]: { ...access[code], canEdit, checked: canEdit ? true : access[code]?.checked } });
  }

  async function saveAccess() {
    try {
      const menuAccess = Object.entries(access).filter(([, v]) => v.checked).map(([menuCode, v]) => ({ menuCode, canEdit: v.canEdit }));
      await api.put(`/roles/${editingAccessFor.Id}/menu-access`, { menuAccess });
      setEditingAccessFor(null);
    } catch (err) { setError(err.message); }
  }

  return (
    <div className="page">
      <h1>Vai trò</h1>
      {error && <p className="form-error">{error}</p>}

      {canEditRoles && (
        <form className="inline-form" onSubmit={createRole}>
          <input placeholder="Mã (vd nhan-vien-doi-tac)" value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} required />
          <input placeholder="Tên vai trò" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
          <button type="submit">Thêm vai trò</button>
        </form>
      )}

      <DataTable
        columns={[
          { key: 'Name', label: 'Tên' },
          { key: 'Code', label: 'Mã' },
          { key: 'IsSystemRole', label: 'Loại', render: (r) => (r.IsSystemRole ? 'Hệ thống' : 'Tuỳ chỉnh') },
          {
            key: 'actions', label: '', render: (r) => r.IsSystemRole ? '—' : (
              <>
                <button type="button" onClick={() => openAccessEditor(r)}>Gán quyền</button>{' '}
                {canEditRoles && <button type="button" onClick={() => deleteRole(r)}>Xoá</button>}
              </>
            )
          }
        ]}
        rows={roles}
      />

      {editingAccessFor && (
        <div className="modal">
          <div className="modal-body">
            <h3>Gán quyền — {editingAccessFor.Name}</h3>
            <table className="access-table">
              <thead><tr><th>Trang</th><th>Xem</th><th>Sửa/Xoá</th></tr></thead>
              <tbody>
                {menuCatalog.map(m => (
                  <tr key={m.code}>
                    <td>{m.label}</td>
                    <td><input type="checkbox" checked={!!access[m.code]?.checked} onChange={(e) => setChecked(m.code, e.target.checked)} /></td>
                    <td><input type="checkbox" checked={!!access[m.code]?.canEdit} onChange={(e) => setCanEdit(m.code, e.target.checked)} /></td>
                  </tr>
                ))}
              </tbody>
            </table>

            {/* Sửa quyền menu của 1 vai trò chỉ Admin hệ thống thật mới làm được
                (server đã chặn — xem lib/adminPermissions.js requireSystemRoleActor,
                tránh 1 người chỉ có menu "Vai trò" tự cấp quyền hệ thống cho mình) —
                người xem thường vẫn xem được quyền hiện có, chỉ ẩn nút Lưu. */}
            <div className="modal-actions">
              {isSystemRole
                ? <button type="button" onClick={saveAccess}>Lưu</button>
                : <span className="hint">Chỉ Admin hệ thống mới sửa được quyền này.</span>}
              <button type="button" onClick={() => setEditingAccessFor(null)}>Đóng</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
