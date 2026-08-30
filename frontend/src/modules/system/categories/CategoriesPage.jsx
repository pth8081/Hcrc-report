// modules/system/categories/CategoriesPage.jsx — CRUD app.Categories, lọc
// theo CategoryType (chọn từ danh sách loại đã có, hoặc gõ loại mới).
import { useEffect, useState } from 'react';
import { api } from '../../../lib/api';
import DataTable from '../../../components/DataTable';

export default function CategoriesPage() {
  const [types, setTypes] = useState([]);
  const [activeType, setActiveType] = useState('');
  const [rows, setRows] = useState([]);
  const [form, setForm] = useState({ categoryType: '', code: '', name: '' });
  const [error, setError] = useState('');

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
    try {
      await api.post('/system/categories', form);
      setForm({ categoryType: form.categoryType, code: '', name: '' });
      loadTypes();
      loadRows(activeType);
    } catch (err) { setError(err.message); }
  }

  async function toggleActive(row) {
    try {
      await api.put(`/system/categories/${row.Id}`, { name: row.Name, sortOrder: row.SortOrder, isActive: !row.IsActive });
      loadRows(activeType);
    } catch (err) { setError(err.message); }
  }

  async function deleteCategory(row) {
    if (!confirm(`Xoá "${row.Name}"?`)) return;
    try {
      await api.del(`/system/categories/${row.Id}`);
      loadRows(activeType);
    } catch (err) { setError(err.message); }
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
        <button type="submit">Thêm</button>
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
                <button type="button" onClick={() => toggleActive(r)}>{r.IsActive ? 'Tắt' : 'Bật'}</button>{' '}
                <button type="button" onClick={() => deleteCategory(r)}>Xoá</button>
              </>
            )
          }
        ]}
        rows={rows}
      />
    </div>
  );
}
