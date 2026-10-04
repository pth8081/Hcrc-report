// modules/stock-alert-upload/StockAlertUploadPage.jsx — Trang "Upload cảnh
// báo hàng tồn" (bản 8.70, theo yêu cầu người dùng) — người dùng báo cáo
// (siêu thị) tự upload file ngưỡng cảnh báo NGAY trên rp-user, KHÔNG cần
// vào etl-admin. rp-server tự kiểm tra file chỉ chứa đúng siêu thị thuộc
// "Phạm vi dữ liệu" (storeScope) của người đang đăng nhập trước khi ghi
// (xem routes/stockAlertThresholdsUpload.js) — trang này chỉ hiện RÕ phạm
// vi đó để người dùng biết trước, không tự giới hạn gì thêm ở phía giao diện.
import { useEffect, useState } from 'react';
import { api, downloadFile } from '../../lib/api';

export default function StockAlertUploadPage() {
  const [stores, setStores] = useState(undefined); // undefined = đang tải, null = Toàn bộ
  const [file, setFile] = useState(null);
  const [importResult, setImportResult] = useState(null);
  const [error, setError] = useState('');
  const [importing, setImporting] = useState(false);
  const [downloadingTemplate, setDownloadingTemplate] = useState(false);

  useEffect(() => {
    api.get('/stock-alert-upload').then(data => setStores(data.stores)).catch(err => setError(err.message));
  }, []);

  async function downloadTemplate() {
    setError('');
    setDownloadingTemplate(true);
    try {
      await downloadFile('/stock-alert-upload/template', {}, 'mau-canh-bao-hang-ton.xlsx');
    } catch (err) {
      setError(err.message);
    } finally {
      setDownloadingTemplate(false);
    }
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
      const result = await api.upload('/stock-alert-upload/import', formData);
      setImportResult(result);
      setFile(null);
    } catch (err) {
      setError(err.message);
    } finally {
      setImporting(false);
    }
  }

  return (
    <div className="page">
      <h2>Upload cảnh báo hàng tồn</h2>
      <p className="form-hint">
        Upload file Excel khai ngưỡng cảnh báo tồn kho — hệ thống sẽ đối chiếu tồn kho thật với
        đúng ngưỡng khai ở đây cho báo cáo "Cảnh báo hàng tồn". Mỗi lần nhập chỉ THAY ngưỡng của
        đúng (các) siêu thị CÓ trong file đang upload, ngưỡng của siêu thị khác giữ nguyên.
      </p>

      {stores === undefined ? (
        <p className="form-hint">Đang tải phạm vi siêu thị...</p>
      ) : stores === null ? (
        <p className="form-hint">Phạm vi: <strong>Toàn bộ</strong> — file được chứa bất kỳ siêu thị nào.</p>
      ) : (
        <p className="form-hint">
          Phạm vi của bạn: <strong>{stores.map(s => s.tenSieuThi).join(', ') || '(chưa gán siêu thị nào)'}</strong> —
          file chỉ được chứa đúng (các) siêu thị này, siêu thị khác sẽ bị từ chối.
        </p>
      )}

      {error && <p className="form-error">{error}</p>}

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
          <p>✅ Đã thay ngưỡng của (các) siêu thị trong file: {importResult.count ?? 0} dòng.</p>
          {importResult.rowErrors?.length > 0 && (
            <>
              <p>⚠️ {importResult.rowErrors.length} dòng bị bỏ qua:</p>
              <ul>{importResult.rowErrors.map((e, i) => <li key={i}>{e}</li>)}</ul>
            </>
          )}
        </div>
      )}
    </div>
  );
}
