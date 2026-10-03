// modules/system/department-mapping/DepartmentStoreMappingPage.jsx — Trang
// "Ánh xạ Phòng ban → Siêu thị" (bản 8.49) — mirror khuôn trang "Ánh xạ Điểm
// - STK_ID" bên etl-admin, đơn giản hoá (map 1-1 tên Department <-> 1 mã
// Điểm, không gộp nhiều mã/tách kỳ). Chỉ cần khai ở đây khi cột "Phòng ban"
// của 1 người (trang "Người dùng") KHÔNG khớp đúng tên siêu thị đã dùng
// trong "Ánh xạ Điểm - STK_ID" (etl-admin) — hệ thống tự thử khớp tên THẲNG
// trước, bảng này chỉ là lớp ghi đè cho trường hợp lệch chính tả/viết tắt.
import { useEffect, useState } from 'react';
import { api, downloadFile } from '../../../lib/api';
import { useAuth } from '../../../lib/AuthContext';
import DataTable from '../../../components/DataTable';

const EMPTY_EDIT_FORM = { id: null, departmentRaw: '', maDiem: '' };

export default function DepartmentStoreMappingPage() {
  const { me } = useAuth();
  const [rows, setRows] = useState([]);
  const [file, setFile] = useState(null);
  const [importResult, setImportResult] = useState(null);
  const [error, setError] = useState('');
  const [filterText, setFilterText] = useState('');
  const [editForm, setEditForm] = useState(EMPTY_EDIT_FORM);
  const [editError, setEditError] = useState('');
  const [editResult, setEditResult] = useState('');

  function reload() {
    api.get('/system/department-mapping').then(setRows).catch(err => setError(err.message));
  }
  useEffect(reload, []);

  const visibleRows = filterText
    ? rows.filter(r => r.departmentRaw.toLowerCase().includes(filterText.trim().toLowerCase()) || r.maDiem.toLowerCase().includes(filterText.trim().toLowerCase()))
    : rows;

  function startEdit(row) {
    setEditForm({ id: row.id, departmentRaw: row.departmentRaw, maDiem: row.maDiem });
    setEditError('');
    setEditResult('');
  }

  function startAdd() {
    setEditForm(EMPTY_EDIT_FORM);
    setEditError('');
    setEditResult('');
  }

  async function submitEdit(e) {
    e.preventDefault();
    setEditError('');
    setEditResult('');
    if (!editForm.departmentRaw.trim() || !editForm.maDiem.trim()) return setEditError('Thiếu "Department" hoặc "Mã Điểm"');
    try {
      await api.put('/system/department-mapping/one', {
        id: editForm.id,
        departmentRaw: editForm.departmentRaw.trim(),
        maDiem: editForm.maDiem.trim()
      });
      setEditResult('✅ Đã lưu.');
      setEditForm(EMPTY_EDIT_FORM);
      reload();
    } catch (err) { setEditError(err.message); }
  }

  async function removeRow(row) {
    if (!confirm(`Xoá ánh xạ "${row.departmentRaw}"?`)) return;
    try {
      await api.del(`/system/department-mapping/${row.id}`);
      reload();
    } catch (err) { setError(err.message); }
  }

  async function submitImport(e) {
    e.preventDefault();
    setError('');
    setImportResult(null);
    if (!file) return setError('Chọn file .xlsx trước');
    const formData = new FormData();
    formData.append('file', file);
    try {
      const result = await api.upload('/system/department-mapping/import', formData);
      setImportResult(result);
      setFile(null);
      reload();
    } catch (err) { setError(err.message); }
  }

  async function templateFile() {
    setError('');
    try {
      await downloadFile('/system/department-mapping/template', {}, 'mau-anh-xa-phong-ban-sieu-thi.xlsx');
    } catch (err) { setError(err.message); }
  }

  async function exportFile() {
    setError('');
    try {
      await downloadFile('/system/department-mapping/export', {}, 'anh-xa-phong-ban-sieu-thi.xlsx');
    } catch (err) { setError(err.message); }
  }

  return (
    <div className="page">
      <h2>Ánh xạ Phòng ban → Siêu thị</h2>
      <p className="form-hint">
        Dùng khi cột "Phòng ban" của 1 người (trang "Người dùng", lấy từ HCRC Workspace) KHÔNG
        khớp đúng tên siêu thị đang dùng ở "Ánh xạ Điểm - STK_ID" (lệch chính tả/viết tắt) — hệ
        thống tự thử khớp tên THẲNG trước, chỉ cần khai ở đây các trường hợp không khớp. Dùng để
        gợi ý đúng phạm vi dữ liệu (siêu thị nào) cho từng người.
      </p>
      {error && <p className="form-error">{error}</p>}

      {me?.isSystemRole && (
        <>
          <div className="inline-actions">
            <button type="button" onClick={templateFile}>Tải file mẫu</button>
          </div>
          <form className="stacked-form" onSubmit={submitImport}>
            <input type="file" accept=".xlsx" onChange={(e) => setFile(e.target.files?.[0] ?? null)} required />
            <button type="submit">Nhập file ánh xạ</button>
          </form>

          {importResult && (
            <div className="import-result">
              <p>✅ Đã thêm mới {importResult.inserted}, cập nhật {importResult.updated} dòng.</p>
              {importResult.rowErrors?.length > 0 && (
                <>
                  <p>⚠️ {importResult.rowErrors.length} dòng bị bỏ qua:</p>
                  <ul>{importResult.rowErrors.map((e, i) => <li key={i}>{e}</li>)}</ul>
                </>
              )}
            </div>
          )}
        </>
      )}

      <h3>Ánh xạ đã khai</h3>
      <div className="inline-actions">
        <input placeholder="Lọc theo Phòng ban/Mã Điểm" value={filterText} onChange={(e) => setFilterText(e.target.value)} />
        <button type="button" onClick={exportFile}>Xuất tất cả (Excel)</button>
      </div>

      <DataTable
        columns={[
          { key: 'departmentRaw', label: 'Department (vpdt)' },
          { key: 'maDiem', label: 'Mã Điểm' },
          { key: 'importedBy', label: 'Người nhập', render: (r) => r.importedBy || '—' },
          { key: 'importedAt', label: 'Lúc nhập', render: (r) => new Date(r.importedAt).toLocaleString('vi-VN') },
          me?.isSystemRole && {
            key: 'actions', label: '', render: (r) => (
              <>
                <button type="button" onClick={() => startEdit(r)}>Sửa</button>{' '}
                <button type="button" onClick={() => removeRow(r)}>Xoá</button>
              </>
            )
          }
        ].filter(Boolean)}
        rows={visibleRows}
        emptyMessage="Chưa có ánh xạ nào — hệ thống vẫn tự thử khớp tên Department với tên siêu thị ở Ánh xạ Điểm - STK_ID."
      />

      {me?.isSystemRole ? (
        <>
          <h3>Sửa / thêm 1 dòng</h3>
          {editError && <p className="form-error">{editError}</p>}
          {editResult && <p className="form-success">{editResult}</p>}
          <form className="stacked-form" onSubmit={submitEdit}>
            <input
              placeholder="Department — đúng nguyên văn giá trị ở cột Phòng ban (trang Người dùng)"
              value={editForm.departmentRaw}
              onChange={(e) => setEditForm({ ...editForm, departmentRaw: e.target.value })}
              required
            />
            <input
              placeholder="Mã Điểm — đúng mã đã khai ở Ánh xạ Điểm - STK_ID"
              value={editForm.maDiem}
              onChange={(e) => setEditForm({ ...editForm, maDiem: e.target.value })}
              required
            />
            <div className="inline-actions">
              <button type="submit">Lưu</button>
              <button type="button" onClick={startAdd}>Thêm dòng mới (form trống)</button>
            </div>
          </form>
        </>
      ) : (
        <p className="form-hint">Chỉ Admin hệ thống mới sửa/xoá/nhập được — xem thì ai có quyền menu này cũng xem được.</p>
      )}
    </div>
  );
}
