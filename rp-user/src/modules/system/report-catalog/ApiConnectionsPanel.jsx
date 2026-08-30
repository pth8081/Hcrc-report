// modules/system/report-catalog/ApiConnectionsPanel.jsx — Kết nối tới API
// Server (app.ApiConnections) — dùng khi một báo cáo có SourceType
// 'apiReport'/'apiRealtime' (xem ReportCatalogPanel — chọn apiConnectionId).
// Khác DataSourcesPanel: đây là URL + API key (HTTP), không phải kết nối SQL
// Server trực tiếp.
import { useEffect, useState } from 'react';
import { api } from '../../../lib/api';
import DataTable from '../../../components/DataTable';

const EMPTY_FORM = { name: '', baseUrl: '', apiKey: '' };

export default function ApiConnectionsPanel() {
  const [connections, setConnections] = useState([]);
  const [form, setForm] = useState(EMPTY_FORM);
  const [testResult, setTestResult] = useState('');
  const [error, setError] = useState('');

  function reload() {
    api.get('/system/api-connections').then(setConnections).catch(err => setError(err.message));
  }
  useEffect(reload, []);

  async function testConnection() {
    setTestResult('Đang kiểm tra...');
    try {
      await api.post('/system/api-connections/test', { baseUrl: form.baseUrl });
      setTestResult('✅ API Server phản hồi "ok"');
    } catch (err) {
      setTestResult(`⛔ ${err.message}`);
    }
  }

  async function createConnection(e) {
    e.preventDefault();
    setError('');
    try {
      await api.post('/system/api-connections', form);
      setForm(EMPTY_FORM);
      setTestResult('');
      reload();
    } catch (err) { setError(err.message); }
  }

  async function deleteConnection(c) {
    if (!confirm(`Xoá kết nối "${c.Name}"?`)) return;
    try {
      await api.del(`/system/api-connections/${c.Id}`);
      reload();
    } catch (err) { setError(err.message); }
  }

  return (
    <div>
      <p>
        Dùng cho báo cáo lấy dữ liệu <strong>qua API Server</strong> (SourceType &quot;apiReport&quot;/&quot;apiRealtime&quot;
        {' '}bên tab &quot;Báo cáo&quot;) thay vì đọc thẳng CSDL — phù hợp khi API Server đã có sẵn kết nối realtime tới
        hệ thống nguồn. BaseUrl là gốc API Server (vd http://api-server-host:4002), ApiKey lấy từ trang
        &quot;Đối tác&quot; trên api-admin/ (cấp cho consumer &quot;rp-server&quot;).
      </p>
      {error && <p className="form-error">{error}</p>}

      <form className="stacked-form" onSubmit={createConnection}>
        <input placeholder="Tên kết nối" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
        <input placeholder="Base URL (vd http://localhost:4002)" value={form.baseUrl} onChange={(e) => setForm({ ...form, baseUrl: e.target.value })} required />
        <input placeholder="API Key" type="password" value={form.apiKey} onChange={(e) => setForm({ ...form, apiKey: e.target.value })} required />
        <div className="inline-actions">
          <button type="button" onClick={testConnection}>Kiểm tra kết nối</button>
          <button type="submit">Lưu kết nối</button>
        </div>
        {testResult && <p>{testResult}</p>}
      </form>

      <DataTable
        columns={[
          { key: 'Id', label: 'Id' }, // báo cáo SourceType='composite' cần số Id này (blocks[].apiConnectionId) — không có UI có cấu trúc riêng, xem rp-server/README.md
          { key: 'Name', label: 'Tên' },
          { key: 'BaseUrl', label: 'Base URL' },
          { key: 'actions', label: '', render: (c) => <button type="button" onClick={() => deleteConnection(c)}>Xoá</button> }
        ]}
        rows={connections}
      />
    </div>
  );
}
