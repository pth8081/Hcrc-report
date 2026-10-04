// modules/system/categories/CategoriesPage.jsx — CRUD app.Categories, lọc
// theo CategoryType (chọn từ danh sách loại đã có, hoặc gõ loại mới).
import { useEffect, useState } from 'react';
import { api } from '../../../lib/api';
import DataTable from '../../../components/DataTable';
import { useRowSelection } from '../../../lib/useRowSelection';

export default function CategoriesPage() {
  const [types, setTypes] = useState([]);
  const [activeType, setActiveType] = useState('');
  const [rows, setRows] = useState([]);
  const [form, setForm] = useState({ categoryType: '', code: '', name: '' });
  const [error, setError] = useState('');
  const [creating, setCreating] = useState(false);
  const [togglingId, setTogglingId] = useState(null);
  const [deletingId, setDeletingId] = useState(null);
  // Chọn nhiều + xoá hàng loạt (bản 8.62).
  const selection = useRowSelection();
  const [bulkDeleting, setBulkDeleting] = useState(false);

  function loadTypes() {
    api.get('/system/categories/types').then(setTypes).catch(err => setError(err.message));
  }
  function loadRows(type) {
    const query = type ? `?type=${encodeURIComponent(type)}` : '';
    api.get(`/system/categories${query}`).then(setRows).catch(err => setError(err.message));
  }
  useEffect(loadTypes, []);
  useEffect(() => loadRows(activeType), [activeType]);

  async function createCategory(e) {
    e.preventDefault();
    setError('');
    setCreating(true);
    try {
      await api.post('/system/categories', form);
      setForm({ categoryType: form.categoryType, code: '', name: '' });
      loadTypes();
      loadRows(activeType);
    } catch (err) { setError(err.message); } finally { setCreating(false); }
  }

  async function toggleActive(row) {
    setTogglingId(row.Id);
    try {
      await api.put(`/system/categories/${row.Id}`, { name: row.Name, sortOrder: row.SortOrder, isActive: !row.IsActive });
      loadRows(activeType);
    } catch (err) { setError(err.message); } finally { setTogglingId(null); }
  }

  async function deleteCategory(row) {
    if (!confirm(`Xoá "${row.Name}"?`)) return;
    setDeletingId(row.Id);
    try {
      await api.del(`/system/categories/${row.Id}`);
      loadRows(activeType);
    } catch (err) { setError(err.message); } finally { setDeletingId(null); }
  }

  async function deleteSelected() {
    if (selection.selectedIds.size === 0) return;
    if (!confirm(`Xoá ${selection.selectedIds.size} danh mục đã chọn?`)) return;
    setBulkDeleting(true);
    try {
      for (const id of selection.selectedIds) {
        await api.del(`/system/categories/${id}`);
      }
      selection.clear();
      loadRows(activeType);
    } catch (err) { setError(err.message); } finally { setBulkDeleting(false); }
  }

  return (
    <div className="page">
      <h1>Danh mục</h1>
      {error && <p className="form-error">{error}</p>}

      <div className="tabs">
        <button type="button" className={activeType === '' ? 'active' : ''} onClick={() => setActiveType('')}>Tất cả</button>
        {types.map(t => (
          <button key={t} type="button" className={activeType === t ? 'active' : ''} onClick={() => setActiveType(t)}>{t}</button>
        ))}
      </div>

      <form className="inline-form" onSubmit={createCategory}>
        <input placeholder="Loại (vd PhongBan)" value={form.categoryType} onChange={(e) => setForm({ ...form, categoryType: e.target.value })} required />
        <input placeholder="Mã" value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} required />
        <input placeholder="Tên" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
        <button type="submit" disabled={creating}>{creating ? 'Đang thêm...' : 'Thêm'}</button>
      </form>

      <DataTable
        columns={[
          { key: 'CategoryType', label: 'Loại' },
          { key: 'Code', label: 'Mã' },
          { key: 'Name', label: 'Tên' },
          { key: 'IsActive', label: 'Trạng thái', render: (r) => (r.IsActive ? 'Hoạt động' : 'Tắt') },
          {
            key: 'actions', label: '', render: (r) => (
              <>
                <button type="button" onClick={() => toggleActive(r)} disabled={togglingId === r.Id}>{togglingId === r.Id ? 'Đang xử lý...' : (r.IsActive ? 'Tắt' : 'Bật')}</button>{' '}
                <button type="button" onClick={() => deleteCategory(r)} disabled={deletingId === r.Id}>{deletingId === r.Id ? 'Đang xoá...' : 'Xoá'}</button>
              </>
            )
          }
        ]}
        rows={rows}
        selection={selection}
      />

      {selection.selectedIds.size > 0 && (
        <div className="inline-actions">
          <button type="button" onClick={deleteSelected} disabled={bulkDeleting}>
            {bulkDeleting ? 'Đang xoá...' : `Xoá ${selection.selectedIds.size} mục đã chọn`}
          </button>
        </div>
      )}
    </div>
  );
}
