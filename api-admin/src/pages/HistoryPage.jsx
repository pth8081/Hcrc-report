// pages/HistoryPage.jsx — "Lịch sử": api.RequestLog, chỉ đọc, lọc + phân trang.
import { useEffect, useState } from 'react';
import { api } from '../lib/api';
import DataTable from '../components/DataTable';

export default function HistoryPage() {
  const [rows, setRows] = useState([]);
  const [filters, setFilters] = useState({ endpoint: '', from: '', to: '' });
  const [page, setPage] = useState(1);
  const [error, setError] = useState('');

  async function load() {
    setError('');
    const params = new URLSearchParams({ ...Object.fromEntries(Object.entries(filters).filter(([, v]) => v)), page });
    try {
      const data = await api.get(`/history?${params.toString()}`);
      setRows(data.rows);
    } catch (err) { setError(err.message); }
  }
  useEffect(() => { load(); }, [page]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="page">
      <h1>Lịch sử</h1>
      {error && <p className="form-error">{error}</p>}

      <form className="inline-form" onSubmit={(e) => { e.preventDefault(); setPage(1); load(); }}>
        <input placeholder="Endpoint chứa..." value={filters.endpoint} onChange={(e) => setFilters({ ...filters, endpoint: e.target.value })} />
        <input type="date" value={filters.from} onChange={(e) => setFilters({ ...filters, from: e.target.value })} />
        <input type="date" value={filters.to} onChange={(e) => setFilters({ ...filters, to: e.target.value })} />
        <button type="submit">Lọc</button>
      </form>

      <DataTable
        columns={[
          { key: 'RequestedAt', label: 'Thời gian', render: (r) => new Date(r.RequestedAt).toLocaleString('vi-VN') },
          { key: 'ConsumerName', label: 'Đối tác', render: (r) => r.ConsumerName || '—' },
          { key: 'Method', label: 'Method' },
          { key: 'Endpoint', label: 'Endpoint' },
          { key: 'StatusCode', label: 'Mã trạng thái' },
          { key: 'DurationMs', label: 'Thời gian xử lý', render: (r) => `${r.DurationMs} ms` }
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
