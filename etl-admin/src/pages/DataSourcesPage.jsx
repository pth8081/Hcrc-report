// pages/DataSourcesPage.jsx — Trang "Nguồn dữ liệu": CRUD etl.DataSources +
// kiểm tra kết nối trước khi lưu. Chỉ vai trò admin sửa được.
import { useEffect, useState } from 'react';
import { api } from '../lib/api';
import { useAuth } from '../lib/AuthContext';
import DataTable from '../components/DataTable';
import { useRowSelection } from '../lib/useRowSelection';

const EMPTY_FORM = { name: '', engine: 'mssql', server: '', port: 1433, databaseName: '', username: '', password: '', encrypt: true, trustServerCert: false };

// Cột "Đồng bộ" — gộp trạng thái mọi job đồng bộ trỏ vào nguồn này (xem
// etl/lib/syncStatus.js). null = nguồn chưa gắn job nào.
function renderSyncStatus(syncStatus) {
  if (!syncStatus) return <span className="muted">Chưa gắn job đồng bộ</span>;
  const { lastRunAt, lastStatus, overdueJobCount } = syncStatus;
  const lastRunText = lastRunAt
    ? `${lastStatus === 'FAILED' ? '⛔' : '✅'} ${new Date(lastRunAt).toLocaleString('vi-VN')}`
    : 'Chưa chạy lần nào';
  return (
    <span>
      {lastRunText}
      {overdueJobCount > 0 && (
        <span className="form-error" title="Job đang bật nhưng quá hạn so với lịch chạy của chính nó">
          {' '}⚠️ {overdueJobCount} job quá hạn
        </span>
      )}
    </span>
  );
}

export default function DataSourcesPage() {
  const { canEdit } = useAuth();
  const isAdmin = canEdit('data-sources');
  const [sources, setSources] = useState([]);
  const [form, setForm] = useState(EMPTY_FORM);
  const [testResult, setTestResult] = useState('');
  const [error, setError] = useState('');
  const [importFile, setImportFile] = useState(null);
  const [importResult, setImportResult] = useState(null);
  const [importError, setImportError] = useState('');
  const [encImportFile, setEncImportFile] = useState(null);
  const [encImportResult, setEncImportResult] = useState(null);
  const [encImportError, setEncImportError] = useState('');
  const [exportError, setExportError] = useState('');
  const [exportingPlain, setExportingPlain] = useState(false);
  const [editing, setEditing] = useState(null); // { ...source, password: '' } đang sửa, hoặc null
  const [downloadingTemplate, setDownloadingTemplate] = useState(false);
  const [importing, setImporting] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [importingEncrypted, setImportingEncrypted] = useState(false);
  const [testing, setTesting] = useState(false);
  const [savingSource, setSavingSource] = useState(false);
  const [togglingId, setTogglingId] = useState(null);
  const [savingEdit, setSavingEdit] = useState(false);
  const [deletingId, setDeletingId] = useState(null);
  // Chọn nhiều + xoá hàng loạt (bản 8.62) + bật/tắt hàng loạt (bản 8.80,
  // theo yêu cầu người dùng).
  const selection = useRowSelection();
  const [bulkDeleting, setBulkDeleting] = useState(false);
  const [bulkEnabling, setBulkEnabling] = useState(false);
  const [bulkDisabling, setBulkDisabling] = useState(false);

  function reload() {
    api.get('/data-sources').then(setSources).catch(err => setError(err.message));
  }
  useEffect(reload, []);

  async function downloadTemplate() {
    setImportError('');
    setDownloadingTemplate(true);
    try {
      await api.downloadFile('/data-sources/template', 'mau-nguon-du-lieu.xlsx');
    } catch (err) {
      setImportError(err.message);
    } finally {
      setDownloadingTemplate(false);
    }
  }

  // Xuất Excel THƯỜNG (chưa mã hoá) — bản 8.77, theo yêu cầu người dùng —
  // khác "Tải file mẫu" (chỉ 1 dòng ví dụ trống): xuất ĐÚNG danh sách nguồn
  // hiện có, cột Password luôn để trống (xem etl/lib/dataSourcesImport.js:
  // exportDataSourcesPlain) — sửa xong nộp thẳng lại qua "Nhập hàng loạt" ở
  // trên, để trống Password = giữ nguyên mật khẩu cũ.
  async function exportPlain() {
    setImportError('');
    setExportingPlain(true);
    try {
      await api.downloadFile('/data-sources/export-plain', 'nguon-du-lieu.xlsx');
    } catch (err) {
      setImportError(err.message);
    } finally {
      setExportingPlain(false);
    }
  }

  async function submitImport(e) {
    e.preventDefault();
    setImportError('');
    setImportResult(null);
    if (!importFile) return setImportError('Chọn file .xlsx trước');

    const formData = new FormData();
    formData.append('file', importFile);
    setImporting(true);
    try {
      const result = await api.post('/data-sources/import', formData, true);
      setImportResult(result);
      setImportFile(null);
      reload();
    } catch (err) {
      setImportError(err.message);
    } finally {
      setImporting(false);
    }
  }

  async function exportEncrypted() {
    setExportError('');
    setExporting(true);
    try {
      await api.downloadFile('/data-sources/export', 'nguon-du-lieu.hcrcenc');
    } catch (err) {
      setExportError(err.message);
    } finally {
      setExporting(false);
    }
  }

  async function submitImportEncrypted(e) {
    e.preventDefault();
    setEncImportError('');
    setEncImportResult(null);
    if (!encImportFile) return setEncImportError('Chọn file .hcrcenc trước');

    const formData = new FormData();
    formData.append('file', encImportFile);
    setImportingEncrypted(true);
    try {
      const result = await api.post('/data-sources/import-encrypted', formData, true);
      setEncImportResult(result);
      setEncImportFile(null);
      reload();
    } catch (err) {
      setEncImportError(err.message);
    } finally {
      setImportingEncrypted(false);
    }
  }

  function onEngineChange(engine) {
    setForm({ ...form, engine, port: engine === 'mysql' ? 3306 : 1433 });
  }

  async function testConnection() {
    setTestResult('Đang kiểm tra...');
    setTesting(true);
    try {
      await api.post('/data-sources/test', form);
      setTestResult('✅ Kết nối thành công');
    } catch (err) {
      setTestResult(`⛔ ${err.message}`);
    } finally {
      setTesting(false);
    }
  }

  // Lưu xong route TỰ ĐỘNG test kết nối luôn (không cần bấm "Kiểm tra kết
  // nối" trước nữa) — không chặn lưu nếu kết nối lỗi, chỉ hiển thị kết quả
  // ngay để tự sửa hoặc để đó chờ hạ tầng sẵn sàng.
  function renderConnectionTest(connectionTest) {
    if (!connectionTest) return '';
    return connectionTest.ok ? '✅ Đã lưu, kết nối thành công' : `⚠️ Đã lưu, nhưng kết nối lỗi: ${connectionTest.error}`;
  }

  async function createSource(e) {
    e.preventDefault();
    setError('');
    setSavingSource(true);
    try {
      const result = await api.post('/data-sources', form);
      setForm(EMPTY_FORM);
      setTestResult(renderConnectionTest(result.connectionTest));
      reload();
    } catch (err) { setError(err.message); } finally { setSavingSource(false); }
  }

  async function toggleActive(source) {
    setTogglingId(source.Id);
    try {
      const result = await api.put(`/data-sources/${source.Id}`, {
        name: source.Name,
        server: source.Server,
        port: source.Port,
        databaseName: source.DatabaseName,
        username: source.Username,
        encrypt: source.Encrypt,
        trustServerCert: source.TrustServerCert,
        isActive: !source.IsActive
        // password bỏ trống -> route giữ nguyên mật khẩu đã lưu
      });
      setTestResult(renderConnectionTest(result.connectionTest));
      reload();
    } catch (err) { setError(err.message); } finally { setTogglingId(null); }
  }

  // Mật khẩu để trống -> route giữ nguyên mật khẩu đã lưu (không bắt gõ lại
  // mật khẩu chỉ để đổi Server/Username, đúng hành vi PUT đã có ở backend).
  function openEdit(source) {
    setEditing({ ...source, password: '' });
  }

  async function saveEdit(e) {
    e.preventDefault();
    setError('');
    setSavingEdit(true);
    try {
      const body = {
        name: editing.Name, server: editing.Server, port: editing.Port,
        databaseName: editing.DatabaseName, username: editing.Username,
        encrypt: editing.Encrypt, trustServerCert: editing.TrustServerCert,
        isActive: editing.IsActive
      };
      if (editing.password) body.password = editing.password;
      const result = await api.put(`/data-sources/${editing.Id}`, body);
      setTestResult(renderConnectionTest(result.connectionTest));
      setEditing(null);
      reload();
    } catch (err) { setError(err.message); } finally { setSavingEdit(false); }
  }

  // Xoá 1 nguồn — nếu còn job đồng bộ tham chiếu (etl.SyncJobs.DataSourceId),
  // route TỪ CHỐI mặc định, trả kèm `blockingJobs` (tên từng job, bản 8.80,
  // theo yêu cầu người dùng — thực tế gặp "đã tắt cả nguồn và job mà không
  // xoá được"). Hỏi RIÊNG 1 lần nữa "Xoá CẢ N job này?" — xác nhận ĐÚNG tên
  // từng job trước khi xoá kèm (`cascadeJobs: true`), KHÔNG tự ý xoá job nào
  // mà không hỏi lại — giữ đúng tinh thần "không bao giờ âm thầm" của bản
  // 8.76, chỉ gộp 2 bước (xoá job + xoá nguồn) vào 1 lượt thay vì bắt người
  // dùng tự qua trang "Đồng bộ" xoá job trước rồi quay lại xoá nguồn.
  async function deleteSource(source) {
    if (!confirm(`Xoá nguồn "${source.Name}"?`)) return;
    setDeletingId(source.Id);
    try {
      await api.del(`/data-sources/${source.Id}`);
      reload();
    } catch (err) {
      const blockingJobs = err.data?.blockingJobs;
      if (blockingJobs?.length) {
        const names = blockingJobs.map((j) => j.name).join(', ');
        if (confirm(`Nguồn "${source.Name}" còn ${blockingJobs.length} job đồng bộ đang dùng: ${names}.\n\nXoá CẢ ${blockingJobs.length} job này CÙNG LÚC với nguồn?`)) {
          try {
            await api.del(`/data-sources/${source.Id}`, { cascadeJobs: true });
            reload();
          } catch (err2) { setError(err2.message); }
        } else {
          setError(err.message);
        }
      } else {
        setError(err.message);
      }
    } finally { setDeletingId(null); }
  }

  // Xoá hàng loạt (bản 8.62, sửa KHẢ NĂNG CHỊU LỖI ở bản 8.80 — theo yêu
  // cầu người dùng, báo cáo "xoá nhiều không được"): TRƯỚC ĐÂY vòng lặp
  // dừng NGAY ở mục đầu tiên bị chặn (vd còn job đồng bộ tham chiếu, xem
  // routes/admin/dataSources.js DELETE — bản 8.76), khiến các mục SAU
  // trong danh sách chọn KHÔNG được thử xoá, mà người dùng không biết mục
  // nào đã xoá/mục nào bị chặn vì sao. Giờ thử XOÁ TỪNG MỤC ĐỘC LẬP (lỗi 1
  // mục không chặn các mục còn lại), gộp báo lỗi rõ ràng cuối cùng.
  async function deleteSelected() {
    if (selection.selectedIds.size === 0) return;
    if (!confirm(`Xoá ${selection.selectedIds.size} nguồn đã chọn?`)) return;
    setBulkDeleting(true);
    const failed = [];
    try {
      for (const id of selection.selectedIds) {
        try {
          await api.del(`/data-sources/${id}`);
        } catch (err) {
          const src = sources.find((s) => s.Id === id);
          failed.push(`${src?.Name || id}: ${err.message}`);
        }
      }
      setError(failed.length ? `Không xoá được ${failed.length} nguồn — ${failed.join('; ')}` : '');
      selection.clear();
      reload();
    } finally { setBulkDeleting(false); }
  }

  // Bật/tắt hàng loạt (bản 8.80, theo yêu cầu người dùng) — gọi LẶP LẠI
  // đúng PUT /:id đã có (như nút "Bật"/"Tắt" từng dòng), chỉ ép isActive
  // THEO Ý MUỐN (không phải đảo ngược từng dòng — chọn 5 nguồn trạng thái
  // khác nhau, bấm "Bật" phải làm CẢ 5 cùng bật, không phải đảo ngược
  // riêng từng dòng). Lỗi 1 mục không chặn các mục còn lại, cùng tinh thần
  // deleteSelected() ở trên.
  async function setActiveForSelected(forceActive) {
    if (selection.selectedIds.size === 0) return;
    const setBusy = forceActive ? setBulkEnabling : setBulkDisabling;
    setBusy(true);
    const failed = [];
    try {
      for (const id of selection.selectedIds) {
        const source = sources.find((s) => s.Id === id);
        if (!source) continue;
        try {
          await api.put(`/data-sources/${id}`, {
            name: source.Name, server: source.Server, port: source.Port,
            databaseName: source.DatabaseName, username: source.Username,
            encrypt: source.Encrypt, trustServerCert: source.TrustServerCert,
            isActive: forceActive
            // password bỏ trống -> route giữ nguyên mật khẩu đã lưu
          });
        } catch (err) {
          failed.push(`${source.Name}: ${err.message}`);
        }
      }
      setError(failed.length ? `Không cập nhật được ${failed.length} nguồn — ${failed.join('; ')}` : '');
      selection.clear();
      reload();
    } finally { setBusy(false); }
  }

  return (
    <div className="page">
      <h1>Nguồn dữ liệu</h1>
      {error && <p className="form-error">{error}</p>}
      {testResult && <p>{testResult}</p>}

      {isAdmin && (
        <form className="stacked-form" onSubmit={createSource}>
          <input placeholder="Tên nguồn" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
          <select value={form.engine} onChange={(e) => onEngineChange(e.target.value)}>
            <option value="mssql">SQL Server</option>
            <option value="mysql">MySQL / MariaDB</option>
          </select>
          <input placeholder="Server" value={form.server} onChange={(e) => setForm({ ...form, server: e.target.value })} required />
          <input placeholder="Port" type="number" value={form.port} onChange={(e) => setForm({ ...form, port: Number(e.target.value) })} />
          <input placeholder="Database" value={form.databaseName} onChange={(e) => setForm({ ...form, databaseName: e.target.value })} required />
          <input placeholder="Username" value={form.username} onChange={(e) => setForm({ ...form, username: e.target.value })} required />
          <input placeholder="Password" type="password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} required />
          <label className="checkbox-row"><input type="checkbox" checked={form.encrypt} onChange={(e) => setForm({ ...form, encrypt: e.target.checked })} /> Mã hoá kết nối</label>
          <label className="checkbox-row"><input type="checkbox" checked={form.trustServerCert} onChange={(e) => setForm({ ...form, trustServerCert: e.target.checked })} /> Tin chứng chỉ tự ký</label>
          <div className="inline-actions">
            <button type="button" onClick={testConnection} disabled={testing}>{testing ? 'Đang kiểm tra...' : 'Kiểm tra kết nối'}</button>
            <button type="submit" disabled={savingSource}>{savingSource ? 'Đang lưu...' : 'Lưu nguồn dữ liệu'}</button>
          </div>
        </form>
      )}

      {isAdmin && (
        <>
          <h2>Nhập hàng loạt</h2>
          <p>
            Tải lên file Excel (.xlsx) để tạo/sửa NHIỀU nguồn cùng lúc — dùng khi cần khai
            báo kết nối cho nhiều chi nhánh cùng cấu trúc. Dòng 1 là header, cột bắt buộc:{' '}
            <code>Name</code>, <code>Server</code>, <code>DatabaseName</code>, <code>Username</code>.
            Cột tuỳ chọn: <code>Password</code> (để trống = GIỮ NGUYÊN mật khẩu cũ, chỉ bắt
            buộc khi "Name" đó CHƯA từng tạo), <code>Engine</code> (<code>mssql</code> hoặc{' '}
            <code>mysql</code>, mặc định <code>mssql</code>), <code>Port</code>, <code>Encrypt</code>,{' '}
            <code>TrustServerCert</code> (để trống dùng mặc định).
          </p>
          <p>
            Khoá để CẬP NHẬT thay vì tạo trùng là <code>Name</code> — chạy lại file với 1 dòng
            sửa (vd đổi server, đổi database) chỉ dòng đó đổi, các dòng khác giữ nguyên. Nguồn
            đang được job đồng bộ dùng sẽ tự nạp lại kết nối mới ngay sau khi nhập.
          </p>
          <p>
            <strong>Lưu ý:</strong> nếu điền cột <code>Password</code>, file này chứa mật khẩu
            THẬT dạng chữ thường (không mã hoá) — chỉ được mã hoá SAU khi tải lên. Xoá file khỏi
            máy sau khi nhập xong. Để trống cột này (dùng "Xuất Excel" bên dưới) thì file KHÔNG
            chứa mật khẩu nào.
          </p>
          {importError && <p className="form-error">{importError}</p>}
          <div className="inline-actions">
            <button type="button" onClick={downloadTemplate} disabled={downloadingTemplate}>
              {downloadingTemplate ? 'Đang tải...' : 'Tải file mẫu'}
            </button>
            <button type="button" onClick={exportPlain} disabled={exportingPlain}>
              {exportingPlain ? 'Đang xuất...' : 'Xuất Excel (danh sách hiện có, chưa mã hoá)'}
            </button>
          </div>
          <form className="stacked-form" onSubmit={submitImport}>
            <input type="file" accept=".xlsx" onChange={(e) => setImportFile(e.target.files?.[0] ?? null)} required />
            <button type="submit" disabled={importing}>{importing ? 'Đang nhập...' : 'Nhập hàng loạt'}</button>
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

          <h2>Xuất / Nhập file mã hoá</h2>
          <p>
            Khác Nhập hàng loạt ở trên (file Excel đọc được, chứa mật khẩu thật) — mục này
            xuất/nhập TOÀN BỘ danh sách nguồn dưới dạng 1 file <strong>mã hoá</strong>{' '}
            (<code>.hcrcenc</code>), không mở được bằng Excel hay bất kỳ công cụ nào khác —
            chỉ chính hệ thống này giải mã lại được. Dùng để sao lưu/di chuyển cấu hình kết
            nối nhiều chi nhánh mà không lộ mật khẩu thật ở bất kỳ bước nào — an toàn hơn
            khi cần lưu file lại hoặc gửi qua nơi khác.
          </p>
          {exportError && <p className="form-error">{exportError}</p>}
          <div className="inline-actions">
            <button type="button" onClick={exportEncrypted} disabled={exporting}>{exporting ? 'Đang xuất...' : 'Xuất file mã hoá'}</button>
          </div>

          {encImportError && <p className="form-error">{encImportError}</p>}
          <form className="stacked-form" onSubmit={submitImportEncrypted}>
            <input type="file" accept=".hcrcenc" onChange={(e) => setEncImportFile(e.target.files?.[0] ?? null)} required />
            <button type="submit" disabled={importingEncrypted}>{importingEncrypted ? 'Đang nhập...' : 'Nhập file mã hoá'}</button>
          </form>
          {encImportResult && (
            <p>✅ Đã thêm mới {encImportResult.inserted}, cập nhật {encImportResult.updated} dòng.</p>
          )}
        </>
      )}

      <DataTable
        columns={[
          { key: 'Name', label: 'Tên' },
          { key: 'Engine', label: 'Loại', render: (s) => (s.Engine === 'mysql' ? 'MySQL/MariaDB' : 'SQL Server') },
          { key: 'Server', label: 'Server' },
          { key: 'DatabaseName', label: 'Database' },
          { key: 'IsActive', label: 'Trạng thái', render: (s) => (s.IsActive ? 'Hoạt động' : 'Tắt') },
          { key: 'SyncStatus', label: 'Đồng bộ', render: (s) => renderSyncStatus(s.SyncStatus) },
          isAdmin && {
            key: 'actions', label: '', render: (s) => (
              <>
                <button type="button" onClick={() => openEdit(s)}>Sửa</button>{' '}
                <button type="button" onClick={() => toggleActive(s)} disabled={togglingId === s.Id}>
                  {togglingId === s.Id ? 'Đang xử lý...' : (s.IsActive ? 'Tắt' : 'Bật')}
                </button>{' '}
                <button type="button" onClick={() => deleteSource(s)} disabled={deletingId === s.Id}>
                  {deletingId === s.Id ? 'Đang xoá...' : 'Xoá'}
                </button>
              </>
            )
          }
        ].filter(Boolean)}
        rows={sources}
        selection={isAdmin ? selection : null}
      />

      {isAdmin && selection.selectedIds.size > 0 && (
        <div className="inline-actions">
          <button type="button" onClick={() => setActiveForSelected(true)} disabled={bulkEnabling || bulkDisabling || bulkDeleting}>
            {bulkEnabling ? 'Đang bật...' : `Bật ${selection.selectedIds.size} nguồn đã chọn`}
          </button>
          <button type="button" onClick={() => setActiveForSelected(false)} disabled={bulkEnabling || bulkDisabling || bulkDeleting}>
            {bulkDisabling ? 'Đang tắt...' : `Tắt ${selection.selectedIds.size} nguồn đã chọn`}
          </button>
          <button type="button" onClick={deleteSelected} disabled={bulkDeleting || bulkEnabling || bulkDisabling}>
            {bulkDeleting ? 'Đang xoá...' : `Xoá ${selection.selectedIds.size} nguồn đã chọn`}
          </button>
        </div>
      )}

      {editing && (
        <div className="modal">
          <div className="modal-body">
            <h3>Sửa nguồn "{editing.Name}"</h3>
            <p className="hint">Loại CSDL ({editing.Engine === 'mysql' ? 'MySQL/MariaDB' : 'SQL Server'}) không đổi được — tạo nguồn mới nếu cần đổi loại.</p>
            <form className="stacked-form" onSubmit={saveEdit}>
              <input placeholder="Tên nguồn" value={editing.Name} onChange={(e) => setEditing({ ...editing, Name: e.target.value })} required />
              <input placeholder="Server" value={editing.Server} onChange={(e) => setEditing({ ...editing, Server: e.target.value })} required />
              <input placeholder="Port" type="number" value={editing.Port} onChange={(e) => setEditing({ ...editing, Port: Number(e.target.value) })} />
              <input placeholder="Database" value={editing.DatabaseName} onChange={(e) => setEditing({ ...editing, DatabaseName: e.target.value })} required />
              <input placeholder="Username" value={editing.Username} onChange={(e) => setEditing({ ...editing, Username: e.target.value })} required />
              <input
                placeholder="Mật khẩu mới (để trống = giữ nguyên mật khẩu đã lưu)"
                type="password"
                value={editing.password}
                onChange={(e) => setEditing({ ...editing, password: e.target.value })}
              />
              <label className="checkbox-row"><input type="checkbox" checked={editing.Encrypt} onChange={(e) => setEditing({ ...editing, Encrypt: e.target.checked })} /> Mã hoá kết nối</label>
              <label className="checkbox-row"><input type="checkbox" checked={editing.TrustServerCert} onChange={(e) => setEditing({ ...editing, TrustServerCert: e.target.checked })} /> Tin chứng chỉ tự ký</label>
              <label className="checkbox-row"><input type="checkbox" checked={editing.IsActive} onChange={(e) => setEditing({ ...editing, IsActive: e.target.checked })} /> Hoạt động</label>
              <div className="inline-actions">
                <button type="submit" disabled={savingEdit}>{savingEdit ? 'Đang lưu...' : 'Cập nhật nguồn dữ liệu'}</button>
                <button type="button" onClick={() => setEditing(null)}>Huỷ</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
