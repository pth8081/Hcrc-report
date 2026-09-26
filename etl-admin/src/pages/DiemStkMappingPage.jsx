// pages/DiemStkMappingPage.jsx — Trang "Ánh xạ Điểm - STK_ID": gộp NHIỀU mã
// kho STK_ID thật (dwh.ReportFacts) về 1 mã "Điểm" (BU_ID, dùng NGUYÊN VẸN
// trong file chỉ tiêu LDTD/HCRC — không cần đổi gì file chỉ tiêu). 1 mã Điểm
// gộp NHIỀU kho, và tách riêng theo kỳ — MaStkCu (kho DÙNG TÍNH quá khứ/cùng
// kỳ năm trước) và MaStkMoi (kho DÙNG TÍNH hiện tại) — vì mã kho có thể đổi
// theo thời gian dù mã Điểm không đổi (xem etl-db/schema.sql).
//
// Đây là bảng ánh xạ DUY NHẤT cho domain doanhthu_chinhanh/giaodich_chinhanh
// từ khi bỏ tính năng "Ánh xạ mã chi nhánh" (etl.BranchCodeMap) — domain
// giaodich_chinhanh giờ giữ nguyên EntityCode = BU_ID gốc lúc đồng bộ, và
// BU_ID CHÍNH LÀ mã Điểm nên không cần dịch mã trung gian nào nữa (xem
// etl/lib/tableSyncEngine.js, rp-server/lib/compositeReportRunner.js).
// (xem etl/routes/admin/diemStkMapping.js).
import { useEffect, useState } from 'react';
import { api } from '../lib/api';
import DataTable from '../components/DataTable';

const EMPTY_EDIT_FORM = { maDiem: '', maStkCu: '', maStkMoi: '', tenSieuThi: '' };

export default function DiemStkMappingPage() {
  const [file, setFile] = useState(null);
  const [importResult, setImportResult] = useState(null);
  const [error, setError] = useState('');
  const [conflicts, setConflicts] = useState([]);
  const [filterDiem, setFilterDiem] = useState('');
  const [rows, setRows] = useState([]);
  const [editForm, setEditForm] = useState(EMPTY_EDIT_FORM);
  const [editError, setEditError] = useState('');
  const [editConflicts, setEditConflicts] = useState([]);
  const [editResult, setEditResult] = useState('');

  function reload() {
    api.get('/diem-stk-mapping').then(setRows).catch(err => setError(err.message));
  }
  useEffect(reload, []);

  const visibleRows = filterDiem
    ? rows.filter(r => r.maDiem.toLowerCase().includes(filterDiem.trim().toLowerCase()))
    : rows;

  function startEdit(row) {
    setEditForm({
      maDiem: row.maDiem,
      maStkCu: row.maStkCu.join(','),
      maStkMoi: row.maStkMoi.join(','),
      tenSieuThi: row.tenSieuThi || ''
    });
    setEditError('');
    setEditConflicts([]);
    setEditResult('');
  }

  function startAdd() {
    setEditForm(EMPTY_EDIT_FORM);
    setEditError('');
    setEditConflicts([]);
    setEditResult('');
  }

  async function submitEdit(e) {
    e.preventDefault();
    setEditError('');
    setEditConflicts([]);
    setEditResult('');
    if (!editForm.maDiem.trim()) return setEditError('Thiếu "Mã Điểm"');
    try {
      await api.put('/diem-stk-mapping/one', {
        maDiem: editForm.maDiem.trim(),
        maStkCu: editForm.maStkCu.split(',').map(s => s.trim()).filter(Boolean),
        maStkMoi: editForm.maStkMoi.split(',').map(s => s.trim()).filter(Boolean),
        tenSieuThi: editForm.tenSieuThi.trim() || null
      });
      setEditResult('✅ Đã lưu.');
      setEditForm(EMPTY_EDIT_FORM);
      reload();
    } catch (err) {
      setEditError(err.message);
      setEditConflicts(err.data?.conflicts || []);
    }
  }

  async function removeRow(row) {
    if (!window.confirm(`Xoá ánh xạ mã Điểm "${row.maDiem}"?`)) return;
    try {
      await api.del(`/diem-stk-mapping/${row.id}`);
      reload();
    } catch (err) {
      setError(err.message);
    }
  }

  async function submitImport(e) {
    e.preventDefault();
    setError('');
    setConflicts([]);
    setImportResult(null);
    if (!file) return setError('Chọn file .xlsx trước');

    const formData = new FormData();
    formData.append('file', file);
    try {
      const result = await api.post('/diem-stk-mapping/import', formData, true);
      setImportResult(result);
      setFile(null);
      reload();
    } catch (err) {
      setError(err.message);
      setConflicts(err.data?.conflicts || []);
    }
  }

  async function downloadTemplate() {
    setError('');
    try {
      await api.downloadFile('/diem-stk-mapping/template', 'mau-anh-xa-diem-stk.xlsx');
    } catch (err) {
      setError(err.message);
    }
  }

  async function downloadExport() {
    setError('');
    try {
      await api.downloadFile('/diem-stk-mapping/export', 'anh-xa-diem-stk.xlsx');
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <div className="page">
      <h1>Ánh xạ Điểm - STK_ID</h1>
      <p>
        Dùng khi mã "Điểm" (BU_ID) trong file chỉ tiêu Lãnh đạo Tập đoàn/HCRC KHÔNG khớp trực
        tiếp mã kho <code>STK_ID</code> thật đang dùng trong dữ liệu thực đạt (1 mã Điểm có thể
        gộp NHIỀU kho — kho là khái niệm ẢO trong phần mềm, không phải vật lý, 1 siêu thị vẫn chỉ
        có 1 diện tích). Khai ở đây mã Điểm ứng với những kho STK_ID nào — báo cáo composite sẽ tự
        CỘNG DỒN doanh thu/giao dịch của các kho đó về đúng 1 dòng theo mã Điểm, ghép đúng với chỉ
        tiêu (chỉ tiêu vẫn giữ nguyên mã Điểm như file gốc, không cần đổi gì).
      </p>
      <p>
        File .xlsx: dòng 1 header, cột bắt buộc <code>MaDiem</code>. Cột tuỳ chọn:{' '}
        <code>MaStkCu</code> (danh sách kho dùng tính <strong>cùng kỳ năm trước</strong>),{' '}
        <code>MaStkMoi</code> (danh sách kho dùng tính <strong>hiện tại</strong>) — NHIỀU mã cách
        nhau bằng dấu phẩy, không dấu cách, để trống nếu kỳ đó không áp dụng (vd siêu thị mới mở
        chưa có kho cũ). <code>TenSieuThi</code> tuỳ chọn, hiện trực tiếp trên báo cáo. Bấm{' '}
        <strong>Tải file mẫu</strong> để lấy file đúng khuôn cột, hoặc <strong>Xuất tất cả (Excel)</strong>{' '}
        để tải về đúng TOÀN BỘ dữ liệu đang lưu (không theo ô lọc bên dưới).
      </p>
      <p>
        <strong>Ràng buộc quan trọng</strong>: 1 mã STK_ID chỉ được thuộc ĐÚNG 1 mã Điểm — hệ
        thống tự kiểm tra, phát hiện trùng (kể cả trùng với dữ liệu đã lưu của mã Điểm khác) sẽ
        <strong> HUỶ TOÀN BỘ lượt nhập</strong>, không lưu dòng nào, để tránh cộng trùng doanh thu.
      </p>
      {error && (
        <div className="form-error">
          <p>{error}</p>
          {conflicts.length > 0 && <ul>{conflicts.map((c, i) => <li key={i}>{c}</li>)}</ul>}
        </div>
      )}

      <div className="inline-actions">
        <button type="button" onClick={downloadTemplate}>Tải file mẫu</button>
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

      <h2>Ánh xạ đã khai</h2>
      <div className="inline-actions">
        <input placeholder="Lọc theo Mã Điểm" value={filterDiem} onChange={(e) => setFilterDiem(e.target.value)} />
        <button type="button" onClick={downloadExport}>Xuất tất cả (Excel)</button>
      </div>

      <DataTable
        columns={[
          { key: 'maDiem', label: 'Mã Điểm (BU_ID)' },
          { key: 'maStkCu', label: 'STK_ID (kỳ cũ)', render: (r) => r.maStkCu.join(', ') || '—' },
          { key: 'maStkMoi', label: 'STK_ID (kỳ mới)', render: (r) => r.maStkMoi.join(', ') || '—' },
          { key: 'tenSieuThi', label: 'Tên siêu thị' },
          { key: 'importedBy', label: 'Người nhập' },
          { key: 'importedAt', label: 'Lúc nhập', render: (r) => new Date(r.importedAt).toLocaleString('vi-VN') },
          {
            key: 'actions', label: '', render: (r) => (
              <>
                <button type="button" onClick={() => startEdit(r)}>Sửa</button>{' '}
                <button type="button" onClick={() => removeRow(r)}>Xoá</button>
              </>
            )
          }
        ]}
        rows={visibleRows}
      />

      <h2>Sửa / thêm 1 dòng</h2>
      <p>
        Dùng khi 1 mã Điểm đổi giữa chừng — KHÔNG cần chuẩn bị lại cả file Excel. Bấm "Sửa" ở 1
        dòng trên để tự điền sẵn, hoặc "Thêm dòng mới" cho form trống.
      </p>
      {editError && (
        <div className="form-error">
          <p>{editError}</p>
          {editConflicts.length > 0 && <ul>{editConflicts.map((c, i) => <li key={i}>{c}</li>)}</ul>}
        </div>
      )}
      {editResult && <p className="form-success">{editResult}</p>}

      <form className="stacked-form" onSubmit={submitEdit}>
        <input
          placeholder="Mã Điểm (BU_ID) — đúng mã dùng trong file chỉ tiêu"
          value={editForm.maDiem}
          onChange={(e) => setEditForm({ ...editForm, maDiem: e.target.value })}
          required
        />
        <input
          placeholder="Mã STK_ID kỳ CŨ (cùng kỳ năm trước) — nhiều mã cách nhau dấu phẩy, để trống nếu không có"
          value={editForm.maStkCu}
          onChange={(e) => setEditForm({ ...editForm, maStkCu: e.target.value })}
        />
        <input
          placeholder="Mã STK_ID kỳ MỚI (hiện tại) — nhiều mã cách nhau dấu phẩy, để trống nếu không còn"
          value={editForm.maStkMoi}
          onChange={(e) => setEditForm({ ...editForm, maStkMoi: e.target.value })}
        />
        <input
          placeholder="Tên siêu thị (tuỳ chọn)"
          value={editForm.tenSieuThi}
          onChange={(e) => setEditForm({ ...editForm, tenSieuThi: e.target.value })}
        />
        <div className="inline-actions">
          <button type="submit">Lưu</button>
          <button type="button" onClick={startAdd}>Thêm dòng mới (form trống)</button>
        </div>
      </form>
    </div>
  );
}
