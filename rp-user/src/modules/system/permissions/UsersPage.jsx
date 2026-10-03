// modules/system/permissions/UsersPage.jsx — Danh sách người dùng: tạo mới,
// khoá/mở, đặt lại mật khẩu, gán vai trò. Không có nút xoá (xem
// rp-server/routes/users.js — lý do: giữ dấu vết AuditLog).
import { useEffect, useState } from 'react';
import { api } from '../../../lib/api';
import { useAuth } from '../../../lib/AuthContext';
import DataTable from '../../../components/DataTable';
import PasswordInput from '../../../components/PasswordInput';

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
  const [resettingPasswordFor, setResettingPasswordFor] = useState(null);
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  // Gán quyền riêng (bản 8.48) — CỘNG DỒN vào quyền theo vai trò, xem
  // rp-server/lib/permissions.js. reportCatalog/dashboardGroupCatalog dùng
  // CHUNG với trang "Vai trò" (đã có sẵn 2 route catalog đó).
  const [editingAccessFor, setEditingAccessFor] = useState(null);
  const [reportCatalog, setReportCatalog] = useState([]);
  const [dashboardGroupCatalog, setDashboardGroupCatalog] = useState([]);
  const [selectedReportIds, setSelectedReportIds] = useState([]);
  const [dashboardGroupAccess, setDashboardGroupAccess] = useState({});
  // Phạm vi dữ liệu theo siêu thị (bản 8.50) — CHƯA lọc dữ liệu thật (chỉ
  // lưu gán, xem rp-server/routes/users.js). storeCatalog tải sẵn ở reload()
  // (không lazy như reportCatalog) để cột "Phạm vi dữ liệu" hiện được TÊN
  // siêu thị ngay trong bảng, không chỉ mã.
  const [storeCatalog, setStoreCatalog] = useState([]);
  const [editingStoreAccessFor, setEditingStoreAccessFor] = useState(null);
  const [selectedMaDiems, setSelectedMaDiems] = useState([]);
  const [suggestedMaDiem, setSuggestedMaDiem] = useState(null);

  function reload() {
    api.get('/system/users').then(setUsers).catch(err => setError(err.message));
    api.get('/system/roles').then(setRoles).catch(err => setError(err.message));
    api.get('/system/users/store-catalog').then(setStoreCatalog).catch(err => setError(err.message));
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
        workLocation: user.WorkLocation, isActive: !user.IsActive
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

  function dashboardGroupKey(dashboardId, groupKey) {
    return `${dashboardId}::${groupKey}`;
  }

  function toggleDashboardGroupAccess(dashboardId, groupKey, field) {
    const mapKey = dashboardGroupKey(dashboardId, groupKey);
    setDashboardGroupAccess(prev => {
      const current = prev[mapKey] || { canView: false, canExport: false };
      const next = { ...current, [field]: !current[field] };
      if (field === 'canView' && !next.canView) next.canExport = false;
      return { ...prev, [mapKey]: next };
    });
  }

  async function openAccessEditor(user) {
    setEditingAccessFor(user);
    if (!reportCatalog.length) api.get('/system/roles/report-catalog').then(setReportCatalog).catch(err => setError(err.message));
    if (!dashboardGroupCatalog.length) api.get('/system/roles/dashboard-groups-catalog').then(setDashboardGroupCatalog).catch(err => setError(err.message));
    const access = await api.get(`/system/users/${user.Id}/access`);
    setSelectedReportIds(access.reportIds);
    const accessMap = {};
    for (const entry of access.dashboardGroupAccess || []) {
      accessMap[dashboardGroupKey(entry.dashboardId, entry.groupKey)] = { canView: entry.canView, canExport: entry.canExport };
    }
    setDashboardGroupAccess(accessMap);
  }

  async function saveAccess() {
    try {
      await api.put(`/system/users/${editingAccessFor.Id}/report-access`, { reportIds: selectedReportIds });
      const entries = dashboardGroupCatalog.map(g => ({
        dashboardId: g.dashboardId, groupKey: g.groupKey,
        ...(dashboardGroupAccess[dashboardGroupKey(g.dashboardId, g.groupKey)] || { canView: false, canExport: false })
      }));
      await api.put(`/system/users/${editingAccessFor.Id}/dashboard-group-access`, { entries });
      setEditingAccessFor(null);
    } catch (err) { setError(err.message); }
  }

  function storeName(maDiem) {
    return storeCatalog.find(s => s.maDiem === maDiem)?.tenSieuThi || maDiem;
  }

  async function openStoreAccessEditor(user) {
    setEditingStoreAccessFor(user);
    try {
      const { maDiems, suggestedMaDiem: suggestion } = await api.get(`/system/users/${user.Id}/store-access`);
      setSelectedMaDiems(maDiems);
      setSuggestedMaDiem(suggestion);
    } catch (err) { setError(err.message); }
  }

  function toggleMaDiem(maDiem) {
    setSelectedMaDiems(prev => prev.includes(maDiem) ? prev.filter(m => m !== maDiem) : [...prev, maDiem]);
  }

  function applySuggestion() {
    if (suggestedMaDiem && !selectedMaDiems.includes(suggestedMaDiem)) {
      setSelectedMaDiems(prev => [...prev, suggestedMaDiem]);
    }
  }

  async function saveStoreAccess() {
    try {
      await api.put(`/system/users/${editingStoreAccessFor.Id}/store-access`, { maDiems: selectedMaDiems });
      setEditingStoreAccessFor(null);
      reload();
    } catch (err) { setError(err.message); }
  }

  // Đặt lại mật khẩu cho tài khoản local quên mật khẩu — trước đây KHÔNG có
  // nút nào trên giao diện gọi tới route này dù backend đã sẵn sàng, admin
  // phải đi vòng qua "Nguồn xác thực" (đổi sang rồi lại về 'local' kèm mật
  // khẩu mới) mới đặt lại được. Chỉ Admin hệ thống mới làm được — server đã
  // chặn (requireSystemRoleActor), ẩn nút ở đây cho gọn nếu không phải Admin.
  function openResetPassword(user) {
    setResettingPasswordFor(user);
    setNewPassword('');
    setConfirmPassword('');
  }

  async function saveResetPassword(e) {
    e.preventDefault();
    setError('');
    if (!newPassword || newPassword.length < 8) return setError('Mật khẩu phải có ít nhất 8 ký tự');
    if (newPassword !== confirmPassword) return setError('Xác nhận mật khẩu không khớp');
    try {
      await api.post(`/system/users/${resettingPasswordFor.Id}/reset-password`, { password: newPassword });
      setResettingPasswordFor(null);
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

  // Xoá mật khẩu dự phòng cục bộ (bản 8.47) — xem rp-server/routes/users.js.
  // Chỉ hiện khi tài khoản ĐANG có dự phòng (CachedPasswordHashAt khác null).
  async function clearFallbackPassword(user) {
    if (!confirm(`Xoá mật khẩu dự phòng cục bộ của "${user.Username}"? Nếu HCRC Workspace đang sập, người này sẽ KHÔNG đăng nhập được nữa cho tới khi HCRC Workspace sống lại.`)) return;
    try {
      await api.post(`/system/users/${user.Id}/clear-fallback-password`, {});
      reload();
    } catch (err) { setError(err.message); }
  }

  return (
    <div className="page">
      <h2>Người dùng</h2>
      {error && <p className="form-error">{error}</p>}

      {me?.isSystemRole && (
        <div className="inline-form">
          <button type="button" onClick={syncAccounts} disabled={syncing}>{syncing ? 'Đang đồng bộ...' : 'Đồng bộ tài khoản (HCRC Workspace)'}</button>
        </div>
      )}

      <form className="inline-form" onSubmit={createUser}>
        <input placeholder="Username" value={form.username} onChange={(e) => setForm({ ...form, username: e.target.value })} required />
        <PasswordInput placeholder="Mật khẩu" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} required autoComplete="new-password" />
        <input placeholder="Họ tên" value={form.fullName} onChange={(e) => setForm({ ...form, fullName: e.target.value })} required />
        <input placeholder="Email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
        <button type="submit">Thêm người dùng</button>
      </form>

      <DataTable
        columns={[
          { key: 'Username', label: 'Username' },
          { key: 'FullName', label: 'Họ tên' },
          { key: 'Department', label: 'Phòng ban', render: (u) => u.Department || '—' },
          { key: 'Position', label: 'Chức danh', render: (u) => u.Position || '—' },
          { key: 'WorkLocation', label: 'Nơi làm việc', render: (u) => u.WorkLocation || '—' },
          { key: 'Phone', label: 'Điện thoại', render: (u) => u.Phone || '—' },
          { key: 'Email', label: 'Email', render: (u) => u.Email || '—' },
          { key: 'AuthSource', label: 'Nguồn xác thực', render: (u) => (u.AuthSource === 'local' ? 'Local' : 'HCRC Workspace') },
          {
            key: 'CachedPasswordHashAt', label: 'Mật khẩu dự phòng', render: (u) => (
              u.AuthSource === 'hcrcWorkspace' && u.CachedPasswordHashAt
                ? `Có (cập nhật ${new Date(u.CachedPasswordHashAt).toLocaleDateString('vi-VN')})`
                : '—'
            )
          },
          { key: 'roles', label: 'Vai trò', render: (u) => u.roles.map(r => r.name).join(', ') || '—' },
          {
            key: 'storeAccess', label: 'Phạm vi dữ liệu', render: (u) => (
              u.storeAccess.length ? `Giới hạn: ${u.storeAccess.map(storeName).join(', ')}` : 'Toàn bộ'
            )
          },
          { key: 'IsActive', label: 'Trạng thái', render: (u) => (u.IsActive ? 'Hoạt động' : 'Chưa cho phép kết nối / đã khoá') },
          { key: 'TwoFactorEnabled', label: '2FA', render: (u) => (!u.roles.some(r => r.isSystemRole) ? '—' : (u.TwoFactorEnabled ? 'Đã bật' : 'Chưa bật')) },
          {
            key: 'actions', label: '', render: (u) => (
              <>
                {me?.isSystemRole && <button type="button" onClick={() => toggleActive(u)}>{u.IsActive ? 'Khoá' : 'Cho phép kết nối'}</button>}{' '}
                <button type="button" onClick={() => openRoleEditor(u)}>Gán vai trò</button>{' '}
                <button type="button" onClick={() => openAccessEditor(u)}>Gán quyền riêng</button>{' '}
                <button type="button" onClick={() => openStoreAccessEditor(u)}>Phạm vi dữ liệu</button>{' '}
                {me?.isSystemRole && !u.roles.some(r => r.isSystemRole) && <button type="button" onClick={() => openAuthEditor(u)}>Nguồn xác thực</button>}{' '}
                {me?.isSystemRole && u.AuthSource === 'local' && <button type="button" onClick={() => openResetPassword(u)}>Đặt lại mật khẩu</button>}{' '}
                {me?.isSystemRole && u.roles.some(r => r.isSystemRole) && <button type="button" onClick={() => reset2fa(u)}>Đặt lại 2FA</button>}{' '}
                {me?.isSystemRole && u.AuthSource === 'hcrcWorkspace' && u.CachedPasswordHashAt && <button type="button" onClick={() => clearFallbackPassword(u)}>Xoá mật khẩu dự phòng</button>}
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
            {/* Gán vai trò chỉ Admin hệ thống thật mới làm được (server đã
                chặn — xem lib/auth.js requireSystemRoleActor, tránh 1 user chỉ
                có menu "Phân quyền" tự gán vai trò cho chính mình) — người
                xem thường vẫn xem được vai trò hiện có, chỉ ẩn nút Lưu. */}
            <div className="modal-actions">
              {me?.isSystemRole
                ? <button type="button" onClick={saveRoles}>Lưu</button>
                : <span className="form-hint">Chỉ Admin hệ thống mới gán vai trò được.</span>}
              <button type="button" onClick={() => setEditingRolesFor(null)}>Đóng</button>
            </div>
          </div>
        </div>
      )}

      {editingAccessFor && (
        <div className="modal">
          <div className="modal-body">
            <h3>Gán quyền riêng — {editingAccessFor.Username}</h3>
            <p className="form-hint">
              Quyền ở đây CỘNG THÊM vào quyền theo vai trò đang giữ, không thay thế — dùng cho
              trường hợp cấp lẻ 1-2 báo cáo cho đúng người này mà không muốn tạo hẳn 1 vai trò
              riêng. Muốn cấp cho CẢ MỘT NHÓM người, hãy tạo 1 vai trò rồi gán nhiều người vào
              thay vì lặp lại ở đây cho từng người.
            </p>

            {dashboardGroupCatalog.length > 0 && (
              <>
                <h4>Dashboard được xem thêm (theo nhóm)</h4>
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

            <h4>Báo cáo được chạy thêm</h4>
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

            <div className="modal-actions">
              {me?.isSystemRole
                ? <button type="button" onClick={saveAccess}>Lưu</button>
                : <span className="form-hint">Chỉ Admin hệ thống mới sửa được quyền này.</span>}
              <button type="button" onClick={() => setEditingAccessFor(null)}>Đóng</button>
            </div>
          </div>
        </div>
      )}

      {editingStoreAccessFor && (
        <div className="modal">
          <div className="modal-body">
            <h3>Phạm vi dữ liệu — {editingStoreAccessFor.Username}</h3>
            <p className="form-hint">
              KHÔNG tick siêu thị nào = "Toàn bộ" (xem được mọi siêu thị, như hiện tại). Tick 1
              hoặc nhiều siêu thị = CHỈ còn thấy đúng (các) siêu thị đó. Lưu ý: bản này CHỈ LƯU
              lựa chọn — việc tự lọc dữ liệu báo cáo theo đúng lựa chọn này sẽ áp dụng ở bản sau.
            </p>
            {suggestedMaDiem && !selectedMaDiems.includes(suggestedMaDiem) && (
              <p className="form-hint">
                Gợi ý theo Phòng ban đã đồng bộ: <strong>{storeName(suggestedMaDiem)}</strong>{' '}
                <button type="button" onClick={applySuggestion}>Dùng gợi ý này</button>
              </p>
            )}
            {storeCatalog.map(s => (
              <label key={s.maDiem} className="checkbox-row">
                <input type="checkbox" checked={selectedMaDiems.includes(s.maDiem)} onChange={() => toggleMaDiem(s.maDiem)} />
                {s.tenSieuThi}
              </label>
            ))}
            <div className="modal-actions">
              {me?.isSystemRole
                ? <button type="button" onClick={saveStoreAccess}>Lưu</button>
                : <span className="form-hint">Chỉ Admin hệ thống mới sửa được phạm vi dữ liệu.</span>}
              <button type="button" onClick={() => setEditingStoreAccessFor(null)}>Đóng</button>
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
              <PasswordInput placeholder="Mật khẩu (bỏ trống nếu tài khoản đã có mật khẩu local)"
                value={authForm.password} onChange={(e) => setAuthForm({ ...authForm, password: e.target.value })} autoComplete="new-password" />
            )}
            <div className="modal-actions">
              <button type="button" onClick={saveAuthSource}>Lưu</button>
              <button type="button" onClick={() => setEditingAuthFor(null)}>Huỷ</button>
            </div>
          </div>
        </div>
      )}

      {resettingPasswordFor && (
        <div className="modal">
          <div className="modal-body">
            <h3>Đặt lại mật khẩu — {resettingPasswordFor.Username}</h3>
            <p className="form-hint">Admin đặt trực tiếp, không cần biết mật khẩu cũ — tài khoản này sẽ bị đăng xuất ngay và phải đăng nhập lại bằng mật khẩu mới.</p>
            <form className="stacked-form" onSubmit={saveResetPassword}>
              <label>Mật khẩu mới</label>
              <PasswordInput
                placeholder="Tối thiểu 8 ký tự"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                autoComplete="new-password"
                autoFocus
                required
              />
              <label>Xác nhận mật khẩu mới</label>
              <PasswordInput
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                autoComplete="new-password"
                required
              />
              <div className="modal-actions">
                <button type="submit">Lưu</button>
                <button type="button" onClick={() => setResettingPasswordFor(null)}>Huỷ</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
