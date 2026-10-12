// modules/system/report-catalog/ExternalConnectionsPanel.jsx — Kết nối tới
// API do ĐỐI TÁC BÊN NGOÀI xây dựng (app.ExternalApiConnections) — dùng khi
// một báo cáo có SourceType 'externalApi'. Khác ApiConnectionsPanel (đó luôn
// là API Server CỦA CHÍNH MÌNH, chỉ cần URL + 1 key cố định): ở đây cách xác
// thực tuỳ đối tác (AuthType), nên form đổi trường theo lựa chọn.
import { useEffect, useState } from 'react';
import { api } from '../../../lib/api';
import DataTable from '../../../components/DataTable';
import { useRowSelection } from '../../../lib/useRowSelection';

const EMPTY_FORM = { name: '', baseUrl: '', authType: 'none', authKeyName: '', authValue: '', authUsername: '', authPassword: '', tokenUrl: '' };
const AUTH_TYPE_LABELS = {
  none: 'Không xác thực',
  headerKey: 'Header tuỳ chọn (API key/Bearer token)',
  queryParam: 'Tham số query string',
  basicAuth: 'Basic Auth (username/password)',
  oauth2ClientCredentials: 'OAuth2 Client Credentials',
  hmacSignature: 'HMAC ký từng request'
};
// Nhãn 2 ô authKeyName/authValue đổi theo AuthType — cùng 2 cột CSDL, khác ý nghĩa.
const KEY_VALUE_LABELS = {
  headerKey: ['Tên header (vd X-Api-Key hoặc Authorization)', 'Giá trị (vd API key, hoặc "Bearer xxx")'],
  queryParam: ['Tên tham số query string (vd api_key)', 'Giá trị'],
  oauth2ClientCredentials: ['Client ID', 'Client Secret'],
  hmacSignature: ['Key ID (định danh công khai gửi kèm mỗi request)', 'Secret (dùng để ký, KHÔNG gửi qua mạng)']
};

export default function ExternalConnectionsPanel() {
  const [connections, setConnections] = useState([]);
  const [form, setForm] = useState(EMPTY_FORM);
  const [testResult, setTestResult] = useState('');
  const [error, setError] = useState('');
  const [testingId, setTestingId] = useState(null);
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState(null);
  // Sửa (bản 9.10) — TÁI DÙNG nguyên form tạo mới (các trường xác thực đổi
  // theo AuthType) làm form sửa, qua editingId (Id đang sửa, null = đang
  // tạo mới) — field bí mật (authValue/authPassword) để TRỐNG SẴN khi mở
  // sửa (route PUT giữ nguyên bí mật cũ nếu để trống, xem backend).
  const [editingId, setEditingId] = useState(null);
  const [duplicating, setDuplicating] = useState(null); // { connection, newName } đang nhân bản, hoặc null
  const [savingDuplicate, setSavingDuplicate] = useState(false);
  const selection = useRowSelection();
  const [bulkDeleting, setBulkDeleting] = useState(false);

  function reload() {
    api.get('/system/external-connections').then(setConnections).catch(err => setError(err.message));
  }
  useEffect(reload, []);

  async function testConnection(conn) {
    setTestResult('Đang kiểm tra...');
    setTestingId(conn.Id);
    try {
      const { status } = await api.post(`/system/external-connections/${conn.Id}/test`);
      setTestResult(`✅ Máy chủ phản hồi (HTTP ${status}) — chỉ xác nhận địa chỉ đúng, KHÔNG đảm bảo đường dẫn/khoá bạn khai trong báo cáo là đúng.`);
    } catch (err) {
      setTestResult(`⛔ ${err.message}`);
    } finally {
      setTestingId(null);
    }
  }

  function openEdit(c) {
    setError('');
    setEditingId(c.Id);
    setForm({
      name: c.Name, baseUrl: c.BaseUrl, authType: c.AuthType || 'none',
      authKeyName: c.AuthKeyName || '', authValue: '', // bí mật để trống — PUT giữ nguyên nếu không gõ gì
      authUsername: c.AuthUsername || '', authPassword: '', tokenUrl: c.TokenUrl || ''
    });
  }

  function cancelEdit() {
    setEditingId(null);
    setForm(EMPTY_FORM);
    setTestResult('');
  }

  async function submitForm(e) {
    e.preventDefault();
    setError('');
    setSaving(true);
    try {
      if (editingId) await api.put(`/system/external-connections/${editingId}`, form);
      else await api.post('/system/external-connections', form);
      cancelEdit();
      reload();
    } catch (err) { setError(err.message); } finally { setSaving(false); }
  }

  function openDuplicate(c) {
    setDuplicating({ connection: c, newName: `${c.Name} (bản sao)` });
  }

  async function saveDuplicate(e) {
    e.preventDefault();
    setError('');
    setSavingDuplicate(true);
    try {
      await api.post(`/system/external-connections/${duplicating.connection.Id}/duplicate`, { name: duplicating.newName });
      setDuplicating(null);
      reload();
    } catch (err) { setError(err.message); } finally { setSavingDuplicate(false); }
  }

  async function deleteConnection(c) {
    if (!confirm(`Xoá kết nối "${c.Name}"?`)) return;
    setDeletingId(c.Id);
    try {
      await api.del(`/system/external-connections/${c.Id}`);
      reload();
    } catch (err) { setError(err.message); } finally { setDeletingId(null); }
  }

  async function deleteSelected() {
    if (selection.selectedIds.size === 0) return;
    if (!confirm(`Xoá ${selection.selectedIds.size} kết nối đã chọn?`)) return;
    setBulkDeleting(true);
    try {
      for (const id of selection.selectedIds) {
        await api.del(`/system/external-connections/${id}`);
      }
      selection.clear();
      reload();
    } catch (err) { setError(err.message); } finally { setBulkDeleting(false); }
  }

  const keyValueLabels = KEY_VALUE_LABELS[form.authType];

  return (
    <div>
      <p>
        Dùng cho báo cáo lấy dữ liệu <strong>trực tiếp từ API của đối tác</strong> (SourceType &quot;externalApi&quot;
        {' '}bên tab &quot;Báo cáo&quot;) — KHÔNG qua API Server. Vì đây là hệ thống không do HCRC kiểm soát, chọn đúng cách
        xác thực API đối tác yêu cầu. &quot;HMAC ký từng request&quot; dùng đúng quy ước api-server của chính bạn
        đang xác minh — chỉ khớp nếu đối tác cũng theo quy ước đó (chuỗi ký method+path+timestamp+body, HMAC-SHA256
        hex qua header X-Key-Id/X-Timestamp/X-Signature); đối tác có quy ước ký khác cần code riêng.
      </p>
      {error && <p className="form-error">{error}</p>}

      <form className="stacked-form" onSubmit={submitForm}>
        {editingId && <p className="hint">Đang sửa kết nối — để trống ô bí mật (API key/mật khẩu/client secret) để giữ nguyên giá trị đã lưu.</p>}
        <input placeholder="Tên kết nối" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
        <input placeholder="Base URL (vd https://api.doitac.vn)" value={form.baseUrl} onChange={(e) => setForm({ ...form, baseUrl: e.target.value })} required />

        <select value={form.authType} onChange={(e) => setForm({ ...form, authType: e.target.value })}>
          {Object.entries(AUTH_TYPE_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
        </select>

        {keyValueLabels && (
          <>
            <input
              placeholder={keyValueLabels[0]}
              value={form.authKeyName}
              onChange={(e) => setForm({ ...form, authKeyName: e.target.value })}
              required
            />
            <input
              placeholder={editingId ? `${keyValueLabels[1]} (để trống = giữ nguyên)` : keyValueLabels[1]}
              type="password"
              value={form.authValue}
              onChange={(e) => setForm({ ...form, authValue: e.target.value })}
              required={!editingId}
            />
          </>
        )}

        {form.authType === 'oauth2ClientCredentials' && (
          <input
            placeholder="Token URL (endpoint đối tác cấp access token, vd https://api.doitac.vn/oauth/token)"
            value={form.tokenUrl}
            onChange={(e) => setForm({ ...form, tokenUrl: e.target.value })}
            required
          />
        )}

        {form.authType === 'basicAuth' && (
          <>
            <input placeholder="Username" value={form.authUsername} onChange={(e) => setForm({ ...form, authUsername: e.target.value })} required />
            <input
              placeholder={editingId ? 'Password (để trống = giữ nguyên)' : 'Password'}
              type="password"
              value={form.authPassword}
              onChange={(e) => setForm({ ...form, authPassword: e.target.value })}
              required={!editingId}
            />
          </>
        )}

        <div className="inline-actions">
          <button type="submit" disabled={saving}>{saving ? 'Đang lưu...' : (editingId ? 'Cập nhật kết nối' : 'Lưu kết nối')}</button>
          {editingId && <button type="button" onClick={cancelEdit}>Huỷ</button>}
        </div>
      </form>

      <DataTable
        columns={[
          { key: 'Name', label: 'Tên' },
          { key: 'BaseUrl', label: 'Base URL' },
          { key: 'AuthType', label: 'Xác thực', render: (c) => AUTH_TYPE_LABELS[c.AuthType] || c.AuthType },
          {
            key: 'actions', label: '', render: (c) => (
              <>
                <button type="button" onClick={() => testConnection(c)} disabled={testingId === c.Id}>{testingId === c.Id ? 'Đang kiểm tra...' : 'Kiểm tra kết nối'}</button>{' '}
                <button type="button" onClick={() => openEdit(c)}>Sửa</button>{' '}
                <button type="button" onClick={() => openDuplicate(c)}>Nhân bản</button>{' '}
                <button type="button" onClick={() => deleteConnection(c)} disabled={deletingId === c.Id}>{deletingId === c.Id ? 'Đang xoá...' : 'Xoá'}</button>
              </>
            )
          }
        ]}
        rows={connections}
        selection={selection}
      />

      {selection.selectedIds.size > 0 && (
        <div className="inline-actions">
          <button type="button" onClick={deleteSelected} disabled={bulkDeleting}>
            {bulkDeleting ? 'Đang xoá...' : `Xoá ${selection.selectedIds.size} mục đã chọn`}
          </button>
        </div>
      )}
      {testResult && <p>{testResult}</p>}

      {duplicating && (
        <div className="modal">
          <div className="modal-body">
            <h3>Nhân bản "{duplicating.connection.Name}"</h3>
            <p className="hint">
              Tạo 1 kết nối MỚI giống hệt kết nối này — giữ nguyên Base URL, cách xác thực và mọi
              bí mật đã khai (key/secret/mật khẩu). Chỉ cần đặt tên khác.
            </p>
            <form className="stacked-form" onSubmit={saveDuplicate}>
              <input
                placeholder="Tên kết nối mới"
                value={duplicating.newName}
                onChange={(e) => setDuplicating({ ...duplicating, newName: e.target.value })}
                required
                autoFocus
              />
              <p className="hint">🔒 Mọi bí mật được sao chép nguyên dạng đã mã hoá ở máy chủ — không hiện ra, không đi qua trình duyệt lúc nhân bản.</p>
              <div className="inline-actions">
                <button type="submit" disabled={savingDuplicate}>{savingDuplicate ? 'Đang nhân bản...' : 'Tạo bản sao'}</button>
                <button type="button" onClick={() => setDuplicating(null)}>Huỷ</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
