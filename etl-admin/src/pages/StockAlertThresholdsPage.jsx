// pages/StockAlertThresholdsPage.jsx — Trang "Cảnh báo hàng tồn": danh sách
// NGƯỠNG cảnh báo tồn kho do admin tự khai/upload — MỖI DÒNG có ngưỡng
// RIÊNG (khác "Danh sách hàng Core" — CHỈ 1 ngưỡng CHUNG cho mọi mặt hàng,
// xem rp-server/lib/coreZeroStockRunner.js). Báo cáo "Cảnh báo hàng tồn"
// (rp-server, SourceType='stockAlert') đối chiếu tồn kho THẬT (đồng bộ từ
// tonkho_sku) với ĐÚNG ngưỡng của từng (Mã hàng, Siêu thị) khai ở đây —
// dòng nào CHƯA khai ngưỡng thì KHÔNG được cảnh báo (coi như không theo
// dõi), khác hẳn 1 ngưỡng chung áp cho mọi mặt hàng.
//
// Nhà cung cấp/Mã điểm (siêu thị) ở đây CHỈ là thông tin admin tự gõ khi
// khai ngưỡng (không đối chiếu với dữ liệu đồng bộ nào khác) — dùng để
// hiển thị/lọc trên báo cáo, KHÔNG phải nguồn dữ liệu nhà cung cấp thật
// (hệ thống hiện chưa đồng bộ dữ liệu nhà cung cấp từ nguồn nào).
import { useEffect, useState } from 'react';
import { api } from '../lib/api';
import DataTable from '../components/DataTable';
import { useRowSelection } from '../lib/useRowSelection';

export default function StockAlertThresholdsPage() {
  const [file, setFile] = useState(null);
  const [importResult, setImportResult] = useState(null);
  const [error, setError] = useState('');
  const [filterMaHang, setFilterMaHang] = useState('');
  const [rows, setRows] = useState([]);
  const [importing, setImporting] = useState(false);
  const [downloadingTemplate, setDownloadingTemplate] = useState(false);
  const [downloadingExport, setDownloadingExport] = useState(false);
  const [deletingId, setDeletingId] = useState(null);
  const selection = useRowSelection(row => row.id);
  const [bulkDeleting, setBulkDeleting] = useState(false);

  function reload() {
    api.get('/stock-alert-thresholds').then(setRows).catch(err => setError(err.message));
  }
  useEffect(reload, []);

  const visibleRows = rows.filter(r => !filterMaHang || r.maHang.toLowerCase().includes(filterMaHang.trim().toLowerCase()));

  async function removeRow(row) {
    if (!window.confirm(`Xoá ngưỡng cảnh báo mã hàng "${row.maHang}" tại "${row.maDiem}"?`)) return;
    setDeletingId(row.id);
    try {
      await api.del(`/stock-alert-thresholds/${row.id}`);
      reload();
    } catch (err) {
      setError(err.message);
    } finally {
      setDeletingId(null);
    }
  }

  async function deleteSelected() {
    if (selection.selectedIds.size === 0) return;
    if (!confirm(`Xoá ${selection.selectedIds.size} ngưỡng cảnh báo đã chọn?`)) return;
    setBulkDeleting(true);
    try {
      for (const id of selection.selectedIds) {
        await api.del(`/stock-alert-thresholds/${id}`);
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
      const result = await api.post('/stock-alert-thresholds/import', formData, true);
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
      await api.downloadFile('/stock-alert-thresholds/template', 'mau-canh-bao-hang-ton.xlsx');
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
      await api.downloadFile('/stock-alert-thresholds/export', 'canh-bao-hang-ton.xlsx');
    } catch (err) {
      setError(err.message);
    } finally {
      setDownloadingExport(false);
    }
  }

  return (
    <div className="page">
      <h1>Cảnh báo hàng tồn</h1>
      <p>
        Khai ngưỡng cảnh báo RIÊNG cho từng cặp (Mã hàng, Siêu thị) — khác "Danh sách hàng Core"
        (1 ngưỡng CHUNG cho mọi mặt hàng). Báo cáo "Cảnh báo hàng tồn" sẽ đối chiếu tồn kho thật với
        đúng ngưỡng khai ở đây; mã hàng/siêu thị nào CHƯA khai ngưỡng sẽ KHÔNG được theo dõi.
      </p>
      <p>
        File .xlsx — cột bắt buộc <code>MaHang</code> (khớp đúng mã hàng thật đang đồng bộ),{' '}
        <code>MaDiem</code> (siêu thị — khớp "Ánh xạ Điểm - STK_ID"), <code>NguongCanhBao</code>{' '}
        (số lượng — tồn &lt; ngưỡng này sẽ bị cảnh báo); cột tuỳ chọn <code>TenHang</code>,{' '}
        <code>NhaCungCap</code> (chỉ để hiển thị/lọc, không đối chiếu dữ liệu đồng bộ nào).
      </p>
      <p>
        <strong>Lưu ý</strong>: mỗi lần nhập là <strong>THAY HẲN</strong> toàn bộ danh sách ngưỡng —
        giống "Danh sách hàng Core", khác "Ánh xạ Điểm - STK_ID" (cộng dồn/cập nhật).
      </p>
      {error && <div className="form-error"><p>{error}</p></div>}

      <div className="inline-actions">
        <button type="button" onClick={downloadTemplate} disabled={downloadingTemplate}>
          {downloadingTemplate ? 'Đang tải...' : 'Tải file mẫu'}
        </button>
      </div>
      <form className="stacked-form" onSubmit={submitImport}>
        <input type="file" accept=".xlsx" onChange={(e) => setFile(e.target.files?.[0] ?? null)} required />
        <button type="submit" disabled={importing}>{importing ? 'Đang nhập...' : 'Nhập file ngưỡng cảnh báo'}</button>
      </form>

      {importResult && (
        <div className="import-result">
          <p>✅ Đã thay danh sách: {importResult.count ?? 0} dòng.</p>
          {importResult.rowErrors?.length > 0 && (
            <>
              <p>⚠️ {importResult.rowErrors.length} dòng bị bỏ qua:</p>
              <ul>{importResult.rowErrors.map((e, i) => <li key={i}>{e}</li>)}</ul>
            </>
          )}
        </div>
      )}

      <h2>Danh sách đã khai ({rows.length})</h2>
      <div className="inline-actions">
        <input placeholder="Lọc theo Mã hàng" value={filterMaHang} onChange={(e) => setFilterMaHang(e.target.value)} />
        <button type="button" onClick={downloadExport} disabled={downloadingExport}>
          {downloadingExport ? 'Đang xuất...' : 'Xuất tất cả (Excel)'}
        </button>
      </div>

      <DataTable
        columns={[
          { key: 'maHang', label: 'Mã hàng' },
          { key: 'tenHang', label: 'Tên hàng' },
          { key: 'nhaCungCap', label: 'Nhà cung cấp' },
          { key: 'maDiem', label: 'Siêu thị (Mã điểm)' },
          { key: 'nguongCanhBao', label: 'Ngưỡng cảnh báo' },
          { key: 'importedBy', label: 'Người nhập' },
          { key: 'importedAt', label: 'Lúc nhập', render: (r) => new Date(r.importedAt).toLocaleString('vi-VN') },
          {
            key: 'actions', label: '', render: (r) => (
              <button type="button" onClick={() => removeRow(r)} disabled={deletingId === r.id}>
                {deletingId === r.id ? 'Đang xoá...' : 'Xoá'}
              </button>
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
    </div>
  );
}
