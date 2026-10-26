// modules/system/report-catalog/DataSourcesPanel.jsx — Nguồn dữ liệu bổ sung
// (app.ReportDataSources) — chỉ dùng khi một báo cáo cần đọc từ máy chủ khác
// Data Warehouse mặc định (xem ReportCatalogPanel — chọn DataSourceId).
import { useEffect, useState } from 'react';
import { api } from '../../../lib/api';
import DataTable from '../../../components/DataTable';
import { useRowSelection } from '../../../lib/useRowSelection';
import Modal from '../../../components/Modal';

const EMPTY_FORM = { name: '', server: '', port: 1433, databaseName: '', username: '', password: '', encrypt: true, trustServerCert: false };

export default function DataSourcesPanel() {
  const [sources, setSources] = useState([]);
  const [form, setForm] = useState(EMPTY_FORM);
  const [testResult, setTestResult] = useState('');
  const [error, setError] = useState('');
  const [testing, setTesting] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState(null);
  const [editing, setEditing] = useState(null); // { ...source, password: '' } đang sửa, hoặc null
  const [savingEdit, setSavingEdit] = useState(false);
  const [duplicating, setDuplicating] = useState(null); // { source, newName } đang nhân bản, hoặc null
  const [savingDuplicate, setSavingDuplicate] = useState(false);
  const selection = useRowSelection();
  const [bulkDeleting, setBulkDeleting] = useState(false);

  function reload() {
    api.get('/system/data-sources').then(setSources).catch(err => setError(err.message));
  }
  useEffect(reload, []);

  async function testConnection() {
    setTestResult('Đang kiểm tra...');
    setTesting(true);
    try {
      await api.post('/system/data-sources/test', form);
      setTestResult('✅ Kết nối thành công');
    } catch (err) {
      setTestResult(`⛔ ${err.message}`);
    } finally {
      setTesting(false);
    }
  }

  async function createSource(e) {
    e.preventDefault();
    setError('');
    setSaving(true);
    try {
      await api.post('/system/data-sources', form);
      setForm(EMPTY_FORM);
      setTestResult('');
      reload();
    } catch (err) { setError(err.message); } finally { setSaving(false); }
  }

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
        encrypt: editing.Encrypt, trustServerCert: editing.TrustServerCert
      };
      if (editing.password) body.password = editing.password;
      await api.put(`/system/data-sources/${editing.Id}`, body);
      setEditing(null);
      reload();
    } catch (err) { setError(err.message); } finally { setSavingEdit(false); }
  }

  function openDuplicate(source) {
    setDuplicating({ source, newName: `${source.Name} (bản sao)` });
  }

  async function saveDuplicate(e) {
    e.preventDefault();
    setError('');
    setSavingDuplicate(true);
    try {
      await api.post(`/system/data-sources/${duplicating.source.Id}/duplicate`, { name: duplicating.newName });
      setDuplicating(null);
      reload();
    } catch (err) { setError(err.message); } finally { setSavingDuplicate(false); }
  }

  async function deleteSource(source) {
    if (!confirm(`Xoá nguồn "${source.Name}"?`)) return;
    setDeletingId(source.Id);
    try {
      await api.del(`/system/data-sources/${source.Id}`);
      reload();
    } catch (err) { setError(err.message); } finally { setDeletingId(null); }
  }

  async function deleteSelected() {
    if (selection.selectedIds.size === 0) return;
    if (!confirm(`Xoá ${selection.selectedIds.size} nguồn đã chọn?`)) return;
    setBulkDeleting(true);
    try {
      for (const id of selection.selectedIds) {
        await api.del(`/system/data-sources/${id}`);
      }
      selection.clear();
      reload();
    } catch (err) { setError(err.message); } finally { setBulkDeleting(false); }
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
          <button type="button" onClick={testConnection} disabled={testing}>{testing ? 'Đang kiểm tra...' : 'Kiểm tra kết nối'}</button>
          <button type="submit" disabled={saving}>{saving ? 'Đang lưu...' : 'Lưu nguồn dữ liệu'}</button>
        </div>
        {testResult && <p>{testResult}</p>}
      </form>

      <DataTable
        columns={[
          { key: 'Id', label: 'Id' }, // báo cáo SourceType='composite' có thể cần số Id này (blocks[].dataSourceId) — không có UI có cấu trúc riêng, xem rp-server/README.md
          { key: 'Name', label: 'Tên' },
          { key: 'Server', label: 'Server' },
          { key: 'DatabaseName', label: 'Database' },
          {
            key: 'actions', label: '', render: (s) => (
              <>
                <button type="button" onClick={() => openEdit(s)}>Sửa</button>{' '}
                <button type="button" onClick={() => openDuplicate(s)}>Nhân bản</button>{' '}
                <button type="button" onClick={() => deleteSource(s)} disabled={deletingId === s.Id}>
                  {deletingId === s.Id ? 'Đang xoá...' : 'Xoá'}
                </button>
              </>
            )
          }
        ]}
        rows={sources}
        selection={selection}
      />

      {selection.selectedIds.size > 0 && (
        <div className="inline-actions">
          <button type="button" onClick={deleteSelected} disabled={bulkDeleting}>
            {bulkDeleting ? 'Đang xoá...' : `Xoá ${selection.selectedIds.size} mục đã chọn`}
          </button>
        </div>
      )}

      {editing && (
        <Modal>
          <div className="modal-body">
            <h3>Sửa nguồn "{editing.Name}"</h3>
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
              <label className="checkbox-row"><input type="checkbox" checked={editing.Encrypt} onChange={(e) => setEditing({ ...editing, Encrypt: e.target.checked })} /> Encrypt</label>
              <label className="checkbox-row"><input type="checkbox" checked={editing.TrustServerCert} onChange={(e) => setEditing({ ...editing, TrustServerCert: e.target.checked })} /> Trust server certificate</label>
              <div className="inline-actions">
                <button type="submit" disabled={savingEdit}>{savingEdit ? 'Đang lưu...' : 'Cập nhật nguồn dữ liệu'}</button>
                <button type="button" onClick={() => setEditing(null)}>Huỷ</button>
              </div>
            </form>
          </div>
        </Modal>
      )}

      {duplicating && (
        <Modal>
          <div className="modal-body">
            <h3>Nhân bản "{duplicating.source.Name}"</h3>
            <p className="hint">
              Tạo 1 nguồn dữ liệu MỚI giống hệt nguồn này — giữ nguyên Server, Database, Username,
              Mật khẩu, Encrypt... Chỉ cần đặt tên khác.
            </p>
            <form className="stacked-form" onSubmit={saveDuplicate}>
              <input
                placeholder="Tên nguồn mới"
                value={duplicating.newName}
                onChange={(e) => setDuplicating({ ...duplicating, newName: e.target.value })}
                required
                autoFocus
              />
              <p className="hint">🔒 Mật khẩu được sao chép nguyên dạng đã mã hoá ở máy chủ — không hiện ra, không đi qua trình duyệt lúc nhân bản.</p>
              <div className="inline-actions">
                <button type="submit" disabled={savingDuplicate}>{savingDuplicate ? 'Đang nhân bản...' : 'Tạo bản sao'}</button>
                <button type="button" onClick={() => setDuplicating(null)}>Huỷ</button>
              </div>
            </form>
          </div>
        </Modal>
      )}
    </div>
  );
}
