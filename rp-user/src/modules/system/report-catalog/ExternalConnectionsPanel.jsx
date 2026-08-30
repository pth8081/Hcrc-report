// modules/system/report-catalog/ExternalConnectionsPanel.jsx — Kết nối tới
// API do ĐỐI TÁC BÊN NGOÀI xây dựng (app.ExternalApiConnections) — dùng khi
// một báo cáo có SourceType 'externalApi'. Khác ApiConnectionsPanel (đó luôn
// là API Server CỦA CHÍNH MÌNH, chỉ cần URL + 1 key cố định): ở đây cách xác
// thực tuỳ đối tác (AuthType), nên form đổi trường theo lựa chọn.
import { useEffect, useState } from 'react';
import { api } from '../../../lib/api';
import DataTable from '../../../components/DataTable';

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

  function reload() {
    api.get('/system/external-connections').then(setConnections).catch(err => setError(err.message));
  }
  useEffect(reload, []);

  async function testConnection(conn) {
    setTestResult('Đang kiểm tra...');
    try {
      const { status } = await api.post(`/system/external-connections/${conn.Id}/test`);
      setTestResult(`✅ Máy chủ phản hồi (HTTP ${status}) — chỉ xác nhận địa chỉ đúng, KHÔNG đảm bảo đường dẫn/khoá bạn khai trong báo cáo là đúng.`);
    } catch (err) {
      setTestResult(`⛔ ${err.message}`);
    }
  }

  async function createConnection(e) {
    e.preventDefault();
    setError('');
    try {
      await api.post('/system/external-connections', form);
      setForm(EMPTY_FORM);
      setTestResult('');
      reload();
    } catch (err) { setError(err.message); }
  }

  async function deleteConnection(c) {
    if (!confirm(`Xoá kết nối "${c.Name}"?`)) return;
    try {
      await api.del(`/system/external-connections/${c.Id}`);
      reload();
    } catch (err) { setError(err.message); }
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

      <form className="stacked-form" onSubmit={createConnection}>
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
              placeholder={keyValueLabels[1]}
              type="password"
              value={form.authValue}
              onChange={(e) => setForm({ ...form, authValue: e.target.value })}
              required
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
            <input placeholder="Password" type="password" value={form.authPassword} onChange={(e) => setForm({ ...form, authPassword: e.target.value })} required />
          </>
        )}

        <button type="submit">Lưu kết nối</button>
      </form>

      <DataTable
        columns={[
          { key: 'Name', label: 'Tên' },
          { key: 'BaseUrl', label: 'Base URL' },
          { key: 'AuthType', label: 'Xác thực', render: (c) => AUTH_TYPE_LABELS[c.AuthType] || c.AuthType },
          {
            key: 'actions', label: '', render: (c) => (
              <>
                <button type="button" onClick={() => testConnection(c)}>Kiểm tra kết nối</button>{' '}
                <button type="button" onClick={() => deleteConnection(c)}>Xoá</button>
              </>
            )
          }
        ]}
        rows={connections}
      />
      {testResult && <p>{testResult}</p>}
    </div>
  );
}
