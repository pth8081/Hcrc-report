// pages/ConsumersPage.jsx — Trang "Đối tác": CRUD api.ApiConsumers. Chọn
// AuthMethod lúc TẠO, không đổi được sau đó (đổi = tạo đối tác mới, xem
// api-server/routes/admin/consumers.js). Bí mật (apiKey/clientSecret/
// hmacSecret) chỉ hiện MỘT LẦN lúc tạo/luân chuyển (banner) — ClientId/
// HmacKeyId thì hiện thường xuyên trong bảng (định danh CÔNG KHAI, không
// phải bí mật).
//
// "Báo cáo được gọi" (api.ConsumerReportAccess) — MẶC ĐỊNH một đối tác mới
// KHÔNG gọi được báo cáo nào dù có scope "reports" hợp lệ, phải gán rõ ràng ở
// đây (xem routes/v1/reports.js). Khác GET/PUT report-access bên rp-server
// (app.RoleReportAccess) ở CHỦ THỂ (đối tác API thay vì vai trò người dùng),
// cùng cơ chế XOÁ HẾT + GÁN LẠI.
import { useEffect, useState } from 'react';
import { api } from '../lib/api';
import { useAuth } from '../lib/AuthContext';
import DataTable from '../components/DataTable';

const SCOPE_OPTIONS = ['reports', 'realtime'];
const EMPTY_FORM = { name: '', authMethod: 'apiKey', scopes: [], rateLimitPerMinute: 120, allowedIps: '' };
const AUTH_METHOD_LABELS = {
  apiKey: 'API key tĩnh',
  oauth2: 'OAuth2 Client Credentials',
  hmac: 'HMAC ký từng request'
};

// Hiện đúng bí mật vừa được cấp — hình dạng response khác nhau theo authMethod.
function RevealedCredentials({ creds, onClose }) {
  return (
    <div className="key-banner">
      <p><strong>Thông tin xác thực mới — chỉ hiện đúng một lần, sao chép ngay:</strong></p>
      {creds.authMethod === 'apiKey' && <code>{creds.apiKey}</code>}
      {creds.authMethod === 'oauth2' && (
        <>
          <p>Client ID (công khai, đối tác dùng lâu dài — không đổi khi luân chuyển): <code>{creds.clientId}</code></p>
          <p>Client Secret: <code>{creds.clientSecret}</code></p>
        </>
      )}
      {creds.authMethod === 'hmac' && (
        <>
          <p>Key ID (công khai, đối tác dùng lâu dài — không đổi khi luân chuyển): <code>{creds.hmacKeyId}</code></p>
          <p>Secret: <code>{creds.hmacSecret}</code></p>
        </>
      )}
      <button type="button" onClick={onClose}>Đã lưu, đóng lại</button>
    </div>
  );
}

export default function ConsumersPage() {
  const { isAdmin } = useAuth();
  const [consumers, setConsumers] = useState([]);
  const [reports, setReports] = useState([]);
  const [form, setForm] = useState(EMPTY_FORM);
  const [editing, setEditing] = useState(null); // consumer đang sửa, hoặc null
  const [accessFor, setAccessFor] = useState(null); // consumer đang gán báo cáo, hoặc null
  const [accessReportIds, setAccessReportIds] = useState([]);
  const [revealedCreds, setRevealedCreds] = useState(null); // { authMethod, ...bí mật } vừa tạo/luân chuyển
  const [error, setError] = useState('');

  function reload() {
    api.get('/consumers').then(setConsumers).catch(err => setError(err.message));
    api.get('/report-catalog').then(setReports).catch(err => setError(err.message));
  }
  useEffect(reload, []);

  async function openReportAccess(consumer) {
    setError('');
    try {
      const { reportIds } = await api.get(`/consumers/${consumer.Id}/report-access`);
      setAccessReportIds(reportIds);
      setAccessFor(consumer);
    } catch (err) { setError(err.message); }
  }

  function toggleReportAccess(reportId) {
    setAccessReportIds(list => (list.includes(reportId) ? list.filter(r => r !== reportId) : [...list, reportId]));
  }

  async function saveReportAccess() {
    try {
      await api.put(`/consumers/${accessFor.Id}/report-access`, { reportIds: accessReportIds });
      setAccessFor(null);
    } catch (err) { setError(err.message); }
  }

  function toggleScope(scopeList, scope) {
    return scopeList.includes(scope) ? scopeList.filter(s => s !== scope) : [...scopeList, scope];
  }

  async function createConsumer(e) {
    e.preventDefault();
    setError('');
    try {
      const result = await api.post('/consumers', form);
      setRevealedCreds(result);
      setForm(EMPTY_FORM);
      reload();
    } catch (err) { setError(err.message); }
  }

  async function rotateSecret(consumer) {
    if (!confirm(`Luân chuyển bí mật mới cho "${consumer.Name}"? Bí mật cũ sẽ ngừng hoạt động ngay.`)) return;
    try {
      const result = await api.post(`/consumers/${consumer.Id}/rotate`);
      setRevealedCreds(result);
    } catch (err) { setError(err.message); }
  }

  async function saveEdit() {
    try {
      await api.put(`/consumers/${editing.Id}`, {
        name: editing.Name,
        scopes: editing.Scopes,
        rateLimitPerMinute: editing.RateLimitPerMinute,
        allowedIps: editing.AllowedIps || '',
        isActive: editing.IsActive
      });
      setEditing(null);
      reload();
    } catch (err) { setError(err.message); }
  }

  async function deleteConsumer(consumer) {
    if (!confirm(`Xoá đối tác "${consumer.Name}"? Không hoàn tác được.`)) return;
    try {
      await api.del(`/consumers/${consumer.Id}`);
      reload();
    } catch (err) { setError(err.message); }
  }

  return (
    <div className="page">
      <h1>Đối tác API</h1>
      {error && <p className="form-error">{error}</p>}

      {revealedCreds && <RevealedCredentials creds={revealedCreds} onClose={() => setRevealedCreds(null)} />}

      {isAdmin && (
        <form className="stacked-form" onSubmit={createConsumer}>
          <input placeholder="Tên đối tác" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
          <select value={form.authMethod} onChange={(e) => setForm({ ...form, authMethod: e.target.value })}>
            {Object.entries(AUTH_METHOD_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </select>
          {form.authMethod === 'oauth2' && (
            <p className="hint">Đối tác đổi Client ID/Secret lấy access token tại <code>POST /api/v1/oauth/token</code> (grant_type=client_credentials), rồi gọi API kèm <code>Authorization: Bearer &lt;token&gt;</code>.</p>
          )}
          {form.authMethod === 'hmac' && (
            <p className="hint">Đối tác tự ký từng request: HMAC-SHA256(secret, <code>METHOD\npath\ntimestamp\nbody</code>), gửi kèm header <code>X-Key-Id</code>/<code>X-Timestamp</code>/<code>X-Signature</code> (hex).</p>
          )}
          <div className="scope-picker">
            {SCOPE_OPTIONS.map(scope => (
              <label key={scope} className="checkbox-row">
                <input type="checkbox" checked={form.scopes.includes(scope)} onChange={() => setForm({ ...form, scopes: toggleScope(form.scopes, scope) })} />
                {scope}
              </label>
            ))}
          </div>
          <input type="number" placeholder="Giới hạn/phút" value={form.rateLimitPerMinute} onChange={(e) => setForm({ ...form, rateLimitPerMinute: Number(e.target.value) })} />
          <input
            placeholder="IP cho phép, phân tách dấu phẩy (để trống = không giới hạn), vd 203.0.113.10,198.51.100.0/24"
            value={form.allowedIps}
            onChange={(e) => setForm({ ...form, allowedIps: e.target.value })}
          />
          <button type="submit">Tạo đối tác</button>
        </form>
      )}

      <DataTable
        columns={[
          { key: 'Name', label: 'Tên' },
          { key: 'AuthMethod', label: 'Xác thực', render: (c) => AUTH_METHOD_LABELS[c.AuthMethod] || c.AuthMethod },
          { key: 'PublicId', label: 'Định danh công khai', render: (c) => c.ClientId || c.HmacKeyId || '—' },
          { key: 'Scopes', label: 'Phạm vi', render: (c) => c.Scopes.join(', ') },
          { key: 'AllowedIps', label: 'IP cho phép', render: (c) => c.AllowedIps || 'Không giới hạn' },
          { key: 'IsActive', label: 'Trạng thái', render: (c) => (c.IsActive ? 'Hoạt động' : 'Đã tắt') },
          { key: 'LastUsedAt', label: 'Dùng gần nhất', render: (c) => (c.LastUsedAt ? new Date(c.LastUsedAt).toLocaleString('vi-VN') : '—') },
          isAdmin && {
            key: 'actions', label: '', render: (c) => (
              <>
                <button type="button" onClick={() => setEditing({ ...c })}>Sửa</button>{' '}
                <button type="button" onClick={() => openReportAccess(c)}>Báo cáo được gọi</button>{' '}
                <button type="button" onClick={() => rotateSecret(c)}>Luân chuyển bí mật</button>{' '}
                <button type="button" onClick={() => deleteConsumer(c)}>Xoá</button>
              </>
            )
          }
        ].filter(Boolean)}
        rows={consumers}
      />

      {editing && (
        <div className="modal">
          <div className="modal-body">
            <h3>Sửa — {editing.Name}</h3>
            <p>Cách xác thực: <strong>{AUTH_METHOD_LABELS[editing.AuthMethod] || editing.AuthMethod}</strong> (không đổi được — tạo đối tác mới nếu cần cách khác)</p>
            <input value={editing.Name} onChange={(e) => setEditing({ ...editing, Name: e.target.value })} />
            <div className="scope-picker">
              {SCOPE_OPTIONS.map(scope => (
                <label key={scope} className="checkbox-row">
                  <input type="checkbox" checked={editing.Scopes.includes(scope)} onChange={() => setEditing({ ...editing, Scopes: toggleScope(editing.Scopes, scope) })} />
                  {scope}
                </label>
              ))}
            </div>
            <input type="number" value={editing.RateLimitPerMinute} onChange={(e) => setEditing({ ...editing, RateLimitPerMinute: Number(e.target.value) })} />
            <input
              placeholder="IP cho phép, phân tách dấu phẩy (để trống = không giới hạn)"
              value={editing.AllowedIps || ''}
              onChange={(e) => setEditing({ ...editing, AllowedIps: e.target.value })}
            />
            <label className="checkbox-row">
              <input type="checkbox" checked={editing.IsActive} onChange={(e) => setEditing({ ...editing, IsActive: e.target.checked })} /> Hoạt động
            </label>
            <div className="modal-actions">
              <button type="button" onClick={saveEdit}>Lưu</button>
              <button type="button" onClick={() => setEditing(null)}>Huỷ</button>
            </div>
          </div>
        </div>
      )}

      {accessFor && (
        <div className="modal">
          <div className="modal-body">
            <h3>Báo cáo được gọi — {accessFor.Name}</h3>
            <p>
              Mặc định đối tác KHÔNG gọi được báo cáo nào dù có scope <code>reports</code> — chỉ những
              báo cáo tick dưới đây mới gọi được qua <code>GET /api/v1/reports/:reportId/run</code>.
            </p>
            {!reports.length && <p className="empty-message">Chưa có báo cáo nào trong danh mục — thêm ở trang "Báo cáo" trước.</p>}
            <div className="scope-picker">
              {reports.map(r => (
                <label key={r.ReportId} className="checkbox-row">
                  <input type="checkbox" checked={accessReportIds.includes(r.ReportId)} onChange={() => toggleReportAccess(r.ReportId)} />
                  {r.Title} ({r.ReportId})
                </label>
              ))}
            </div>
            <div className="modal-actions">
              <button type="button" onClick={saveReportAccess}>Lưu</button>
              <button type="button" onClick={() => setAccessFor(null)}>Huỷ</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
