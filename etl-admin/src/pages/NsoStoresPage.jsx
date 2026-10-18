// pages/NsoStoresPage.jsx — Trang "Siêu thị NSO": khai danh sách mã Điểm
// đang ở trạng thái "New Store Opening" (mới mở) — dùng cho báo cáo "Doanh
// thu, lãi gộp theo ngành hàng" (BRGMART, bản 9.63) tách khối "Tổng cộng
// nhóm siêu thị NSO" khỏi khối "LFL" (siêu thị ổn định). Mirror NGUYÊN cấu
// trúc/bộ nút pages/DiemStkMappingPage.jsx, ĐƠN GIẢN HƠN — chỉ Mã Điểm +
// Tên siêu thị, không có khái niệm kho cũ/mới/BU_ID/LoaiChuoi, không cần
// kiểm tra trùng STK_ID (MERGE theo MaDiem là đủ).
import { useEffect, useState } from 'react';
import { api } from '../lib/api';
import DataTable from '../components/DataTable';
import { useRowSelection } from '../lib/useRowSelection';

const EMPTY_EDIT_FORM = { maDiem: '', tenSieuThi: '' };

export default function NsoStoresPage() {
  const [file, setFile] = useState(null);
  const [importResult, setImportResult] = useState(null);
  const [error, setError] = useState('');
  const [filterDiem, setFilterDiem] = useState('');
  const [rows, setRows] = useState([]);
  const [editForm, setEditForm] = useState(EMPTY_EDIT_FORM);
  const [editError, setEditError] = useState('');
  const [editResult, setEditResult] = useState('');
  const [importing, setImporting] = useState(false);
  const [downloadingTemplate, setDownloadingTemplate] = useState(false);
  const [downloadingExport, setDownloadingExport] = useState(false);
  const [savingEdit, setSavingEdit] = useState(false);
  const [deletingId, setDeletingId] = useState(null);
  const [togglingActiveId, setTogglingActiveId] = useState(null);
  // Chọn nhiều + xoá hàng loạt (bản 8.62).
  const selection = useRowSelection(row => row.id);
  const [bulkDeleting, setBulkDeleting] = useState(false);

  function reload() {
    api.get('/nso-stores').then(setRows).catch(err => setError(err.message));
  }
  useEffect(reload, []);

  const visibleRows = filterDiem
    ? rows.filter(r => r.maDiem.toLowerCase().includes(filterDiem.trim().toLowerCase()))
    : rows;

  function startEdit(row) {
    setEditForm({ maDiem: row.maDiem, tenSieuThi: row.tenSieuThi || '' });
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
    if (!editForm.maDiem.trim()) return setEditError('Thiếu "Mã Điểm"');
    setSavingEdit(true);
    try {
      await api.put('/nso-stores/one', {
        maDiem: editForm.maDiem.trim(),
        tenSieuThi: editForm.tenSieuThi.trim() || null
      });
      setEditResult('✅ Đã lưu.');
      setEditForm(EMPTY_EDIT_FORM);
      reload();
    } catch (err) {
      setEditError(err.message);
    } finally {
      setSavingEdit(false);
    }
  }

  // Khoá/Kích hoạt — KHÔNG xoá dữ liệu, chỉ bật tắt IsActive. Dòng đang
  // khoá bị rp-server bỏ qua hẳn (coi như không có trong danh sách NSO,
  // mặc định LFL), nhưng vẫn giữ nguyên cấu hình để bấm "Kích hoạt" dùng
  // lại ngay, không cần khai lại từ đầu.
  async function toggleActive(row) {
    setTogglingActiveId(row.id);
    try {
      await api.put(`/nso-stores/${row.id}/active`, { isActive: !row.isActive });
      reload();
    } catch (err) {
      setError(err.message);
    } finally {
      setTogglingActiveId(null);
    }
  }

  async function removeRow(row) {
    if (!window.confirm(`Xoá siêu thị NSO "${row.maDiem}"?`)) return;
    setDeletingId(row.id);
    try {
      await api.del(`/nso-stores/${row.id}`);
      reload();
    } catch (err) {
      setError(err.message);
    } finally {
      setDeletingId(null);
    }
  }

  async function deleteSelected() {
    if (selection.selectedIds.size === 0) return;
    if (!confirm(`Xoá ${selection.selectedIds.size} siêu thị NSO đã chọn?`)) return;
    setBulkDeleting(true);
    try {
      for (const id of selection.selectedIds) {
        await api.del(`/nso-stores/${id}`);
      }
      selection.clear();
      reload();
    } catch (err) { setError(err.message); } finally { setBulkDeleting(false); }
  }

  async function submitImport(e) {
    e.preventDefault();
    setError('');
    setImportResult(null);
    if (!file) return setError('Chọn file .xlsx trước');

    const formData = new FormData();
    formData.append('file', file);
    setImporting(true);
    try {
      const result = await api.post('/nso-stores/import', formData, true);
      setImportResult(result);
      setFile(null);
      reload();
    } catch (err) {
      setError(err.message);
    } finally {
      setImporting(false);
    }
  }

  async function downloadTemplate() {
    setError('');
    setDownloadingTemplate(true);
    try {
      await api.downloadFile('/nso-stores/template', 'mau-sieu-thi-nso.xlsx');
    } catch (err) {
      setError(err.message);
    } finally {
      setDownloadingTemplate(false);
    }
  }

  async function downloadExport() {
    setError('');
    setDownloadingExport(true);
    try {
      await api.downloadFile('/nso-stores/export', 'sieu-thi-nso.xlsx');
    } catch (err) {
      setError(err.message);
    } finally {
      setDownloadingExport(false);
    }
  }

  return (
    <div className="page">
      <h1>Siêu thị NSO</h1>
      <p>
        Khai danh sách mã Điểm đang ở trạng thái <strong>NSO</strong> ("New Store Opening" — mới
        mở) — dùng cho báo cáo "Doanh thu, lãi gộp theo ngành hàng" tách riêng khối "Tổng cộng
        nhóm siêu thị NSO" khỏi khối "LFL" ("Like For Like" — siêu thị ổn định). Mã Điểm KHÔNG có
        trong danh sách này (hoặc có nhưng đang "Khoá") mặc định coi là <strong>LFL</strong> —
        KHÔNG cần khai danh sách LFL riêng.
      </p>
      <p>
        File .xlsx: dòng 1 header, cột bắt buộc <code>MaDiem</code> (đúng mã Điểm đã khai ở "Ánh
        xạ Điểm - STK_ID"). Cột tuỳ chọn <code>TenSieuThi</code>, chỉ để tham khảo/hiển thị.
      </p>
      {error && <p className="form-error">{error}</p>}

      <div className="inline-actions">
        <button type="button" onClick={downloadTemplate} disabled={downloadingTemplate}>
          {downloadingTemplate ? 'Đang tải...' : 'Tải file mẫu'}
        </button>
      </div>
      <form className="stacked-form" onSubmit={submitImport}>
        <input type="file" accept=".xlsx" onChange={(e) => setFile(e.target.files?.[0] ?? null)} required />
        <button type="submit" disabled={importing}>{importing ? 'Đang nhập...' : 'Nhập danh sách NSO'}</button>
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

      <h2>Siêu thị NSO đã khai</h2>
      <div className="inline-actions">
        <input placeholder="Lọc theo Mã Điểm" value={filterDiem} onChange={(e) => setFilterDiem(e.target.value)} />
        <button type="button" onClick={downloadExport} disabled={downloadingExport}>
          {downloadingExport ? 'Đang xuất...' : 'Xuất tất cả (Excel)'}
        </button>
      </div>

      <DataTable
        columns={[
          { key: 'maDiem', label: 'Mã Điểm' },
          { key: 'tenSieuThi', label: 'Tên siêu thị' },
          { key: 'isActive', label: 'Trạng thái', render: (r) => (r.isActive ? 'Đang hoạt động' : 'Đang khoá') },
          { key: 'importedBy', label: 'Người nhập' },
          { key: 'importedAt', label: 'Lúc nhập', render: (r) => new Date(r.importedAt).toLocaleString('vi-VN') },
          {
            key: 'actions', label: '', render: (r) => (
              <>
                <button type="button" onClick={() => startEdit(r)}>Sửa</button>{' '}
                <button type="button" onClick={() => toggleActive(r)} disabled={togglingActiveId === r.id}>
                  {togglingActiveId === r.id ? 'Đang xử lý...' : (r.isActive ? 'Khoá' : 'Kích hoạt')}
                </button>{' '}
                <button type="button" onClick={() => removeRow(r)} disabled={deletingId === r.id}>
                  {deletingId === r.id ? 'Đang xoá...' : 'Xoá'}
                </button>
              </>
            )
          }
        ]}
        rows={visibleRows}
        selection={selection}
      />

      {selection.selectedIds.size > 0 && (
        <div className="inline-actions">
          <button type="button" onClick={deleteSelected} disabled={bulkDeleting}>
            {bulkDeleting ? 'Đang xoá...' : `Xoá ${selection.selectedIds.size} mục đã chọn`}
          </button>
        </div>
      )}

      <h2>Sửa / thêm 1 dòng</h2>
      <p>
        Dùng khi 1 siêu thị mới chuyển trạng thái NSO — KHÔNG cần chuẩn bị lại cả file Excel. Bấm
        "Sửa" ở 1 dòng trên để tự điền sẵn, hoặc "Thêm dòng mới" cho form trống.
      </p>
      {editError && <p className="form-error">{editError}</p>}
      {editResult && <p className="form-success">{editResult}</p>}

      <form className="stacked-form" onSubmit={submitEdit}>
        <input
          placeholder="Mã Điểm — đúng mã đã khai ở Ánh xạ Điểm - STK_ID"
          value={editForm.maDiem}
          onChange={(e) => setEditForm({ ...editForm, maDiem: e.target.value })}
          required
        />
        <input
          placeholder="Tên siêu thị (tuỳ chọn)"
          value={editForm.tenSieuThi}
          onChange={(e) => setEditForm({ ...editForm, tenSieuThi: e.target.value })}
        />
        <div className="inline-actions">
          <button type="submit" disabled={savingEdit}>{savingEdit ? 'Đang lưu...' : 'Lưu'}</button>
          <button type="button" onClick={startAdd}>Thêm dòng mới (form trống)</button>
        </div>
      </form>
    </div>
  );
}
