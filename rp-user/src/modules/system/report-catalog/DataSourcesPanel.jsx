// modules/system/report-catalog/DataSourcesPanel.jsx — Nguồn dữ liệu bổ sung
// (app.ReportDataSources) — chỉ dùng khi một báo cáo cần đọc từ máy chủ khác
// Data Warehouse mặc định (xem ReportCatalogPanel — chọn DataSourceId).
import { useEffect, useState } from 'react';
import { api } from '../../../lib/api';
import DataTable from '../../../components/DataTable';

const EMPTY_FORM = { name: '', server: '', port: 1433, databaseName: '', username: '', password: '', encrypt: true, trustServerCert: false };

export default function DataSourcesPanel() {
  const [sources, setSources] = useState([]);
  const [form, setForm] = useState(EMPTY_FORM);
  const [testResult, setTestResult] = useState('');
  const [error, setError] = useState('');

  function reload() {
    api.get('/system/data-sources').then(setSources).catch(err => setError(err.message));
  }
  useEffect(reload, []);

  async function testConnection() {
    setTestResult('Đang kiểm tra...');
    try {
      await api.post('/system/data-sources/test', form);
      setTestResult('✅ Kết nối thành công');
    } catch (err) {
      setTestResult(`⛔ ${err.message}`);
    }
  }

  async function createSource(e) {
    e.preventDefault();
    setError('');
    try {
      await api.post('/system/data-sources', form);
      setForm(EMPTY_FORM);
      setTestResult('');
      reload();
    } catch (err) { setError(err.message); }
  }

  async function deleteSource(source) {
    if (!confirm(`Xoá nguồn "${source.Name}"?`)) return;
    try {
      await api.del(`/system/data-sources/${source.Id}`);
      reload();
    } catch (err) { setError(err.message); }
  }

  return (
    <div>
      {error && <p className="form-error">{error}</p>}

      <form className="stacked-form" onSubmit={createSource}>
        <input placeholder="Tên nguồn" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
        <input placeholder="Server" value={form.server} onChange={(e) => setForm({ ...form, server: e.target.value })} required />
        <input placeholder="Port" type="number" value={form.port} onChange={(e) => setForm({ ...form, port: Number(e.target.value) })} />
        <input placeholder="Database" value={form.databaseName} onChange={(e) => setForm({ ...form, databaseName: e.target.value })} required />
        <input placeholder="Username" value={form.username} onChange={(e) => setForm({ ...form, username: e.target.value })} required />
        <input placeholder="Password" type="password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} required />
        <label className="checkbox-row"><input type="checkbox" checked={form.encrypt} onChange={(e) => setForm({ ...form, encrypt: e.target.checked })} /> Encrypt</label>
        <label className="checkbox-row"><input type="checkbox" checked={form.trustServerCert} onChange={(e) => setForm({ ...form, trustServerCert: e.target.checked })} /> Trust server certificate</label>
        <div className="inline-actions">
          <button type="button" onClick={testConnection}>Kiểm tra kết nối</button>
          <button type="submit">Lưu nguồn dữ liệu</button>
        </div>
        {testResult && <p>{testResult}</p>}
      </form>

      <DataTable
        columns={[
          { key: 'Id', label: 'Id' }, // báo cáo SourceType='composite' có thể cần số Id này (blocks[].dataSourceId) — không có UI có cấu trúc riêng, xem rp-server/README.md
          { key: 'Name', label: 'Tên' },
          { key: 'Server', label: 'Server' },
          { key: 'DatabaseName', label: 'Database' },
          { key: 'actions', label: '', render: (s) => <button type="button" onClick={() => deleteSource(s)}>Xoá</button> }
        ]}
        rows={sources}
      />
    </div>
  );
}
