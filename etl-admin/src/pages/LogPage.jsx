import { useEffect, useState } from 'react';
import { api } from '../lib/api';
import DataTable from '../components/DataTable';

// Trước đây trang này có 2 khối riêng (Log chạy job từ etl.SyncLog +
// "Nhật ký hệ thống" từ etl.SystemLog) xếp chồng nhau — gây rối khi bấm tab
// (2 bộ tab Tất cả/Thành công/Lỗi và Tất cả/Thông tin/Cảnh báo/Lỗi cạnh
// nhau, dễ nhầm đang lọc bảng nào). Gộp còn 1 khối DUY NHẤT dựa trên
// etl.SystemLog — mọi sự kiện quan trọng của 1 lượt chạy job (bắt đầu/
// thành công/thất bại, kèm chi tiết lỗi đầy đủ) giờ CŨNG được ghi vào đây
// qua logInfo/logWarn/logError (xem etl/jobs/runSync.js), y hệt nội dung
// từng chỉ xem được qua SSH/pm2 log — không còn thiếu thông tin gì so với
// bảng cũ, chỉ còn 1 nơi xem duy nhất.
export default function LogPage() {
  const [rows, setRows] = useState([]);
  const [level, setLevel] = useState('');
  const [page, setPage] = useState(1);
  const [error, setError] = useState('');

  async function load() {
    setError('');
    const params = new URLSearchParams({ page, ...(level ? { level } : {}) });
    try {
      const data = await api.get(`/log/system?${params.toString()}`);
      setRows(data.rows);
    } catch (err) { setError(err.message); }
  }
  useEffect(() => { load(); }, [page, level]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="page">
      <h1>Log</h1>
      <p className="form-hint">Toàn bộ nhật ký vận hành: bắt đầu/thành công/lỗi từng lượt đồng bộ, kết nối CSDL/nguồn dữ liệu thành công/thất bại, cảnh báo cấu hình — trước đây phải SSH xem qua pm2 log mới thấy đủ.</p>
      {error && <p className="form-error">{error}</p>}

      <div className="tabs">
        <button type="button" className={level === '' ? 'active' : ''} onClick={() => { setLevel(''); setPage(1); }}>Tất cả</button>
        <button type="button" className={level === 'INFO' ? 'active' : ''} onClick={() => { setLevel('INFO'); setPage(1); }}>Thông tin</button>
        <button type="button" className={level === 'WARN' ? 'active' : ''} onClick={() => { setLevel('WARN'); setPage(1); }}>Cảnh báo</button>
        <button type="button" className={level === 'ERROR' ? 'active' : ''} onClick={() => { setLevel('ERROR'); setPage(1); }}>Lỗi</button>
      </div>

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
