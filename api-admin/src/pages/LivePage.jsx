// pages/LivePage.jsx — "Kết nối hiện tại": 2 nguồn khác nhau (xem tài liệu
// kiến trúc "Quản Trị API HCRC", mục 01/05) —
//   1. Request /api/v1/* đang xử lý ngay lúc này — đẩy qua SSE, cập nhật tức thời.
//   2. Số kết nối CSDL đang dùng trong từng pool (DWH, OLTP) — hỏi lại mỗi 5 giây.
import { useEffect, useState } from 'react';
import DataTable from '../components/DataTable';

function elapsedMs(startedAt) {
  return Date.now() - new Date(startedAt).getTime();
}

export default function LivePage() {
  const [requests, setRequests] = useState([]);
  const [pools, setPools] = useState({});
  const [, forceTick] = useState(0); // ép render lại mỗi giây để cập nhật "đã chạy được..."

  useEffect(() => {
    const source = new EventSource('/admin/live/stream');
    source.addEventListener('snapshot', (e) => setRequests(JSON.parse(e.data)));
    source.addEventListener('start', (e) => setRequests(prev => [...prev, JSON.parse(e.data)]));
    source.addEventListener('finish', (e) => {
      const { id } = JSON.parse(e.data);
      setRequests(prev => prev.filter(r => r.id !== id));
    });
    return () => source.close();
  }, []);

  useEffect(() => {
    const tick = setInterval(() => forceTick(n => n + 1), 1000);
    return () => clearInterval(tick);
  }, []);

  useEffect(() => {
    async function loadPools() {
      const res = await fetch('/admin/live/pools', { credentials: 'include' });
      if (res.ok) setPools(await res.json());
    }
    loadPools();
    const poll = setInterval(loadPools, 5000);
    return () => clearInterval(poll);
  }, []);

  return (
    <div className="page">
      <h1>Kết nối hiện tại</h1>

      <h3>Kết nối CSDL đang dùng</h3>
      <div className="pool-cards">
        {pools.DWH && (
          <div className="pool-card">
            <div className="pool-card-title">DWH (báo cáo)</div>
            {pools.DWH.error ? <p>{pools.DWH.error}</p> : (
              <p><strong>{pools.DWH.borrowed}</strong> / {pools.DWH.size} đang dùng · {pools.DWH.pending} đang chờ</p>
            )}
          </div>
        )}
        {(pools.realtimeSources || []).map(stat => (
          <div key={stat.id} className="pool-card">
            <div className="pool-card-title">{stat.name || `Nguồn #${stat.id}`} (realtime)</div>
            {stat.error ? <p>{stat.error}</p> : (
              <p><strong>{stat.borrowed}</strong> / {stat.size} đang dùng · {stat.pending} đang chờ</p>
            )}
          </div>
        ))}
        {!pools.DWH && !(pools.realtimeSources || []).length && <p className="empty-message">Chưa có kết nối nào đang mở.</p>}
      </div>

      <h3>Request /api/v1/* đang xử lý ({requests.length})</h3>
      <DataTable
        columns={[
          { key: 'method', label: 'Method' },
          { key: 'endpoint', label: 'Endpoint' },
          { key: 'elapsed', label: 'Đã chạy', render: (r) => `${elapsedMs(r.startedAt)} ms` }
        ]}
        rows={requests}
        emptyMessage="Không có request nào đang xử lý."
      />
    </div>
  );
}
