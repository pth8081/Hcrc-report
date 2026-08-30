// pages/SalesTargetsPage.jsx — Trang "Nhập chỉ tiêu": upload file Excel
// chỉ tiêu (target/KPI) theo tháng, ghi vào dwh.SalesTargets. Vào được bởi
// role 'admin' HOẶC 'target_importer' (vai trò hẹp, chỉ thấy đúng trang
// này — xem components/Layout.jsx + etl/lib/adminAuth.js).
//
// File .xlsx: dòng 1 header, 2 cột đầu CỐ ĐỊNH "MaSieuThi" + "Thang"
// (YYYY-MM), các cột sau tuỳ ý — tên cột trở thành tên chỉ tiêu.
import { useEffect, useState } from 'react';
import { api } from '../lib/api';
import DataTable from '../components/DataTable';

export default function SalesTargetsPage() {
  const [domain, setDomain] = useState('');
  const [file, setFile] = useState(null);
  const [importResult, setImportResult] = useState(null);
  const [error, setError] = useState('');
  const [filterDomain, setFilterDomain] = useState('');
  const [filterPeriod, setFilterPeriod] = useState('');
  const [rows, setRows] = useState([]);

  function reload() {
    const params = new URLSearchParams();
    if (filterDomain) params.set('domain', filterDomain);
    if (filterPeriod) params.set('periodMonth', `${filterPeriod}-01`);
    const qs = params.toString();
    api.get(`/sales-targets${qs ? `?${qs}` : ''}`).then(setRows).catch(err => setError(err.message));
  }
  useEffect(reload, [filterDomain, filterPeriod]);

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
          { key: 'importedAt', label: 'Lúc nhập', render: (r) => new Date(r.importedAt).toLocaleString('vi-VN') }
        ]}
        rows={rows}
      />
    </div>
  );
}
