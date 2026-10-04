// modules/system/permissions/RolesPage.jsx — CRUD vai trò + gán 2 lớp quyền
// (menu, báo cáo). Vai trò hệ thống (Admin) không sửa/xoá được — server đã
// chặn, ở đây chỉ ẩn nút cho gọn.
import { useEffect, useState } from 'react';
import { api } from '../../../lib/api';
import { useAuth } from '../../../lib/AuthContext';
import DataTable from '../../../components/DataTable';
import { useRowSelection } from '../../../lib/useRowSelection';

export default function RolesPage() {
  const { me } = useAuth();
  const [roles, setRoles] = useState([]);
  const [menuItems, setMenuItems] = useState([]);
  const [reportCatalog, setReportCatalog] = useState([]);
  const [domainCatalog, setDomainCatalog] = useState([]);
  // dashboardGroupCatalog (bản 8.43) — TOÀN BỘ nhóm đang có trên mọi
  // dashboard, xem routes/roles.js:/dashboard-groups-catalog.
  const [dashboardGroupCatalog, setDashboardGroupCatalog] = useState([]);
  const [error, setError] = useState('');
  const [form, setForm] = useState({ code: '', name: '' });
  const [editingAccessFor, setEditingAccessFor] = useState(null);
  const [selectedMenuIds, setSelectedMenuIds] = useState([]);
  const [selectedReportIds, setSelectedReportIds] = useState([]);
  const [selectedDomains, setSelectedDomains] = useState([]);
  // dashboardGroupAccess: { "dashboardId::groupKey": { canView, canExport } }
  const [dashboardGroupAccess, setDashboardGroupAccess] = useState({});
  const [editingNameFor, setEditingNameFor] = useState(null);
  const [nameForm, setNameForm] = useState('');
  const [creatingRole, setCreatingRole] = useState(false);
  const [savingName, setSavingName] = useState(false);
  const [deletingId, setDeletingId] = useState(null);
  const [savingAccess, setSavingAccess] = useState(false);
  // Chọn nhiều + xoá hàng loạt (bản 8.62).
  const selection = useRowSelection();
  const [bulkDeleting, setBulkDeleting] = useState(false);

  function reload() {
    api.get('/system/roles').then(setRoles).catch(err => setError(err.message));
    api.get('/system/menu-items').then(setMenuItems).catch(err => setError(err.message));
    api.get('/system/roles/report-catalog').then(setReportCatalog).catch(err => setError(err.message));
    api.get('/system/roles/domains-catalog').then(setDomainCatalog).catch(err => setError(err.message));
    api.get('/system/roles/dashboard-groups-catalog').then(setDashboardGroupCatalog).catch(err => setError(err.message));
  }
  useEffect(reload, []);

  function dashboardGroupKey(dashboardId, groupKey) {
    return `${dashboardId}::${groupKey}`;
  }

  function toggleDashboardGroupAccess(dashboardId, groupKey, field) {
    const mapKey = dashboardGroupKey(dashboardId, groupKey);
    setDashboardGroupAccess(prev => {
      const current = prev[mapKey] || { canView: false, canExport: false };
      const next = { ...current, [field]: !current[field] };
      // Bỏ "Xem chi tiết" tự động nếu bỏ luôn "Xem dashboard" (xuất file mà
      // không xem được thì vô nghĩa, tránh cấu hình rối không ai hiểu).
      if (field === 'canView' && !next.canView) next.canExport = false;
      return { ...prev, [mapKey]: next };
    });
  }

  async function createRole(e) {
    e.preventDefault();
    setError('');
    setCreatingRole(true);
    try {
      await api.post('/system/roles', form);
      setForm({ code: '', name: '' });
      reload();
    } catch (err) { setError(err.message); } finally { setCreatingRole(false); }
  }

  // Đổi tên vai trò — route PUT /system/roles/:id đã có sẵn từ trước nhưng
  // chưa có UI nào gọi tới; thiếu nút này thì cách duy nhất để đổi tên là
  // Xoá + Tạo lại (mất luôn RoleMenuAccess/RoleReportAccess/RoleDomainAccess/
  // UserRoles đã gán do ON DELETE CASCADE theo RoleId).
  function openEditName(role) {
    setEditingNameFor(role);
    setNameForm(role.Name);
  }

  async function saveName(e) {
    e.preventDefault();
    setError('');
    setSavingName(true);
    try {
      await api.put(`/system/roles/${editingNameFor.Id}`, { name: nameForm });
      setEditingNameFor(null);
      reload();
    } catch (err) { setError(err.message); } finally { setSavingName(false); }
  }

  async function deleteRole(role) {
    if (!confirm(`Xoá vai trò "${role.Name}"?`)) return;
    setDeletingId(role.Id);
    try {
      await api.del(`/system/roles/${role.Id}`);
      reload();
    } catch (err) { setError(err.message); } finally { setDeletingId(null); }
  }

  async function deleteSelected() {
    if (selection.selectedIds.size === 0) return;
    if (!confirm(`Xoá ${selection.selectedIds.size} vai trò đã chọn?`)) return;
    setError('');
    setBulkDeleting(true);
    try {
      for (const id of selection.selectedIds) {
        await api.del(`/system/roles/${id}`);
      }
      selection.clear();
      reload();
    } catch (err) { setError(err.message); } finally { setBulkDeleting(false); }
  }

  async function openAccessEditor(role) {
    setEditingAccessFor(role);
    const access = await api.get(`/system/roles/${role.Id}/access`);
    setSelectedMenuIds(access.menuItemIds);
    setSelectedReportIds(access.reportIds);
    setSelectedDomains(access.domains);
    const accessMap = {};
    for (const entry of access.dashboardGroupAccess || []) {
      accessMap[dashboardGroupKey(entry.dashboardId, entry.groupKey)] = { canView: entry.canView, canExport: entry.canExport };
    }
    setDashboardGroupAccess(accessMap);
  }

  async function saveAccess() {
    setSavingAccess(true);
    try {
      await api.put(`/system/roles/${editingAccessFor.Id}/menu-access`, { menuItemIds: selectedMenuIds });
      await api.put(`/system/roles/${editingAccessFor.Id}/report-access`, { reportIds: selectedReportIds });
      await api.put(`/system/roles/${editingAccessFor.Id}/domain-access`, { domains: selectedDomains });
      const entries = dashboardGroupCatalog.map(g => ({
        dashboardId: g.dashboardId, groupKey: g.groupKey,
        ...(dashboardGroupAccess[dashboardGroupKey(g.dashboardId, g.groupKey)] || { canView: false, canExport: false })
      }));
      await api.put(`/system/roles/${editingAccessFor.Id}/dashboard-group-access`, { entries });
      setEditingAccessFor(null);
    } catch (err) { setError(err.message); } finally { setSavingAccess(false); }
  }

  return (
    <div className="page">
      <h2>Vai trò</h2>
      {error && <p className="form-error">{error}</p>}

      <form className="inline-form" onSubmit={createRole}>
        <input placeholder="Mã (vd truong-phong-mua-hang)" value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} required />
        <input placeholder="Tên vai trò" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
        <button type="submit" disabled={creatingRole}>{creatingRole ? 'Đang thêm...' : 'Thêm vai trò'}</button>
      </form>

      <DataTable
        columns={[
          { key: 'Name', label: 'Tên' },
          { key: 'Code', label: 'Mã' },
          { key: 'IsSystemRole', label: 'Loại', render: (r) => (r.IsSystemRole ? 'Hệ thống' : 'Tuỳ chỉnh') },
          {
            key: 'actions', label: '', render: (r) => r.IsSystemRole ? '—' : (
              <>
                <button type="button" onClick={() => openEditName(r)}>Sửa tên</button>{' '}
                <button type="button" onClick={() => openAccessEditor(r)}>Gán quyền</button>{' '}
                <button type="button" onClick={() => deleteRole(r)} disabled={deletingId === r.Id}>{deletingId === r.Id ? 'Đang xoá...' : 'Xoá'}</button>
              </>
            )
          }
        ]}
        rows={roles}
        selection={selection}
      />

      {selection.selectedIds.size > 0 && (
        <div className="inline-actions">
          <button type="button" onClick={deleteSelected} disabled={bulkDeleting}>
            {bulkDeleting ? 'Đang xoá...' : `Xoá ${selection.selectedIds.size} mục đã chọn`}
          </button>
        </div>
      )}

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

            {dashboardGroupCatalog.length > 0 && (
              <>
                <h4>Dashboard được xem (theo nhóm)</h4>
                <p className="form-hint">
                  Chỉ hiện khi đã tick "Dashboard" ở trên — chọn đúng nhóm vai trò này được phép
                  xem, không phải tất cả. "Xem chi tiết" = được bấm Xuất Excel/PDF cho nhóm đó.
                </p>
                {dashboardGroupCatalog.map(g => {
                  const mapKey = dashboardGroupKey(g.dashboardId, g.groupKey);
                  const access = dashboardGroupAccess[mapKey] || { canView: false, canExport: false };
                  return (
                    <div key={mapKey} className="dashboard-group-access-row">
                      <span className="dashboard-group-access-label">{g.groupIcon} {g.groupLabel}</span>
                      <label className="checkbox-row">
                        <input type="checkbox" checked={access.canView} onChange={() => toggleDashboardGroupAccess(g.dashboardId, g.groupKey, 'canView')} />
                        Xem dashboard
                      </label>
                      <label className="checkbox-row">
                        <input type="checkbox" checked={access.canExport} disabled={!access.canView} onChange={() => toggleDashboardGroupAccess(g.dashboardId, g.groupKey, 'canExport')} />
                        Xem chi tiết (xuất Excel/PDF)
                      </label>
                    </div>
                  );
                })}
              </>
            )}

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

            <h4>Domain được tự khám phá (Báo cáo tự do)</h4>
            {!domainCatalog.length && <p className="form-hint">Chưa có Domain nào có dữ liệu trong Data Warehouse.</p>}
            {domainCatalog.map(d => (
              <label key={d} className="checkbox-row">
                <input
                  type="checkbox"
                  checked={selectedDomains.includes(d)}
                  onChange={(e) => setSelectedDomains(e.target.checked
                    ? [...selectedDomains, d]
                    : selectedDomains.filter(x => x !== d))}
                />
                {d}
              </label>
            ))}

            {/* Sửa quyền menu/báo cáo/domain của 1 vai trò chỉ Admin hệ thống thật mới
                làm được (server đã chặn — xem lib/auth.js requireSystemRoleActor,
                tránh 1 người chỉ có menu "Phân quyền" tự cấp quyền hệ thống cho
                mình) — người xem thường vẫn xem được quyền hiện có, chỉ ẩn nút Lưu. */}
            <div className="modal-actions">
              {me?.isSystemRole
                ? <button type="button" onClick={saveAccess} disabled={savingAccess}>{savingAccess ? 'Đang lưu...' : 'Lưu'}</button>
                : <span className="form-hint">Chỉ Admin hệ thống mới sửa được quyền này.</span>}
              <button type="button" onClick={() => setEditingAccessFor(null)}>Đóng</button>
            </div>
          </div>
        </div>
      )}

      {editingNameFor && (
        <div className="modal">
          <div className="modal-body">
            <h3>Sửa tên vai trò — {editingNameFor.Code}</h3>
            <form className="stacked-form" onSubmit={saveName}>
              <input value={nameForm} onChange={(e) => setNameForm(e.target.value)} autoFocus required />
              <div className="modal-actions">
                <button type="submit" disabled={savingName}>{savingName ? 'Đang lưu...' : 'Lưu'}</button>
                <button type="button" onClick={() => setEditingNameFor(null)}>Huỷ</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
