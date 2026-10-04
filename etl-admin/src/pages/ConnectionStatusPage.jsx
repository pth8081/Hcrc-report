// pages/ConnectionStatusPage.jsx — "Trạng thái kết nối" (NHÁP — demo, chưa
// merge chính thức): xem NGAY trạng thái kết nối của MỌI "Nguồn dữ liệu"
// (etl.DataSources) mà KHÔNG phải đợi tạo kết nối thật mỗi lần vào trang —
// job nền (etl/jobs/connectionHealthScheduler.js, dự kiến chạy mỗi 10-15
// phút) đã kiểm tra sẵn + lưu kết quả, trang này chỉ đọc lại. Nút "Kiểm tra
// lại ngay" ép chạy lại NGAY LẬP TỨC (không đợi tới chu kỳ tiếp theo) —
// dùng lại đúng testConnectionsBatch() (song song có giới hạn 5) đã có sẵn.
import { useEffect, useState } from 'react';
import { api } from '../lib/api';
import DataTable from '../components/DataTable';

function StatusBadge({ connected }) {
  return connected
    ? <span className="conn-badge conn-badge--ok">🟢 Kết nối được</span>
    : <span className="conn-badge conn-badge--down">🔴 Mất kết nối</span>;
}

export default function ConnectionStatusPage() {
  const [rows, setRows] = useState([]);
  const [error, setError] = useState('');
  const [checking, setChecking] = useState(false);
  const [loading, setLoading] = useState(true);

  function load() {
    return api.get('/data-sources/connection-status')
      .then(setRows)
      .catch(err => setError(err.message))
      .finally(() => setLoading(false));
  }
  useEffect(() => { load(); }, []);

  async function checkNow() {
    setChecking(true);
    setError('');
    try {
      const data = await api.post('/data-sources/connection-status/check-now', {});
      setRows(data);
    } catch (err) {
      setError(err.message);
    } finally {
      setChecking(false);
    }
  }

  const total = rows.length;
  const downCount = rows.filter(r => !r.isConnected).length;
  // Mất kết nối nổi lên đầu — đúng dòng cần chú ý trước, không phải kéo
  // xuống tìm giữa danh sách dài.
  const sortedRows = [...rows].sort((a, b) => Number(a.isConnected) - Number(b.isConnected));

  return (
    <div className="page">
      <h1>Trạng thái kết nối</h1>
      <p className="form-hint">
        Trạng thái kết nối CSDL SQL Server của mọi "Nguồn dữ liệu" — tự động kiểm tra lại
        mỗi 10-15 phút ở nền, không cần đợi mỗi lần vào trang. Bấm "Kiểm tra lại ngay" để
        ép kiểm tra tức thì (không chờ tới chu kỳ tiếp theo).
      </p>
      {error && <p className="form-error">{error}</p>}

      {!loading && (
        <div className="conn-summary">
          <span className="conn-summary-total">{total} nguồn dữ liệu</span>
          {downCount > 0
            ? <span className="conn-summary-down">🔴 {downCount} đang mất kết nối</span>
            : <span className="conn-summary-ok">🟢 Tất cả đang kết nối được</span>}
        </div>
      )}

      <button type="button" onClick={checkNow} disabled={checking}>
        {checking ? 'Đang kiểm tra...' : '⟲ Kiểm tra lại ngay'}
      </button>

      <DataTable
        columns={[
          { key: 'name', label: 'Tên nguồn dữ liệu' },
          { key: 'server', label: 'Server', render: (r) => `${r.server}:${r.port}` },
          { key: 'status', label: 'Trạng thái', render: (r) => <StatusBadge connected={r.isConnected} /> },
          { key: 'lastCheckedAt', label: 'Kiểm tra lần cuối', render: (r) => r.lastCheckedAt ? new Date(r.lastCheckedAt).toLocaleString('vi-VN') : 'Chưa kiểm tra lần nào' },
          { key: 'errorMessage', label: 'Lỗi', render: (r) => r.errorMessage ? <span className="form-error">{r.errorMessage}</span> : '—' }
        ]}
        rows={sortedRows}
        emptyMessage={loading ? 'Đang tải...' : 'Chưa có Nguồn dữ liệu nào.'}
      />
    </div>
  );
}
