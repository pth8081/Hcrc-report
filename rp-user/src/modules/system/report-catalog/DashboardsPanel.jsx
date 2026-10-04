// modules/system/report-catalog/DashboardsPanel.jsx — Tab "Dashboard" trong
// trang Biểu mẫu: CRUD app.Dashboards (Giai đoạn C, hướng Power BI — xem
// VERSION.md). DefinitionJson sửa dạng textarea (JSON thô), cùng khuôn
// ReportCatalogPanel.jsx — chưa có form có cấu trúc kéo-thả cho từng ô.
//
// DefinitionJson = { "tiles": [ { "key": "...", "reportId": "...", "title":
// "..." (tuỳ chọn, mặc định lấy Title của báo cáo) }, ... ] } — mỗi ô TRỎ
// TỚI 1 báo cáo đã có trong "Biểu mẫu → Báo cáo" (tab bên cạnh), không định
// nghĩa lại nguồn dữ liệu/công thức riêng.
import { useEffect, useState } from 'react';
import { api } from '../../../lib/api';
import DataTable from '../../../components/DataTable';
import { useRowSelection } from '../../../lib/useRowSelection';

const EXAMPLE_DEFINITION = '{"tiles":[{"key":"doanhThuTheoChiNhanh","reportId":"..."},{"key":"topSanPham","reportId":"...","title":"Top sản phẩm"}]}';

function emptyForm() {
  return { dashboardId: '', title: '', definitionJson: '' };
}

export default function DashboardsPanel() {
  const [dashboards, setDashboards] = useState([]);
  const [form, setForm] = useState(emptyForm());
  const [editing, setEditing] = useState(null);
  const [error, setError] = useState('');
  const [creating, setCreating] = useState(false);
  const [savingEdit, setSavingEdit] = useState(false);
  const [deletingId, setDeletingId] = useState(null);
  const selection = useRowSelection(row => row.DashboardId);
  const [bulkDeleting, setBulkDeleting] = useState(false);

  function reload() {
    api.get('/system/dashboards').then(setDashboards).catch(err => setError(err.message));
  }
  useEffect(reload, []);

  async function createDashboard(e) {
    e.preventDefault();
    setError('');
    setCreating(true);
    try {
      await api.post('/system/dashboards', form);
      setForm(emptyForm());
      reload();
    } catch (err) { setError(err.message); } finally { setCreating(false); }
  }

  async function saveEdit() {
    setError('');
    setSavingEdit(true);
    try {
      await api.put(`/system/dashboards/${editing.id}`, editing.form);
      setEditing(null);
      reload();
    } catch (err) { setError(err.message); } finally { setSavingEdit(false); }
  }

  async function deleteDashboard(d) {
    if (!confirm(`Xoá dashboard "${d.Title}"?`)) return;
    setError('');
    setDeletingId(d.DashboardId);
    try {
      await api.del(`/system/dashboards/${d.DashboardId}`);
      reload();
    } catch (err) { setError(err.message); } finally { setDeletingId(null); }
  }

  async function deleteSelected() {
    if (selection.selectedIds.size === 0) return;
    if (!confirm(`Xoá ${selection.selectedIds.size} dashboard đã chọn?`)) return;
    setBulkDeleting(true);
    try {
      for (const id of selection.selectedIds) {
        await api.del(`/system/dashboards/${id}`);
      }
      selection.clear();
      reload();
    } catch (err) { setError(err.message); } finally { setBulkDeleting(false); }
  }

  return (
    <div>
      {error && <p className="form-error">{error}</p>}

      <form className="stacked-form" onSubmit={createDashboard}>
        <input placeholder="Mã dashboard (dashboardId)" value={form.dashboardId} onChange={(e) => setForm({ ...form, dashboardId: e.target.value })} required />
        <input placeholder="Tiêu đề" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} required />
        <textarea
          placeholder={EXAMPLE_DEFINITION}
          rows={6}
          value={form.definitionJson}
          onChange={(e) => setForm({ ...form, definitionJson: e.target.value })}
          required
        />
        <button type="submit" disabled={creating}>{creating ? 'Đang tạo...' : 'Tạo dashboard'}</button>
      </form>

      <DataTable
        columns={[
          { key: 'Title', label: 'Tiêu đề' },
          { key: 'DashboardId', label: 'Mã' },
          { key: 'IsActive', label: 'Trạng thái', render: (r) => (r.IsActive ? 'Hoạt động' : 'Tắt') },
          {
            key: 'actions', label: '', render: (r) => (
              <>
                <button type="button" onClick={() => setEditing({ id: r.DashboardId, form: { title: r.Title, definitionJson: r.DefinitionJson, isActive: !!r.IsActive } })}>Sửa</button>{' '}
                <button type="button" onClick={() => deleteDashboard(r)} disabled={deletingId === r.DashboardId}>
                  {deletingId === r.DashboardId ? 'Đang xoá...' : 'Xoá'}
                </button>
              </>
            )
          }
        ]}
        rows={dashboards}
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
        <div className="modal">
          <div className="modal-body">
            <h3>Sửa — {editing.form.title}</h3>
            <input placeholder="Tiêu đề" value={editing.form.title} onChange={(e) => setEditing({ ...editing, form: { ...editing.form, title: e.target.value } })} required />
            <textarea
              rows={6}
              value={editing.form.definitionJson}
              onChange={(e) => setEditing({ ...editing, form: { ...editing.form, definitionJson: e.target.value } })}
              required
            />
            <label className="checkbox-row">
              <input type="checkbox" checked={editing.form.isActive} onChange={(e) => setEditing({ ...editing, form: { ...editing.form, isActive: e.target.checked } })} /> Hoạt động
            </label>
            <div className="modal-actions">
              <button type="button" onClick={saveEdit} disabled={savingEdit}>{savingEdit ? 'Đang lưu...' : 'Lưu'}</button>
              <button type="button" onClick={() => setEditing(null)}>Huỷ</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
