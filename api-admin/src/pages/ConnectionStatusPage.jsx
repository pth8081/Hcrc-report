// pages/ConnectionStatusPage.jsx — "Trạng thái kết nối" (bản 8.57) — mirror
// ĐÚNG etl-admin/src/pages/ConnectionStatusPage.jsx, áp dụng cho
// api.DataSources (xem api-server/routes/admin/connectionStatus.js).
import { useEffect, useState } from 'react';
import { api } from '../lib/api';
import DataTable from '../components/DataTable';

// isConnected: true/false (đã kiểm tra) | null (CHƯA kiểm tra lần nào —
// nguồn vừa tạo, job nền chưa kịp chạy lượt đầu) — tách riêng, KHÔNG gộp
// chung với "mất kết nối" (dễ hiểu nhầm là lỗi thật trong khi chỉ là chưa
// có dữ liệu).
function StatusBadge({ connected }) {
  if (connected === null) return <span className="conn-badge conn-badge--pending">⏳ Chưa kiểm tra</span>;
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
    return api.get('/connection-status')
      .then(setRows)
      .catch(err => setError(err.message))
      .finally(() => setLoading(false));
  }
  useEffect(() => { load(); }, []);

  async function checkNow() {
    setChecking(true);
    setError('');
    try {
      const data = await api.post('/connection-status/check-now', {});
      setRows(data);
    } catch (err) {
      setError(err.message);
    } finally {
      setChecking(false);
    }
  }

  const total = rows.length;
  const downCount = rows.filter(r => r.isConnected === false).length;
  // Mất kết nối / chưa kiểm tra nổi lên đầu (rank 0), kết nối được xuống
  // cuối (rank 1) — đúng dòng cần chú ý trước, không phải kéo xuống tìm
  // giữa danh sách dài.
  const rank = (r) => (r.isConnected === true ? 1 : 0);
  const sortedRows = [...rows].sort((a, b) => rank(a) - rank(b));

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
