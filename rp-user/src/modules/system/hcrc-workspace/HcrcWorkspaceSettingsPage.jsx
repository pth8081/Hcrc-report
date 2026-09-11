// modules/system/hcrc-workspace/HcrcWorkspaceSettingsPage.jsx — Cấu hình
// xác thực ngoài "HCRC Workspace" (BaseUrl + khoá API dùng cho MỌI account
// AuthSource='hcrcWorkspace' và "Đồng bộ tài khoản" ở trang Người dùng — xem
// rp-server/routes/hcrcWorkspaceSettings.js). Ô khoá API để trống khi sửa =
// giữ nguyên khoá đã lưu.
import { useEffect, useState } from 'react';
import { api } from '../../../lib/api';
import { useAuth } from '../../../lib/AuthContext';

const EMPTY = { baseUrl: '', apiKey: '', verifyPath: '/api/external/verify-credentials', directoryPath: '/api/external/users', isEnabled: false };

export default function HcrcWorkspaceSettingsPage() {
  // PUT /system/hcrc-workspace và POST /test-connection đều yêu cầu
  // requireSystemRoleActor (server chặn đúng) — trang này chỉ hiện được cho
  // menu 'system-hcrc-workspace' (có thể giao cho 1 người không phải Admin
  // hệ thống, xem lib/auth.js), nên ẩn form Lưu + nút Kiểm tra kết nối khi
  // không phải Admin hệ thống, khớp cách RolesPage.jsx đã làm cho phần Lưu
  // quyền menu.
  const { me } = useAuth();
  const [form, setForm] = useState(EMPTY);
  const [hasApiKey, setHasApiKey] = useState(false);
  const [lastSync, setLastSync] = useState(null);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  function reload() {
    api.get('/system/hcrc-workspace').then(data => {
      if (!data) return;
      setForm({ ...EMPTY, ...data, apiKey: '' });
      setHasApiKey(data.hasApiKey);
      setLastSync({ at: data.lastSyncAt, status: data.lastSyncStatus, error: data.lastSyncError });
    }).catch(err => setError(err.message));
  }
  useEffect(reload, []);

  async function save(e) {
    e.preventDefault();
    setError('');
    setMessage('');
    try {
      await api.put('/system/hcrc-workspace', form);
      setMessage('Đã lưu.');
      setHasApiKey(hasApiKey || !!form.apiKey);
      setForm({ ...form, apiKey: '' });
    } catch (err) { setError(err.message); }
  }

  async function testConnection() {
    setError('');
    setMessage('');
    try {
      const result = await api.post('/system/hcrc-workspace/test-connection', {});
      setMessage(`Kết nối OK — lấy được ${result.count} bản ghi từ danh bạ.`);
    } catch (err) { setError(err.message); }
  }

  return (
    <div className="page">
      <h1>Xác thực HCRC Workspace</h1>
      <p className="page-hint">
        Cấu hình để tài khoản người dùng (trang "Người dùng") xác thực đăng
        nhập qua hệ thống HCRC Workspace thay vì mật khẩu local, và để "Đồng
        bộ tài khoản" lấy danh bạ (họ tên/phòng ban/vị trí). Vai trò Admin
        (hệ thống) luôn xác thực local, không phụ thuộc cấu hình này.
      </p>
      {error && <p className="form-error">{error}</p>}
      {message && <p className="form-success">{message}</p>}

      {me?.isSystemRole ? (
        <>
          <form className="stacked-form" onSubmit={save}>
            <input placeholder="Base URL (vd https://workspace.noi-bo.hcrc.vn)" value={form.baseUrl} onChange={(e) => setForm({ ...form, baseUrl: e.target.value })} required />
            <input placeholder={hasApiKey ? 'Khoá API (bỏ trống để giữ nguyên)' : 'Khoá API'} type="password" value={form.apiKey} onChange={(e) => setForm({ ...form, apiKey: e.target.value })} />
            <input placeholder="Đường dẫn xác thực" value={form.verifyPath} onChange={(e) => setForm({ ...form, verifyPath: e.target.value })} />
            <input placeholder="Đường dẫn danh bạ" value={form.directoryPath} onChange={(e) => setForm({ ...form, directoryPath: e.target.value })} />
            <label className="checkbox-row"><input type="checkbox" checked={form.isEnabled} onChange={(e) => setForm({ ...form, isEnabled: e.target.checked })} /> Bật xác thực HCRC Workspace</label>
            <button type="submit">Lưu cấu hình</button>
          </form>

          <div className="inline-form">
            <button type="button" onClick={testConnection}>Kiểm tra kết nối</button>
          </div>
        </>
      ) : (
        <p className="form-hint">
          Base URL hiện tại: {form.baseUrl || '—'} — {form.isEnabled ? 'đang bật' : 'đang tắt'}.
          Chỉ Admin hệ thống mới sửa được cấu hình này.
        </p>
      )}

      {lastSync?.at && (
        <p className="page-hint">
          Lần đồng bộ gần nhất: {new Date(lastSync.at).toLocaleString('vi-VN')} — {lastSync.status === 'SUCCESS' ? 'thành công' : `lỗi: ${lastSync.error}`}
        </p>
      )}
    </div>
  );
}
