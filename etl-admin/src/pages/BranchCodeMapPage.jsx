// pages/BranchCodeMapPage.jsx — Trang "Ánh xạ mã chi nhánh": upload file
// Excel (hoặc sửa từng dòng) khai "mã X ở nguồn nào đó" tương ứng "mã chuẩn
// Y" — quy đổi EntityCode khi job "Theo bảng" cần dùng mã khác với domain
// khác (vd BU_ID ở bảng giao dịch, STK_ID ở bảng doanh thu, cùng 1 chi
// nhánh). Chỉ vai trò 'admin' vào được (xem etl/routes/admin/branchCodeMap.js).
import { useEffect, useState } from 'react';
import { api } from '../lib/api';
import DataTable from '../components/DataTable';

const EMPTY_EDIT_FORM = { loaiMaKhac: '', maKhac: '', maChuan: '', tenSieuThi: '', trangThai: false };

export default function BranchCodeMapPage() {
  const [file, setFile] = useState(null);
  const [importResult, setImportResult] = useState(null);
  const [error, setError] = useState('');
  const [filterLoai, setFilterLoai] = useState('');
  const [rows, setRows] = useState([]);
  const [editForm, setEditForm] = useState(EMPTY_EDIT_FORM);
  const [editError, setEditError] = useState('');
  const [editResult, setEditResult] = useState('');

  function reload() {
    const qs = filterLoai ? `?loaiMaKhac=${encodeURIComponent(filterLoai)}` : '';
    api.get(`/branch-code-map${qs}`).then(setRows).catch(err => setError(err.message));
  }
  useEffect(reload, [filterLoai]);

  function startEdit(row) {
    setEditForm({
      loaiMaKhac: row.loaiMaKhac,
      maKhac: row.maKhac,
      maChuan: row.maChuan,
      tenSieuThi: row.tenSieuThi || '',
      trangThai: row.trangThai === 'DaDong'
    });
    setEditError('');
    setEditResult('');
  }

  function startAdd() {
    setEditForm({ ...EMPTY_EDIT_FORM, loaiMaKhac: filterLoai || '' });
    setEditError('');
    setEditResult('');
  }

  async function submitEdit(e) {
    e.preventDefault();
    setEditError('');
    setEditResult('');
    if (!editForm.loaiMaKhac.trim()) return setEditError('Thiếu "Loại mã"');
    if (!editForm.maKhac.trim()) return setEditError('Thiếu "Mã khác"');
    if (!editForm.maChuan.trim()) return setEditError('Thiếu "Mã chuẩn"');
    try {
      await api.put('/branch-code-map/one', {
        loaiMaKhac: editForm.loaiMaKhac.trim(),
        maKhac: editForm.maKhac.trim(),
        maChuan: editForm.maChuan.trim(),
        tenSieuThi: editForm.tenSieuThi.trim() || null,
        trangThai: editForm.trangThai ? 'DaDong' : ''
      });
      setEditResult('✅ Đã lưu.');
      setEditForm(EMPTY_EDIT_FORM);
      reload();
    } catch (err) {
      setEditError(err.message);
    }
  }

  async function removeRow(row) {
    if (!window.confirm(`Xoá ánh xạ "${row.loaiMaKhac}/${row.maKhac}"?`)) return;
    try {
      await api.del(`/branch-code-map/${row.id}`);
      reload();
    } catch (err) {
      setError(err.message);
    }
  }

  async function submitImport(e) {
    e.preventDefault();
    setError('');
    setImportResult(null);
    if (!file) return setError('Chọn file .xlsx trước');

    const formData = new FormData();
    formData.append('file', file);
    try {
      const result = await api.post('/branch-code-map/import', formData, true);
      setImportResult(result);
      setFile(null);
      reload();
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <div className="page">
      <h1>Ánh xạ mã chi nhánh</h1>
      <p>
        Dùng khi 1 chi nhánh vật lý có NHIỀU mã khác nhau tuỳ bảng nguồn (vd DSMART16: bảng
        doanh thu/tồn kho dùng <code>STK_ID</code>, bảng giao dịch dùng <code>BU_ID</code> — không
        chắc trùng số). Khai ở đây "mã X" ứng với "mã chuẩn Y" nào, rồi chọn đúng "Loại mã" này
        ở trang <strong>Đồng bộ</strong> cho job cần quy đổi — mọi job "Theo bảng" sẽ tự dùng mã
        chuẩn làm EntityCode trước khi ghi vào Data Warehouse, để các báo cáo ghép đúng theo 1 chi
        nhánh dù đọc từ nguồn/bảng khác nhau. Mã đổi về sau chỉ cần SỬA LẠI đúng dòng ở đây,
        không cần đụng tới cấu hình job.
      </p>
      <p>
        File .xlsx: dòng 1 header, cột bắt buộc <code>LoaiMaKhac</code> (tên bạn tự đặt, vd{' '}
        <code>BU_ID</code>), <code>MaKhac</code> (giá trị mã gốc ở nguồn), <code>MaChuan</code> (mã
        chuẩn dùng làm EntityCode — phải khớp mã đã dùng ở domain doanh thu/tồn kho). Cột tuỳ
        chọn: <code>TenSieuThi</code> (chỉ để dễ đọc), <code>TrangThai</code> (để trống = đang
        dùng, <code>DaDong</code> = ngừng áp dụng dòng này).
      </p>
      {error && <p className="form-error">{error}</p>}

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
        <input placeholder="Lọc theo Loại mã (vd BU_ID)" value={filterLoai} onChange={(e) => setFilterLoai(e.target.value)} />
      </div>

      <DataTable
        columns={[
          { key: 'loaiMaKhac', label: 'Loại mã' },
          { key: 'maKhac', label: 'Mã khác' },
          { key: 'maChuan', label: 'Mã chuẩn' },
          { key: 'tenSieuThi', label: 'Tên siêu thị' },
          { key: 'trangThai', label: 'Trạng thái', render: (r) => (r.trangThai === 'DaDong' ? 'Đã ngừng áp dụng' : 'Đang dùng') },
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
        rows={rows}
      />

      <h2>Sửa / thêm 1 dòng</h2>
      <p>
        Dùng khi 1 mã đổi giữa chừng — KHÔNG cần chuẩn bị lại cả file Excel. Bấm "Sửa" ở 1 dòng
        trên để tự điền sẵn, hoặc "Thêm dòng mới" cho form trống.
      </p>
      {editError && <p className="form-error">{editError}</p>}
      {editResult && <p className="form-success">{editResult}</p>}

      <form className="stacked-form" onSubmit={submitEdit}>
        <input
          placeholder="Loại mã (vd BU_ID) — phải khớp đúng ở trang Đồng bộ"
          value={editForm.loaiMaKhac}
          onChange={(e) => setEditForm({ ...editForm, loaiMaKhac: e.target.value })}
          required
        />
        <input
          placeholder="Mã khác — giá trị mã gốc ở nguồn (vd giá trị BU_ID thật)"
          value={editForm.maKhac}
          onChange={(e) => setEditForm({ ...editForm, maKhac: e.target.value })}
          required
        />
        <input
          placeholder="Mã chuẩn — mã dùng làm EntityCode (vd mã siêu thị ở domain doanh thu)"
          value={editForm.maChuan}
          onChange={(e) => setEditForm({ ...editForm, maChuan: e.target.value })}
          required
        />
        <input
          placeholder="Tên siêu thị (tuỳ chọn, chỉ để dễ đọc)"
          value={editForm.tenSieuThi}
          onChange={(e) => setEditForm({ ...editForm, tenSieuThi: e.target.value })}
        />
        <label className="checkbox-row">
          <input
            type="checkbox"
            checked={editForm.trangThai}
            onChange={(e) => setEditForm({ ...editForm, trangThai: e.target.checked })}
          />
          Ngừng áp dụng dòng ánh xạ này
        </label>
        <div className="inline-actions">
          <button type="submit">Lưu</button>
          <button type="button" onClick={startAdd}>Thêm dòng mới (form trống)</button>
        </div>
      </form>
    </div>
  );
}
