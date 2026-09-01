// pages/SalesTargetsPage.jsx — Trang "Nhập chỉ tiêu": upload file Excel
// chỉ tiêu (target/KPI) theo tháng, ghi vào dwh.SalesTargets. Vào được bởi
// role 'admin' HOẶC 'target_importer' (vai trò hẹp, chỉ thấy đúng trang
// này — xem components/Layout.jsx + etl/lib/adminAuth.js).
//
// File .xlsx: dòng 1 header, 2 cột đầu CỐ ĐỊNH "MaSieuThi" + "Thang"
// (YYYY-MM), các cột sau tuỳ ý — tên cột trở thành tên chỉ tiêu. Cột
// "TrangThai"/"MaNganhHang" (cả 2 TUỲ CHỌN) có ý nghĩa riêng, không trở
// thành tên chỉ tiêu — xem chú thích trong etl/lib/salesTargetsImport.js.
import { useEffect, useState } from 'react';
import { api } from '../lib/api';
import DataTable from '../components/DataTable';

const EMPTY_EDIT_FORM = { domain: '', entityCode: '', periodMonth: '', trangThai: false, otherTargetsJson: '{}' };

export default function SalesTargetsPage() {
  const [domain, setDomain] = useState('');
  const [file, setFile] = useState(null);
  const [importResult, setImportResult] = useState(null);
  const [error, setError] = useState('');
  const [filterDomain, setFilterDomain] = useState('');
  const [filterPeriod, setFilterPeriod] = useState('');
  const [rows, setRows] = useState([]);
  const [editForm, setEditForm] = useState(EMPTY_EDIT_FORM);
  const [editError, setEditError] = useState('');
  const [editResult, setEditResult] = useState('');

  function reload() {
    const params = new URLSearchParams();
    if (filterDomain) params.set('domain', filterDomain);
    if (filterPeriod) params.set('periodMonth', `${filterPeriod}-01`);
    const qs = params.toString();
    api.get(`/sales-targets${qs ? `?${qs}` : ''}`).then(setRows).catch(err => setError(err.message));
  }
  useEffect(reload, [filterDomain, filterPeriod]);

  // Điền sẵn dữ liệu HIỆN CÓ của dòng đó lên form — sửa xong gửi lại NGUYÊN
  // targets (route PUT /sales-targets/one ghi đè cả TargetsJson, không tự
  // merge từng phần ở server), tránh mất chỉ tiêu khác chỉ vì tick 1 ô.
  function startEdit(row) {
    const { TrangThai, ...otherTargets } = row.targets;
    setEditForm({
      domain: row.domain,
      entityCode: row.entityCode,
      periodMonth: String(row.periodMonth).slice(0, 7),
      trangThai: TrangThai === 'DaDong',
      otherTargetsJson: JSON.stringify(otherTargets, null, 2)
    });
    setEditError('');
    setEditResult('');
  }

  function startAdd() {
    setEditForm({ ...EMPTY_EDIT_FORM, domain: filterDomain || '', periodMonth: filterPeriod || '' });
    setEditError('');
    setEditResult('');
  }

  async function submitEdit(e) {
    e.preventDefault();
    setEditError('');
    setEditResult('');
    if (!editForm.domain.trim()) return setEditError('Thiếu domain');
    if (!editForm.entityCode.trim()) return setEditError('Thiếu mã siêu thị');
    if (!editForm.periodMonth) return setEditError('Thiếu tháng áp dụng');
    let otherTargets;
    try {
      otherTargets = JSON.parse(editForm.otherTargetsJson || '{}');
    } catch {
      return setEditError('Ô "Chỉ tiêu khác" phải là JSON hợp lệ, vd {"ChiTieuDoanhThu": 100000000}');
    }
    try {
      await api.put('/sales-targets/one', {
        domain: editForm.domain.trim(),
        entityCode: editForm.entityCode.trim(),
        periodMonth: editForm.periodMonth,
        trangThai: editForm.trangThai ? 'DaDong' : '',
        targets: otherTargets
      });
      setEditResult('✅ Đã lưu.');
      setEditForm(EMPTY_EDIT_FORM);
      reload();
    } catch (err) {
      setEditError(err.message);
    }
  }

  async function submitImport(e) {
    e.preventDefault();
    setError('');
    setImportResult(null);
    if (!domain.trim()) return setError('Thiếu domain');
    if (!file) return setError('Chọn file .xlsx trước');

    const formData = new FormData();
    formData.append('domain', domain.trim());
    formData.append('file', file);
    try {
      const result = await api.post('/sales-targets/import', formData, true);
      setImportResult(result);
      setFile(null);
      reload();
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <div className="page">
      <h1>Nhập chỉ tiêu</h1>
      <p>
        Tải lên file Excel (.xlsx) chỉ tiêu theo tháng cho từng siêu thị — nhập lại đúng
        domain + tháng sẽ GHI ĐÈ số liệu cũ, không cộng dồn. Dòng 1 là header, 2 cột đầu
        cố định tên <code>MaSieuThi</code> và <code>Thang</code> (dạng <code>YYYY-MM</code>),
        các cột sau tuỳ ý — tên cột trở thành tên chỉ tiêu (vd <code>ChiTieuDoanhThu</code>,
        <code>ChiTieuGiaoDich</code>).
      </p>
      <p>
        Cột <code>TrangThai</code> (TUỲ CHỌN) — ghi <code>DaDong</code> để LOẠI HẲN siêu thị
        đó khỏi báo cáo (composite) tháng này, để trống hoặc ghi <code>HoatDong</code> = hiện
        bình thường. Bỏ trống cả cột này (không nhập gì) KHÔNG loại siêu thị — chỉ đánh dấu
        rõ <code>DaDong</code> mới loại, tránh mất siêu thị khỏi báo cáo chỉ vì quên nhập.
      </p>
      <p>
        Cột <code>MaNganhHang</code> (TUỲ CHỌN) — điền chỉ tiêu THEO NGÀNH HÀNG thay vì cả
        siêu thị: dòng nào có giá trị cột này thì mã thực thể lưu lại thành
        <code>&lt;MaSieuThi&gt;_&lt;MaNganhHang&gt;</code> — PHẢI khớp đúng cách ETL đặt "Cột
        khoá" cho domain thực đạt tương ứng mới ghép đúng vào báo cáo (xem
        hướng_dẫn_báo_cáo.md mục 5). Dòng để trống cột này vẫn là chỉ tiêu THEO SIÊU THỊ như
        trước — dùng lẫn cả 2 kiểu trong cùng 1 file được.
      </p>
      {error && <p className="form-error">{error}</p>}

      <form className="stacked-form" onSubmit={submitImport}>
        <input
          placeholder="Domain báo cáo áp dụng (vd doanhthu_chinhanh)"
          value={domain}
          onChange={(e) => setDomain(e.target.value)}
          required
        />
        <input type="file" accept=".xlsx" onChange={(e) => setFile(e.target.files?.[0] ?? null)} required />
        <button type="submit">Nhập chỉ tiêu</button>
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

      <h2>Chỉ tiêu đã nhập</h2>
      <div className="inline-actions">
        <input placeholder="Lọc theo domain" value={filterDomain} onChange={(e) => setFilterDomain(e.target.value)} />
        <input type="month" value={filterPeriod} onChange={(e) => setFilterPeriod(e.target.value)} />
      </div>

      <DataTable
        columns={[
          { key: 'domain', label: 'Domain' },
          { key: 'entityCode', label: 'Mã siêu thị' },
          { key: 'periodMonth', label: 'Tháng', render: (r) => String(r.periodMonth).slice(0, 7) },
          { key: 'targets', label: 'Chỉ tiêu', render: (r) => Object.entries(r.targets).map(([k, v]) => `${k}=${v}`).join(', ') },
          { key: 'importedBy', label: 'Người nhập' },
          { key: 'importedAt', label: 'Lúc nhập', render: (r) => new Date(r.importedAt).toLocaleString('vi-VN') },
          { key: 'actions', label: '', render: (r) => <button type="button" onClick={() => startEdit(r)}>Sửa</button> }
        ]}
        rows={rows}
      />

      <h2>Sửa / thêm 1 siêu thị</h2>
      <p>
        Dùng khi giữa tháng có siêu thị mới mở hoặc đóng cửa — KHÔNG cần chuẩn bị lại cả file
        Excel. Bấm "Sửa" ở 1 dòng trên để tự điền sẵn dữ liệu hiện có, hoặc "Thêm siêu thị mới"
        cho dòng trống. Lưu sẽ GHI ĐÈ nguyên chỉ tiêu của đúng siêu thị + tháng đó — dữ liệu
        hiện có đã tự điền sẵn nên không lo mất, chỉ cần sửa đúng phần cần đổi.
      </p>
      {editError && <p className="form-error">{editError}</p>}
      {editResult && <p className="form-success">{editResult}</p>}

      <form className="stacked-form" onSubmit={submitEdit}>
        <input
          placeholder="Domain (vd doanhthu_chinhanh)"
          value={editForm.domain}
          onChange={(e) => setEditForm({ ...editForm, domain: e.target.value })}
          required
        />
        <input
          placeholder="Mã thực thể — MaSieuThi (vd BRGHP), hoặc MaSieuThi_MaNganhHang cho chỉ tiêu theo ngành hàng (vd BRGHP_THUCPHAM)"
          value={editForm.entityCode}
          onChange={(e) => setEditForm({ ...editForm, entityCode: e.target.value })}
          required
        />
        <input
          type="month"
          value={editForm.periodMonth}
          onChange={(e) => setEditForm({ ...editForm, periodMonth: e.target.value })}
          required
        />
        <label className="checkbox-row">
          <input
            type="checkbox"
            checked={editForm.trangThai}
            onChange={(e) => setEditForm({ ...editForm, trangThai: e.target.checked })}
          />
          Đã đóng cửa (loại khỏi báo cáo tháng này)
        </label>
        <textarea
          placeholder='Chỉ tiêu khác dạng JSON, vd {"ChiTieuDoanhThu": 150000000} — nếu Mã thực thể ở trên là dạng ghép ngành hàng, nên thêm cả {"MaSieuThi": "BRGHP", "MaNganhHang": "THUCPHAM", "ChiTieuDoanhThu": 50000000} để báo cáo đọc thẳng, không phải tự tách chuỗi'
          rows={4}
          value={editForm.otherTargetsJson}
          onChange={(e) => setEditForm({ ...editForm, otherTargetsJson: e.target.value })}
        />
        <div className="inline-actions">
          <button type="submit">Lưu</button>
          <button type="button" onClick={startAdd}>Thêm siêu thị mới (form trống)</button>
        </div>
      </form>
    </div>
  );
}
