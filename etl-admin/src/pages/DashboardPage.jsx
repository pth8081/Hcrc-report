import { useEffect, useMemo, useState } from 'react';
import { api } from '../lib/api';
import DataTable from '../components/DataTable';

const STATUS_FILTERS = [
  { value: 'all', label: 'Tất cả' },
  { value: 'failing', label: 'Đang lỗi' },
  { value: 'overdue', label: 'Quá hạn' }
];

function matchesSearch(name, search) {
  return !search || String(name || '').toLowerCase().includes(search.toLowerCase());
}

export default function DashboardPage() {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');

  useEffect(() => {
    api.get('/dashboard').then(setData).catch(err => setError(err.message));
  }, []);

  // Lọc chỉ để XEM (không đổi cấu hình/dữ liệu gì) — danh sách "Từng job"
  // dài dần theo số kết nối (vd 33+ chi nhánh) nên cần thu gọn nhanh về
  // đúng job đang có vấn đề, thay vì cuộn tay qua toàn bộ. Ô tìm kiếm áp
  // dụng chung cho cả 3 bảng (theo tên job); tab trạng thái CHỈ áp dụng
  // bảng "Từng job" — 2 bảng còn lại vốn đã là "lịch sử lỗi/lịch sử chạy",
  // tự thân đã đúng nghĩa "đang lỗi" hoặc "gần đây" rồi.
  const filteredJobs = useMemo(() => {
    if (!data) return [];
    return data.jobs.filter(j => {
      if (!matchesSearch(j.Name, search)) return false;
      if (statusFilter === 'failing') return j.LastRunStatus === 'FAILED';
      if (statusFilter === 'overdue') return j.IsOverdue;
      return true;
    });
  }, [data, search, statusFilter]);
  const filteredFailing = useMemo(
    () => (data ? data.failingLast24h.filter(r => matchesSearch(r.Name, search)) : []),
    [data, search]
  );
  const filteredRecent = useMemo(
    () => (data ? data.recentRuns.filter(r => matchesSearch(r.JobName, search)) : []),
    [data, search]
  );

  if (error) return <p className="form-error">{error}</p>;
  if (!data) return <p>Đang tải...</p>;

  return (
    <div className="page">
      <h1>Dashboard</h1>

      <div className="pool-cards">
        <div className="pool-card">
          <div className="pool-card-title">Job đồng bộ</div>
          <p><strong>{data.totals.ActiveJobs}</strong> / {data.totals.TotalJobs} đang bật</p>
        </div>
        <div className="pool-card">
          <div className="pool-card-title">Nguồn dữ liệu</div>
          <p><strong>{data.totals.ActiveSources}</strong> đang hoạt động</p>
        </div>
        <div className="pool-card">
          <div className="pool-card-title">Lỗi 24h qua</div>
          <p><strong>{data.failingLast24h.length}</strong> lượt chạy lỗi</p>
        </div>
      </div>

      <input
        placeholder="Tìm theo tên job..."
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        className="dashboard-search"
      />

      {data.failingLast24h.length > 0 && (
        <>
          <h3>Job lỗi trong 24h qua</h3>
          <DataTable
            columns={[
              { key: 'Name', label: 'Job' },
              { key: 'ErrorMessage', label: 'Lỗi' },
              { key: 'StartedAt', label: 'Lúc', render: (r) => new Date(r.StartedAt).toLocaleString('vi-VN') }
            ]}
            rows={filteredFailing}
            emptyMessage="Không có job nào khớp tìm kiếm."
          />
        </>
      )}

      <h3>Từng job</h3>
      <div className="tabs">
        {STATUS_FILTERS.map(f => (
          <button
            type="button"
            key={f.value}
            className={statusFilter === f.value ? 'active' : ''}
            onClick={() => setStatusFilter(f.value)}
          >
            {f.label}
          </button>
        ))}
      </div>
      <DataTable
        columns={[
          { key: 'Name', label: 'Tên' },
          { key: 'Type', label: 'Loại' },
          { key: 'CronExpression', label: 'Lịch chạy' },
          { key: 'IsActive', label: 'Trạng thái', render: (r) => (r.IsActive ? 'Bật' : 'Tắt') },
          { key: 'LastSyncedAt', label: 'Đồng bộ gần nhất', render: (r) => (r.LastSyncedAt ? new Date(r.LastSyncedAt).toLocaleString('vi-VN') : 'Chưa chạy lần nào') },
          {
            key: 'LastRunStatus', label: 'Lượt chạy gần nhất', render: (r) => {
              if (!r.LastRunAt) return 'Chưa chạy lần nào';
              const time = new Date(r.LastRunAt).toLocaleString('vi-VN');
              return r.LastRunStatus === 'FAILED'
                ? <span className="form-error" title={r.LastRunError || ''}>⛔ {time}</span>
                : `✅ ${time}`;
            }
          },
          { key: 'IsOverdue', label: '', render: (r) => (r.IsOverdue ? <span className="form-error">⚠️ Quá hạn</span> : '') }
        ]}
        rows={filteredJobs}
        emptyMessage="Không có job nào khớp bộ lọc."
      />

      <h3>20 lượt chạy gần nhất</h3>
      <DataTable
        columns={[
          { key: 'JobName', label: 'Job' },
          { key: 'Status', label: 'Trạng thái' },
          { key: 'RowCount', label: 'Số dòng' },
          { key: 'StartedAt', label: 'Bắt đầu', render: (r) => new Date(r.StartedAt).toLocaleString('vi-VN') }
        ]}
        rows={filteredRecent}
        emptyMessage="Không có lượt chạy nào khớp tìm kiếm."
      />
    </div>
  );
}
