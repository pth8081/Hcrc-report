// pages/CoreItemListPage.jsx — Trang "Danh sách hàng Core": danh sách mặt
// hàng BẮT BUỘC luôn phải có hàng, do admin tự khai/upload — KHÁC hẳn báo
// cáo "Top bán chạy đang tồn kho = 0" (tự xếp hạng theo doanh số) — dùng cho
// báo cáo "Core stock = 0" (xem rp-server/lib/coreZeroStockRunner.js).
//
// File .xlsx nhập vào có ĐÚNG 2 sheet cố định "Core Mart"/"Core Minimart" —
// upload 1 lần thay được CẢ 2 hoặc CHỈ 1 sheet (sheet nào không có trong
// file thì danh sách hiện tại của loại điểm đó GIỮ NGUYÊN). Mỗi lần upload
// 1 sheet là THAY HẲN toàn bộ danh sách của đúng loại điểm đó (xem
// etl/routes/admin/coreItemList.js) — KHÔNG cộng dồn như "Ánh xạ Điểm - STK_ID".
import { useEffect, useState } from 'react';
import { api } from '../lib/api';
import DataTable from '../components/DataTable';

const TABS = [
  { value: 'MART', label: 'Core Mart' },
  { value: 'MINIMART', label: 'Core Minimart' }
];

export default function CoreItemListPage() {
  const [file, setFile] = useState(null);
  const [importResult, setImportResult] = useState(null);
  const [error, setError] = useState('');
  const [tab, setTab] = useState('MART');
  const [filterMaHang, setFilterMaHang] = useState('');
  const [rows, setRows] = useState([]);

  function reload() {
    api.get('/core-item-list').then(setRows).catch(err => setError(err.message));
  }
  useEffect(reload, []);

  const visibleRows = rows
    .filter(r => r.loaiDiem === tab)
    .filter(r => !filterMaHang || r.maHang.toLowerCase().includes(filterMaHang.trim().toLowerCase()));

  async function removeRow(row) {
    if (!window.confirm(`Xoá mã hàng Core "${row.maHang}" (${row.loaiDiem})?`)) return;
    try {
      await api.del(`/core-item-list/${row.id}`);
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
      const result = await api.post('/core-item-list/import', formData, true);
      setImportResult(result);
      setFile(null);
      reload();
    } catch (err) {
      setError(err.message);
    }
  }

  async function downloadTemplate() {
    setError('');
    try {
      await api.downloadFile('/core-item-list/template', 'mau-danh-sach-hang-core.xlsx');
    } catch (err) {
      setError(err.message);
    }
  }

  async function downloadExport() {
    setError('');
    try {
      await api.downloadFile('/core-item-list/export', 'danh-sach-hang-core.xlsx');
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <div className="page">
      <h1>Danh sách hàng Core</h1>
      <p>
        Danh sách mặt hàng BẮT BUỘC luôn phải có hàng ("hàng Core"), áp dụng CHUNG cho MỌI siêu
        thị/cửa hàng cùng loại hình (Mart hoặc Minimart) — không khai riêng theo từng kho. Báo cáo
        "Core stock = 0" dùng ĐÚNG danh sách này để kiểm tra hết hàng, khác báo cáo "Top bán chạy
        đang tồn kho = 0" (tự xếp hạng theo doanh số, không dựa vào danh sách nào).
      </p>
      <p>
        File .xlsx: ĐÚNG 2 sheet tên cố định <code>Core Mart</code> và <code>Core Minimart</code> —
        upload 1 lần có thể chỉ chứa 1 trong 2 sheet (sheet vắng mặt thì danh sách hiện tại của loại
        điểm đó GIỮ NGUYÊN, không bị xoá). Mỗi sheet: cột bắt buộc <code>MaHang</code> (khớp đúng mã
        hàng thật đang đồng bộ), cột tuỳ chọn <code>MH</code> (mã hàng/mã vạch nội bộ khác — chỉ để
        đối chiếu), <code>TenHang</code>/<code>MaNganh</code>/<code>TenNganh</code> (tham khảo).
      </p>
      <p>
        <strong>Lưu ý quan trọng</strong>: mỗi lần nhập là <strong>THAY HẲN</strong> toàn bộ danh
        sách của loại điểm có trong file — mã hàng nào bị xoá khỏi file rồi nhập lại sẽ KHÔNG còn
        thuộc diện Core nữa (khác "Ánh xạ Điểm - STK_ID" — nhập file đó là cộng dồn/cập nhật, không
        xoá dòng không nhắc tới).
      </p>
      {error && <div className="form-error"><p>{error}</p></div>}

      <div className="inline-actions">
        <button type="button" onClick={downloadTemplate}>Tải file mẫu</button>
      </div>
      <form className="stacked-form" onSubmit={submitImport}>
        <input type="file" accept=".xlsx" onChange={(e) => setFile(e.target.files?.[0] ?? null)} required />
        <button type="submit">Nhập file danh sách Core</button>
      </form>

      {importResult && (
        <div className="import-result">
          <p>
            ✅ Đã thay danh sách:{' '}
            {Object.entries(importResult.counts || {}).map(([loaiDiem, n]) => `${loaiDiem}: ${n} mã`).join(', ') || '(không có sheet nào khớp)'}
          </p>
          {importResult.rowErrors?.length > 0 && (
            <>
              <p>⚠️ {importResult.rowErrors.length} dòng bị bỏ qua:</p>
              <ul>{importResult.rowErrors.map((e, i) => <li key={i}>{e}</li>)}</ul>
            </>
          )}
        </div>
      )}

      <h2>Danh sách đã khai</h2>
      <div className="inline-actions">
        {TABS.map(t => (
          <button
            key={t.value}
            type="button"
            onClick={() => setTab(t.value)}
            className={tab === t.value ? 'active' : ''}
          >
            {t.label} ({rows.filter(r => r.loaiDiem === t.value).length})
          </button>
        ))}
        <input placeholder="Lọc theo Mã hàng" value={filterMaHang} onChange={(e) => setFilterMaHang(e.target.value)} />
        <button type="button" onClick={downloadExport}>Xuất tất cả (Excel)</button>
      </div>

      <DataTable
        columns={[
          { key: 'maHang', label: 'Mã hàng' },
          { key: 'mh', label: 'MH (tham khảo)' },
          { key: 'tenHang', label: 'Tên hàng' },
          { key: 'maNganh', label: 'Mã ngành' },
          { key: 'tenNganh', label: 'Tên ngành' },
          { key: 'importedBy', label: 'Người nhập' },
          { key: 'importedAt', label: 'Lúc nhập', render: (r) => new Date(r.importedAt).toLocaleString('vi-VN') },
          {
            key: 'actions', label: '', render: (r) => (
              <button type="button" onClick={() => removeRow(r)}>Xoá</button>
            )
          }
        ]}
        rows={visibleRows}
      />
    </div>
  );
}
