// pages/LogPage.jsx — Trang "Log": xem admin.SystemLog (nhật ký vận hành
// chung — kết nối CSDL thành công/thất bại, lỗi request không bắt được ở
// route cụ thể — xem api-server/lib/systemLog.js), chỉ đọc — khác trang
// "Nhật ký thao tác" (AuditLogPage.jsx, admin.AuditLog — ai làm gì) và
// "Lịch sử" (HistoryPage.jsx, api.RequestLog — log GỌI API của đối tác
// ngoài). Lọc theo mức độ + khoảng thời gian, cùng khuôn
// etl-admin/src/pages/LogPage.jsx.
import { useEffect, useState } from 'react';
import { api } from '../lib/api';
import DataTable from '../components/DataTable';

export default function LogPage() {
  const [rows, setRows] = useState([]);
  const [level, setLevel] = useState('');
  const [range, setRange] = useState({ from: '', to: '' });
  const [page, setPage] = useState(1);
  const [error, setError] = useState('');

  async function load() {
    setError('');
    const params = new URLSearchParams({
      page,
      ...(level ? { level } : {}),
      ...(range.from ? { from: range.from } : {}),
      ...(range.to ? { to: range.to } : {})
    });
    try {
      const data = await api.get(`/log?${params.toString()}`);
      setRows(data.rows);
    } catch (err) { setError(err.message); }
  }
  useEffect(() => { load(); }, [page, level]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="page">
      <h1>Log</h1>
      <p className="form-hint">Toàn bộ nhật ký vận hành: kết nối CSDL thành công/thất bại, lỗi request không bắt được ở route cụ thể — trước đây phải SSH xem qua pm2 log mới thấy đủ. Khác trang "Nhật ký thao tác" (ai làm gì) và "Lịch sử" (log gọi API của đối tác ngoài).</p>
      {error && <p className="form-error">{error}</p>}

      <div className="tabs">
        <button type="button" className={level === '' ? 'active' : ''} onClick={() => { setLevel(''); setPage(1); }}>Tất cả</button>
        <button type="button" className={level === 'INFO' ? 'active' : ''} onClick={() => { setLevel('INFO'); setPage(1); }}>Thông tin</button>
        <button type="button" className={level === 'WARN' ? 'active' : ''} onClick={() => { setLevel('WARN'); setPage(1); }}>Cảnh báo</button>
        <button type="button" className={level === 'ERROR' ? 'active' : ''} onClick={() => { setLevel('ERROR'); setPage(1); }}>Lỗi</button>
      </div>

      <form className="inline-form" onSubmit={(e) => { e.preventDefault(); setPage(1); load(); }}>
        <input type="date" value={range.from} onChange={(e) => setRange({ ...range, from: e.target.value })} />
        <input type="date" value={range.to} onChange={(e) => setRange({ ...range, to: e.target.value })} />
        <button type="submit">Lọc</button>
      </form>

      <DataTable
        columns={[
          { key: 'CreatedAt', label: 'Thời điểm', render: (r) => new Date(r.CreatedAt).toLocaleString('vi-VN') },
          { key: 'Level', label: 'Mức độ', render: (r) => <span className={`level-badge level-${r.Level.toLowerCase()}`}>{r.Level}</span> },
          { key: 'Message', label: 'Nội dung' }
        ]}
        rows={rows}
      />

      <div className="pager">
        <button type="button" disabled={page <= 1} onClick={() => setPage(p => p - 1)}>Trang trước</button>
        <span>Trang {page}</span>
        <button type="button" onClick={() => setPage(p => p + 1)}>Trang sau</button>
      </div>
    </div>
  );
}
