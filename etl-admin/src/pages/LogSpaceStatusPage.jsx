// pages/LogSpaceStatusPage.jsx — "Giám sát Log CSDL" (bản 10.5, theo yêu cầu
// người dùng, sau sự cố thật: transaction log HCRC_DWH phình to ~329GB
// chiếm hết ổ đĩa, không ai biết cho tới khi admin tình cờ phát hiện — xem
// VERSION.md mục 10.5). Mirror đúng ConnectionStatusPage.jsx: job nền
// (etl/server.js, mỗi 15 phút, xem lib/logSpaceMonitor.js) đã kiểm tra sẵn,
// trang chỉ đọc lại. Nút "Kiểm tra lại ngay" ép chạy lại NGAY LẬP TỨC —
// dùng ĐÚNG checkAllLogSpace() y hệt job nền.
import { useEffect, useState } from 'react';
import { api } from '../lib/api';
import DataTable from '../components/DataTable';

function StatusBadge({ row }) {
  if (!row.isOk) return <span className="conn-badge conn-badge--down">🔴 Lỗi kiểm tra</span>;
  if (row.isOverThreshold) return <span className="conn-badge conn-badge--down">⚠️ Vượt ngưỡng</span>;
  return <span className="conn-badge conn-badge--ok">🟢 Bình thường</span>;
}

function formatMb(value) {
  if (value === null || value === undefined) return '—';
  return `${Number(value).toLocaleString('vi-VN')} MB`;
}

export default function LogSpaceStatusPage() {
  const [rows, setRows] = useState([]);
  const [error, setError] = useState('');
  const [checking, setChecking] = useState(false);
  const [loading, setLoading] = useState(true);

  function load() {
    return api.get('/log-space-status')
      .then(setRows)
      .catch(err => setError(err.message))
      .finally(() => setLoading(false));
  }
  useEffect(() => { load(); }, []);

  async function checkNow() {
    setChecking(true);
    setError('');
    try {
      const data = await api.post('/log-space-status/check-now', {});
      setRows(data);
    } catch (err) {
      setError(err.message);
    } finally {
      setChecking(false);
    }
  }

  const total = rows.length;
  const overCount = rows.filter(r => r.isOverThreshold).length;
  const errorCount = rows.filter(r => !r.isOk).length;

  return (
    <div className="page">
      <h1>Giám sát Log CSDL</h1>
      <p className="form-hint">
        Dung lượng transaction log của mọi CSDL SQL Server hệ thống biết tới (CSDL lõi
        DWH/ETL/RP/API + mọi Nguồn dữ liệu đã khai) — tự động kiểm tra lại mỗi 15 phút
        ở nền, gửi email cảnh báo (nếu đã cấu hình SMTP_HOST/ALERT_EMAIL_TO) khi có CSDL
        vượt ngưỡng. Bấm "Kiểm tra lại ngay" để ép kiểm tra tức thì.
      </p>
      {error && <p className="form-error">{error}</p>}

      {!loading && (
        <div className="conn-summary">
          <span className="conn-summary-total">{total} kết nối</span>
          {overCount > 0 && <span className="conn-summary-down">⚠️ {overCount} vượt ngưỡng</span>}
          {errorCount > 0 && <span className="conn-summary-down">🔴 {errorCount} lỗi kiểm tra</span>}
          {overCount === 0 && errorCount === 0 && <span className="conn-summary-ok">🟢 Tất cả bình thường</span>}
        </div>
      )}

      <button type="button" onClick={checkNow} disabled={checking}>
        {checking ? 'Đang kiểm tra...' : '⟲ Kiểm tra lại ngay'}
      </button>

      <DataTable
        columns={[
          { key: 'displayName', label: 'Kết nối' },
          { key: 'totalLogSizeMb', label: 'Dung lượng log', render: (r) => formatMb(r.totalLogSizeMb) },
          { key: 'usedLogPercent', label: '% đã dùng trong log', render: (r) => r.usedLogPercent != null ? `${r.usedLogPercent}%` : '—' },
          { key: 'status', label: 'Trạng thái', render: (r) => <StatusBadge row={r} /> },
          { key: 'lastCheckedAt', label: 'Kiểm tra lần cuối', render: (r) => r.lastCheckedAt ? new Date(r.lastCheckedAt).toLocaleString('vi-VN') : 'Chưa kiểm tra lần nào' },
          { key: 'errorMessage', label: 'Lỗi', render: (r) => r.errorMessage ? <span className="form-error">{r.errorMessage}</span> : '—' }
        ]}
        rows={rows}
        emptyMessage={loading ? 'Đang tải...' : 'Chưa có dữ liệu — chờ job nền chạy lượt đầu hoặc bấm "Kiểm tra lại ngay".'}
      />
    </div>
  );
}
