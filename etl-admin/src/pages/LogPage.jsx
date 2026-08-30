import { useEffect, useState } from 'react';
import { api } from '../lib/api';
import DataTable from '../components/DataTable';

export default function LogPage() {
  const [rows, setRows] = useState([]);
  const [status, setStatus] = useState('');
  const [page, setPage] = useState(1);
  const [error, setError] = useState('');

  async function load() {
    setError('');
    const params = new URLSearchParams({ page, ...(status ? { status } : {}) });
    try {
      const data = await api.get(`/log?${params.toString()}`);
      setRows(data.rows);
    } catch (err) { setError(err.message); }
  }
  useEffect(() => { load(); }, [page, status]); // eslint-disable-line react-hooks/exhaustive-deps

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
    </div>
  );
}
