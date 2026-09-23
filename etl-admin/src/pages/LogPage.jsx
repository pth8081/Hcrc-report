import { useEffect, useState } from 'react';
import { api } from '../lib/api';
import DataTable from '../components/DataTable';

export default function LogPage() {
  const [rows, setRows] = useState([]);
  const [status, setStatus] = useState('');
  const [page, setPage] = useState(1);
  const [error, setError] = useState('');

  const [systemRows, setSystemRows] = useState([]);
  const [level, setLevel] = useState('');
  const [systemPage, setSystemPage] = useState(1);
  const [systemError, setSystemError] = useState('');

  async function load() {
    setError('');
    const params = new URLSearchParams({ page, ...(status ? { status } : {}) });
    try {
      const data = await api.get(`/log?${params.toString()}`);
      setRows(data.rows);
    } catch (err) { setError(err.message); }
  }
  useEffect(() => { load(); }, [page, status]); // eslint-disable-line react-hooks/exhaustive-deps

  async function loadSystem() {
    setSystemError('');
    const params = new URLSearchParams({ page: systemPage, ...(level ? { level } : {}) });
    try {
      const data = await api.get(`/log/system?${params.toString()}`);
      setSystemRows(data.rows);
    } catch (err) { setSystemError(err.message); }
  }
  useEffect(() => { loadSystem(); }, [systemPage, level]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="page">
      <h1>Log</h1>
      {error && <p className="form-error">{error}</p>}

      <div className="tabs">
        <button type="button" className={status === '' ? 'active' : ''} onClick={() => { setStatus(''); setPage(1); }}>Tất cả</button>
        <button type="button" className={status === 'SUCCESS' ? 'active' : ''} onClick={() => { setStatus('SUCCESS'); setPage(1); }}>Thành công</button>
        <button type="button" className={status === 'FAILED' ? 'active' : ''} onClick={() => { setStatus('FAILED'); setPage(1); }}>Lỗi</button>
      </div>

      <DataTable
        columns={[
          { key: 'StartedAt', label: 'Bắt đầu', render: (r) => new Date(r.StartedAt).toLocaleString('vi-VN') },
          { key: 'JobName', label: 'Job' },
          { key: 'Status', label: 'Trạng thái' },
          { key: 'RowCount', label: 'Số dòng' },
          { key: 'ErrorMessage', label: 'Lỗi', render: (r) => r.ErrorMessage || '—' }
        ]}
        rows={rows}
      />

      <div className="pager">
        <button type="button" disabled={page <= 1} onClick={() => setPage(p => p - 1)}>Trang trước</button>
        <span>Trang {page}</span>
        <button type="button" onClick={() => setPage(p => p + 1)}>Trang sau</button>
      </div>

      <h1 style={{ marginTop: '2rem' }}>Nhật ký hệ thống</h1>
      <p className="form-hint">Kết nối thành công/thất bại (CSDL cố định, nguồn dữ liệu tự khai), cảnh báo cấu hình — trước đây chỉ xem được qua SSH/pm2 log.</p>
      {systemError && <p className="form-error">{systemError}</p>}

      <div className="tabs">
        <button type="button" className={level === '' ? 'active' : ''} onClick={() => { setLevel(''); setSystemPage(1); }}>Tất cả</button>
        <button type="button" className={level === 'INFO' ? 'active' : ''} onClick={() => { setLevel('INFO'); setSystemPage(1); }}>Thông tin</button>
        <button type="button" className={level === 'WARN' ? 'active' : ''} onClick={() => { setLevel('WARN'); setSystemPage(1); }}>Cảnh báo</button>
        <button type="button" className={level === 'ERROR' ? 'active' : ''} onClick={() => { setLevel('ERROR'); setSystemPage(1); }}>Lỗi</button>
      </div>

      <DataTable
        columns={[
          { key: 'CreatedAt', label: 'Thời điểm', render: (r) => new Date(r.CreatedAt).toLocaleString('vi-VN') },
          { key: 'Level', label: 'Mức độ', render: (r) => <span className={`level-badge level-${r.Level.toLowerCase()}`}>{r.Level}</span> },
          { key: 'Message', label: 'Nội dung' }
        ]}
        rows={systemRows}
      />

      <div className="pager">
        <button type="button" disabled={systemPage <= 1} onClick={() => setSystemPage(p => p - 1)}>Trang trước</button>
        <span>Trang {systemPage}</span>
        <button type="button" onClick={() => setSystemPage(p => p + 1)}>Trang sau</button>
      </div>
    </div>
  );
}
