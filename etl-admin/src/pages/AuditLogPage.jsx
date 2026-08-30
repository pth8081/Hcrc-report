// pages/AuditLogPage.jsx — Trang "Nhật ký thao tác": xem admin.AuditLog (ai
// làm gì), chỉ đọc — khác trang "Log" (LogPage.jsx, etl.SyncLog — log CHẠY
// JOB tự động). Lọc theo username/module/khoảng thời gian.
import { useEffect, useState } from 'react';
import { api } from '../lib/api';
import DataTable from '../components/DataTable';

export default function AuditLogPage() {
  const [rows, setRows] = useState([]);
  const [filters, setFilters] = useState({ username: '', module: '', from: '', to: '' });
  const [error, setError] = useState('');

  async function load() {
    setError('');
    const params = new URLSearchParams(Object.fromEntries(Object.entries(filters).filter(([, v]) => v)));
    try {
      const data = await api.get(`/audit-log?${params.toString()}`);
      setRows(data.rows);
    } catch (err) { setError(err.message); }
  }
  useEffect(() => { load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="page">
      <h1>Nhật ký thao tác</h1>
      {error && <p className="form-error">{error}</p>}

      <form className="inline-form" onSubmit={(e) => { e.preventDefault(); load(); }}>
        <input placeholder="Username" value={filters.username} onChange={(e) => setFilters({ ...filters, username: e.target.value })} />
        <input placeholder="Module" value={filters.module} onChange={(e) => setFilters({ ...filters, module: e.target.value })} />
        <input type="date" value={filters.from} onChange={(e) => setFilters({ ...filters, from: e.target.value })} />
        <input type="date" value={filters.to} onChange={(e) => setFilters({ ...filters, to: e.target.value })} />
        <button type="submit">Lọc</button>
      </form>

      <DataTable
        columns={[
          { key: 'CreatedAt', label: 'Thời gian', render: (r) => new Date(r.CreatedAt).toLocaleString('vi-VN') },
          { key: 'Username', label: 'Người dùng' },
          { key: 'Module', label: 'Module' },
          { key: 'ActionType', label: 'Hành động' },
          { key: 'Description', label: 'Mô tả' },
          { key: 'Status', label: 'Trạng thái' }
        ]}
        rows={rows}
      />
    </div>
  );
}
