// modules/system/permissions/RolesPage.jsx — CRUD vai trò + gán 2 lớp quyền
// (menu, báo cáo). Vai trò hệ thống (Admin) không sửa/xoá được — server đã
// chặn, ở đây chỉ ẩn nút cho gọn.
import { useEffect, useState } from 'react';
import { api } from '../../../lib/api';
import { useAuth } from '../../../lib/AuthContext';
import DataTable from '../../../components/DataTable';

export default function RolesPage() {
  const { me } = useAuth();
  const [roles, setRoles] = useState([]);
  const [menuItems, setMenuItems] = useState([]);
  const [reportCatalog, setReportCatalog] = useState([]);
  const [error, setError] = useState('');
  const [form, setForm] = useState({ code: '', name: '' });
  const [editingAccessFor, setEditingAccessFor] = useState(null);
  const [selectedMenuIds, setSelectedMenuIds] = useState([]);
  const [selectedReportIds, setSelectedReportIds] = useState([]);

  function reload() {
    api.get('/system/roles').then(setRoles).catch(err => setError(err.message));
    api.get('/system/menu-items').then(setMenuItems).catch(err => setError(err.message));
    api.get('/system/report-catalog').then(setReportCatalog).catch(err => setError(err.message));
  }
  useEffect(reload, []);

  async function createRole(e) {
    e.preventDefault();
    setError('');
    try {
      await api.post('/system/roles', form);
      setForm({ code: '', name: '' });
      reload();
    } catch (err) { setError(err.message); }
  }

  async function deleteRole(role) {
    if (!confirm(`Xoá vai trò "${role.Name}"?`)) return;
    try {
      await api.del(`/system/roles/${role.Id}`);
      reload();
    } catch (err) { setError(err.message); }
  }

  async function openAccessEditor(role) {
    setEditingAccessFor(role);
    const access = await api.get(`/system/roles/${role.Id}/access`);
    setSelectedMenuIds(access.menuItemIds);
    setSelectedReportIds(access.reportIds);
  }

  async function saveAccess() {
    try {
      await api.put(`/system/roles/${editingAccessFor.Id}/menu-access`, { menuItemIds: selectedMenuIds });
      await api.put(`/system/roles/${editingAccessFor.Id}/report-access`, { reportIds: selectedReportIds });
      setEditingAccessFor(null);
    } catch (err) { setError(err.message); }
  }

  return (
    <div className="page">
      <h2>Vai trò</h2>
      {error && <p className="form-error">{error}</p>}

      <form className="inline-form" onSubmit={createRole}>
        <input placeholder="Mã (vd truong-phong-mua-hang)" value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} required />
        <input placeholder="Tên vai trò" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
        <button type="submit">Thêm vai trò</button>
      </form>

      <DataTable
        columns={[
          { key: 'Name', label: 'Tên' },
          { key: 'Code', label: 'Mã' },
          { key: 'IsSystemRole', label: 'Loại', render: (r) => (r.IsSystemRole ? 'Hệ thống' : 'Tuỳ chỉnh') },
          {
            key: 'actions', label: '', render: (r) => r.IsSystemRole ? '—' : (
              <>
                <button type="button" onClick={() => openAccessEditor(r)}>Gán quyền</button>{' '}
                <button type="button" onClick={() => deleteRole(r)}>Xoá</button>
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

            <h4>Menu được thấy</h4>
            {menuItems.map(m => (
              <label key={m.Id} className="checkbox-row">
                <input
                  type="checkbox"
                  checked={selectedMenuIds.includes(m.Id)}
                  onChange={(e) => setSelectedMenuIds(e.target.checked
                    ? [...selectedMenuIds, m.Id]
                    : selectedMenuIds.filter(id => id !== m.Id))}
                />
                {m.Label}
              </label>
            ))}

            <h4>Báo cáo được chạy</h4>
            {reportCatalog.map(r => (
              <label key={r.ReportId} className="checkbox-row">
                <input
                  type="checkbox"
                  checked={selectedReportIds.includes(r.ReportId)}
                  onChange={(e) => setSelectedReportIds(e.target.checked
                    ? [...selectedReportIds, r.ReportId]
                    : selectedReportIds.filter(id => id !== r.ReportId))}
                />
                {r.Title}
              </label>
            ))}

            {/* Sửa quyền menu/báo cáo của 1 vai trò chỉ Admin hệ thống thật mới
                làm được (server đã chặn — xem lib/auth.js requireSystemRoleActor,
                tránh 1 người chỉ có menu "Phân quyền" tự cấp quyền hệ thống cho
                mình) — người xem thường vẫn xem được quyền hiện có, chỉ ẩn nút Lưu. */}
            <div className="modal-actions">
              {me?.isSystemRole
                ? <button type="button" onClick={saveAccess}>Lưu</button>
                : <span className="form-hint">Chỉ Admin hệ thống mới sửa được quyền này.</span>}
              <button type="button" onClick={() => setEditingAccessFor(null)}>Đóng</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
