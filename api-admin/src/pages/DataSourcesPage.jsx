// pages/DataSourcesPage.jsx — Trang "Nguồn dữ liệu": CRUD api.DataSources
// (kết nối CSDL OLTP thật, thay OLTP_* tĩnh trong .env). Gán nguồn cho từng
// endpoint realtime KHÔNG còn ở đây — xem trang "Endpoint realtime"
// (RealtimeEndpointsPage.jsx), nơi 1 endpoint chọn nguồn NGAY khi tạo, cùng
// lúc chọn bảng/cột. Chỉ vai trò admin sửa được.
import { useEffect, useState } from 'react';
import { api } from '../lib/api';
import { useAuth } from '../lib/AuthContext';
import DataTable from '../components/DataTable';

const EMPTY_FORM = { name: '', server: '', port: 1433, databaseName: '', username: '', password: '', encrypt: true, trustServerCert: false };

export default function DataSourcesPage() {
  const { isAdmin } = useAuth();
  const [sources, setSources] = useState([]);
  const [form, setForm] = useState(EMPTY_FORM);
  const [testResult, setTestResult] = useState('');
  const [error, setError] = useState('');
  const [importFile, setImportFile] = useState(null);
  const [importResult, setImportResult] = useState(null);
  const [importError, setImportError] = useState('');

  function reload() {
    api.get('/data-sources').then(setSources).catch(err => setError(err.message));
  }
  useEffect(reload, []);

  async function submitImport(e) {
    e.preventDefault();
    setImportError('');
    setImportResult(null);
    if (!importFile) return setImportError('Chọn file .xlsx trước');

    const formData = new FormData();
    formData.append('file', importFile);
    try {
      const result = await api.post('/data-sources/import', formData, true);
      setImportResult(result);
      setImportFile(null);
      reload();
    } catch (err) {
      setImportError(err.message);
    }
  }

  async function testConnection() {
    setTestResult('Đang kiểm tra...');
    try {
      await api.post('/data-sources/test', form);
      setTestResult('✅ Kết nối thành công');
    } catch (err) {
      setTestResult(`⛔ ${err.message}`);
    }
  }

  // Lưu xong route TỰ ĐỘNG test kết nối luôn (không cần bấm "Kiểm tra kết
  // nối" trước nữa) — không chặn lưu nếu kết nối lỗi, chỉ hiển thị kết quả
  // ngay để tự sửa hoặc để đó chờ hạ tầng sẵn sàng.
  async function createSource(e) {
    e.preventDefault();
    setError('');
    try {
      const result = await api.post('/data-sources', form);
      setForm(EMPTY_FORM);
      setTestResult(result.connectionTest?.ok ? '✅ Đã lưu, kết nối thành công' : `⚠️ Đã lưu, nhưng kết nối lỗi: ${result.connectionTest?.error}`);
      reload();
    } catch (err) { setError(err.message); }
  }

  async function deleteSource(source) {
    if (!confirm(`Xoá nguồn "${source.Name}"? Endpoint realtime đang dùng nguồn này sẽ lỗi cho tới khi đổi sang nguồn khác.`)) return;
    try {
      await api.del(`/data-sources/${source.Id}`);
      reload();
    } catch (err) { setError(err.message); }
  }

  return (
    <div className="page">
      <h1>Nguồn dữ liệu</h1>
      <p>Kết nối tới các CSDL OLTP thật — dùng làm nguồn cho endpoint realtime (xem trang &quot;Endpoint realtime&quot;).</p>
      {error && <p className="form-error">{error}</p>}

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

          <h3>Nhập hàng loạt</h3>
          <p>
            Tải lên file Excel (.xlsx) để tạo/sửa NHIỀU nguồn cùng lúc — dùng khi cần khai
            báo kết nối cho nhiều chi nhánh cùng cấu trúc. Dòng 1 là header, cột bắt buộc:{' '}
            <code>Name</code>, <code>Server</code>, <code>DatabaseName</code>, <code>Username</code>,{' '}
            <code>Password</code>. Cột tuỳ chọn: <code>Port</code>, <code>Encrypt</code>,{' '}
            <code>TrustServerCert</code> (để trống dùng mặc định).
          </p>
          <p>
            Khoá để CẬP NHẬT thay vì tạo trùng là <code>Name</code> — chạy lại file với 1 dòng
            sửa (vd đổi mật khẩu, đổi server) chỉ dòng đó đổi, các dòng khác giữ nguyên. Endpoint
            realtime đang dùng nguồn này sẽ tự nạp lại kết nối mới ngay sau khi nhập.
          </p>
          <p>
            <strong>Lưu ý:</strong> file này chứa mật khẩu THẬT dạng chữ thường (không mã hoá) —
            chỉ được mã hoá SAU khi tải lên. Xoá file khỏi máy sau khi nhập xong.
          </p>
          {importError && <p className="form-error">{importError}</p>}
          <form className="stacked-form" onSubmit={submitImport}>
            <input type="file" accept=".xlsx" onChange={(e) => setImportFile(e.target.files?.[0] ?? null)} required />
            <button type="submit">Nhập hàng loạt</button>
          </form>
          {importResult && (
            <div>
              <p>✅ Đã thêm mới {importResult.inserted}, cập nhật {importResult.updated} dòng.</p>
              {importResult.rowErrors?.length > 0 && (
                <>
                  <p>⚠️ {importResult.rowErrors.length} dòng bị bỏ qua:</p>
                  <ul>{importResult.rowErrors.map((e, i) => <li key={i}>{e}</li>)}</ul>
                </>
              )}
              {importResult.connectionResults?.length > 0 && (
                <>
                  <p>Kết quả kiểm tra kết nối từng dòng vừa ghi:</p>
                  <ul>
                    {importResult.connectionResults.map((c, i) => (
                      <li key={i}>{c.ok ? '✅' : '⚠️'} {c.name}{c.ok ? '' : `: ${c.error}`}</li>
                    ))}
                  </ul>
                </>
              )}
            </div>
          )}
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
