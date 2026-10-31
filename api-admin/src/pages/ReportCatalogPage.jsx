// pages/ReportCatalogPage.jsx — Trang "Báo cáo": CRUD api.ReportCatalog —
// danh mục báo cáo tổng hợp lộ qua GET /api/v1/reports/{ReportId}/run (đọc
// dwh.ReportFacts). Định nghĩa (filters/columns) sửa dạng textarea JSON thô,
// cùng khuôn dạng với app.ReportCatalog bên rp-server — xem rp-server/README.md
// mục "Thêm một báo cáo mới" cho ví dụ JSON. Chỉ vai trò admin sửa được.
import { useEffect, useState } from 'react';
import { api } from '../lib/api';
import { useAuth } from '../lib/AuthContext';
import DataTable from '../components/DataTable';
import { useRowSelection } from '../lib/useRowSelection';
import Modal from '../components/Modal';
import CopyableText from '../components/CopyableText';

const EMPTY_FORM = { reportId: '', title: '', domain: '', definitionJson: '' };

// reportRunUrl (bản 10.58, theo yêu cầu người dùng — "hiện ra cái phần hiện
// link URL để gửi đối tác... mà nhớ được link", giống cột "Đường dẫn API"
// của trang "Cấu hình Voucher") — ghép domain thật (publicApiBaseUrl, đọc từ
// .env PUBLIC_API_BASE_URL qua GET /auth/me) với đường dẫn CỐ ĐỊNH của route
// GET /api/v1/reports/:reportId/run (routes/v1/reports.js) — KHÔNG tự bịa
// domain khi publicApiBaseUrl chưa khai, chỉ hiện đường dẫn.
function reportRunUrl(reportId, publicApiBaseUrl) {
  const path = `/api/v1/reports/${reportId}/run`;
  return publicApiBaseUrl ? `${publicApiBaseUrl}${path}` : path;
}

export default function ReportCatalogPage() {
  const { canEdit, me } = useAuth();
  const isAdmin = canEdit('report-catalog');
  const [reports, setReports] = useState([]);
  const [form, setForm] = useState(EMPTY_FORM);
  const [error, setError] = useState('');
  const [creating, setCreating] = useState(false);
  const [deletingId, setDeletingId] = useState(null);
  const [editing, setEditing] = useState(null); // { ReportId, title, domain, definitionJson, isActive } đang sửa, hoặc null
  const [savingEdit, setSavingEdit] = useState(false);
  // Chọn nhiều + xoá hàng loạt (bản 8.62) — khoá dòng là ReportId.
  const selection = useRowSelection(row => row.ReportId);
  const [bulkDeleting, setBulkDeleting] = useState(false);

  function reload() {
    api.get('/report-catalog').then(setReports).catch(err => setError(err.message));
  }
  useEffect(reload, []);

  async function createReport(e) {
    e.preventDefault();
    setError('');
    setCreating(true);
    try {
      await api.post('/report-catalog', form);
      setForm(EMPTY_FORM);
      reload();
    } catch (err) { setError(err.message); } finally { setCreating(false); }
  }

  function openEdit(r) {
    setEditing({ reportId: r.ReportId, title: r.Title, domain: r.Domain, definitionJson: r.DefinitionJson, isActive: !!r.IsActive });
  }

  async function saveEdit(e) {
    e.preventDefault();
    setError('');
    setSavingEdit(true);
    try {
      await api.put(`/report-catalog/${editing.reportId}`, {
        title: editing.title, domain: editing.domain, definitionJson: editing.definitionJson, isActive: editing.isActive
      });
      setEditing(null);
      reload();
    } catch (err) { setError(err.message); } finally { setSavingEdit(false); }
  }

  async function deleteReport(r) {
    if (!confirm(`Xoá báo cáo "${r.Title}"?`)) return;
    setDeletingId(r.ReportId);
    try {
      await api.del(`/report-catalog/${r.ReportId}`);
      reload();
    } catch (err) { setError(err.message); } finally { setDeletingId(null); }
  }

  async function deleteSelected() {
    if (selection.selectedIds.size === 0) return;
    if (!confirm(`Xoá ${selection.selectedIds.size} báo cáo đã chọn?`)) return;
    setBulkDeleting(true);
    try {
      for (const id of selection.selectedIds) {
        await api.del(`/report-catalog/${id}`);
      }
      selection.clear();
      reload();
    } catch (err) { setError(err.message); } finally { setBulkDeleting(false); }
  }

  return (
    <div className="page">
      <h1>Báo cáo</h1>
      <p>
        Danh mục báo cáo tổng hợp lộ ra qua <code>GET /api/v1/reports/&#123;ReportId&#125;/run</code>
        {' '}(hệ thống ngoài gọi bằng API key scope <code>reports</code>, Report Server nội bộ gọi khi cấu hình
        một báo cáo &quot;Qua API Server&quot;). Danh mục này ĐỘC LẬP với danh mục báo cáo bên Report Server.
      </p>
      {error && <p className="form-error">{error}</p>}

      {isAdmin && (
        <form className="stacked-form" onSubmit={createReport}>
          <input placeholder="Mã báo cáo (reportId)" value={form.reportId} onChange={(e) => setForm({ ...form, reportId: e.target.value })} required />
          <input placeholder="Tiêu đề" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} required />
          <input placeholder="Domain (dwh.ReportFacts.Domain)" value={form.domain} onChange={(e) => setForm({ ...form, domain: e.target.value })} required />
          <textarea
            placeholder='{"domain": "...", "filters": [...], "columns": ["entityCode", "measures.doanhThu", {"key": "tyLeLoiNhuan", "label": "Tỷ lệ lợi nhuận (%)", "formula": "ROUND(measures.loiNhuan / measures.doanhThu * 100, 1)"}]}'
            rows={8}
            value={form.definitionJson}
            onChange={(e) => setForm({ ...form, definitionJson: e.target.value })}
            required
          />
          <button type="submit" disabled={creating}>{creating ? 'Đang tạo...' : 'Tạo báo cáo'}</button>
        </form>
      )}

      {!me?.publicApiBaseUrl && (
        <p className="hint">
          Chưa khai <code>PUBLIC_API_BASE_URL</code> trong <code>.env</code> của api-server — cột "Endpoint gọi API"
          dưới đây tạm chỉ hiện đường dẫn (không domain). Khai xong, restart api-server để hiện đủ link gửi đối tác.
        </p>
      )}
      <DataTable
        columns={[
          { key: 'Title', label: 'Tiêu đề' },
          { key: 'ReportId', label: 'Mã' },
          { key: 'Domain', label: 'Domain' },
          { key: 'url', label: 'Endpoint gọi API (gửi đối tác)', render: (r) => <CopyableText value={reportRunUrl(r.ReportId, me?.publicApiBaseUrl)} label="Endpoint API" /> },
          { key: 'IsActive', label: 'Trạng thái', render: (r) => (r.IsActive ? 'Hoạt động' : 'Tắt') },
          isAdmin && {
            key: 'actions', label: '', render: (r) => (
              <>
                <button type="button" onClick={() => openEdit(r)}>Sửa</button>{' '}
                <button type="button" onClick={() => deleteReport(r)} disabled={deletingId === r.ReportId}>
                  {deletingId === r.ReportId ? 'Đang xoá...' : 'Xoá'}
                </button>
              </>
            )
          }
        ].filter(Boolean)}
        rows={reports}
        selection={isAdmin ? selection : null}
      />

      {isAdmin && selection.selectedIds.size > 0 && (
        <div className="inline-actions">
          <button type="button" onClick={deleteSelected} disabled={bulkDeleting}>
            {bulkDeleting ? 'Đang xoá...' : `Xoá ${selection.selectedIds.size} mục đã chọn`}
          </button>
        </div>
      )}

      {editing && (
        <Modal>
          <div className="modal-body">
            <h3>Sửa báo cáo "{editing.title}"</h3>
            <p className="hint">Mã báo cáo ({editing.reportId}) không đổi được.</p>
            <form className="stacked-form" onSubmit={saveEdit}>
              <input placeholder="Tiêu đề" value={editing.title} onChange={(e) => setEditing({ ...editing, title: e.target.value })} required />
              <input placeholder="Domain" value={editing.domain} onChange={(e) => setEditing({ ...editing, domain: e.target.value })} required />
              <textarea
                rows={8}
                value={editing.definitionJson}
                onChange={(e) => setEditing({ ...editing, definitionJson: e.target.value })}
                required
              />
              <label className="checkbox-row"><input type="checkbox" checked={editing.isActive} onChange={(e) => setEditing({ ...editing, isActive: e.target.checked })} /> Hoạt động</label>
              <div className="inline-actions">
                <button type="submit" disabled={savingEdit}>{savingEdit ? 'Đang lưu...' : 'Cập nhật báo cáo'}</button>
                <button type="button" onClick={() => setEditing(null)}>Huỷ</button>
              </div>
            </form>
          </div>
        </Modal>
      )}
    </div>
  );
}
