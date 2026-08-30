// pages/DataSourcesPage.jsx — Trang "Nguồn dữ liệu": CRUD api.DataSources
// (thay OLTP_* tĩnh trong .env) + gán nguồn cho từng endpoint realtime
// (inventory/loyalty/vouchers). Chỉ vai trò admin sửa được.
import { useEffect, useState } from 'react';
import { api } from '../lib/api';
import { useAuth } from '../lib/AuthContext';
import DataTable from '../components/DataTable';

const EMPTY_FORM = { name: '', server: '', port: 1433, databaseName: '', username: '', password: '', encrypt: true, trustServerCert: false };
const ENDPOINT_LABELS = { inventory: 'Tồn kho (inventory)', loyalty: 'Điểm thẻ (loyalty)', vouchers: 'Voucher (vouchers)' };

export default function DataSourcesPage() {
  const { isAdmin } = useAuth();
  const [sources, setSources] = useState([]);
  const [mappings, setMappings] = useState([]);
  const [form, setForm] = useState(EMPTY_FORM);
  const [testResult, setTestResult] = useState('');
  const [error, setError] = useState('');

  function reload() {
    api.get('/data-sources').then(setSources).catch(err => setError(err.message));
    api.get('/data-sources/realtime-endpoints').then(setMappings).catch(err => setError(err.message));
  }
  useEffect(reload, []);

  async function testConnection() {
    setTestResult('Đang kiểm tra...');
    try {
      await api.post('/data-sources/test', form);
      setTestResult('✅ Kết nối thành công');
    } catch (err) {
      setTestResult(`⛔ ${err.message}`);
    }
  }

  async function createSource(e) {
    e.preventDefault();
    setError('');
    try {
      await api.post('/data-sources', form);
      setForm(EMPTY_FORM);
      setTestResult('');
      reload();
    } catch (err) { setError(err.message); }
  }

  async function deleteSource(source) {
    if (!confirm(`Xoá nguồn "${source.Name}"? Endpoint đang gán nguồn này sẽ lỗi cho tới khi gán lại.`)) return;
    try {
      await api.del(`/data-sources/${source.Id}`);
      reload();
    } catch (err) { setError(err.message); }
  }

  async function assignEndpoint(endpoint, dataSourceId) {
    if (!dataSourceId) return;
    try {
      await api.put(`/data-sources/realtime-endpoints/${endpoint}`, { dataSourceId: Number(dataSourceId) });
      reload();
    } catch (err) { setError(err.message); }
  }

  return (
    <div className="page">
      <h1>Nguồn dữ liệu</h1>
      {error && <p className="form-error">{error}</p>}

      <h3>Gán nguồn cho từng endpoint realtime</h3>
      <div className="stacked-form">
        {mappings.map(m => (
          <label key={m.endpoint}>
            <span>{ENDPOINT_LABELS[m.endpoint] || m.endpoint}</span>
            <select
              value={m.dataSourceId || ''}
              disabled={!isAdmin}
              onChange={(e) => assignEndpoint(m.endpoint, e.target.value)}
            >
              <option value="">— Chưa gán —</option>
              {sources.map(s => <option key={s.Id} value={s.Id}>{s.Name}</option>)}
            </select>
          </label>
        ))}
      </div>

      {isAdmin && (
        <>
          <h3>Thêm nguồn mới</h3>
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
        </>
      )}

      <DataTable
        columns={[
          { key: 'Name', label: 'Tên' },
          { key: 'Server', label: 'Server' },
          { key: 'DatabaseName', label: 'Database' },
          { key: 'IsActive', label: 'Trạng thái', render: (s) => (s.IsActive ? 'Hoạt động' : 'Tắt') },
          isAdmin && { key: 'actions', label: '', render: (s) => <button type="button" onClick={() => deleteSource(s)}>Xoá</button> }
        ].filter(Boolean)}
        rows={sources}
      />
    </div>
  );
}
