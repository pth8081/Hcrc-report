import { useEffect, useState } from 'react';
import { api } from '../lib/api';
import DataTable from '../components/DataTable';

export default function DashboardPage() {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    api.get('/dashboard').then(setData).catch(err => setError(err.message));
  }, []);

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

      {data.failingLast24h.length > 0 && (
        <>
          <h3>Job lỗi trong 24h qua</h3>
          <DataTable
            columns={[
              { key: 'Name', label: 'Job' },
              { key: 'ErrorMessage', label: 'Lỗi' },
              { key: 'StartedAt', label: 'Lúc', render: (r) => new Date(r.StartedAt).toLocaleString('vi-VN') }
            ]}
            rows={data.failingLast24h}
          />
        </>
      )}

      <h3>Từng job</h3>
      <DataTable
        columns={[
          { key: 'Name', label: 'Tên' },
          { key: 'Type', label: 'Loại' },
          { key: 'CronExpression', label: 'Lịch chạy' },
          { key: 'IsActive', label: 'Trạng thái', render: (r) => (r.IsActive ? 'Bật' : 'Tắt') },
          { key: 'LastSyncedAt', label: 'Đồng bộ gần nhất', render: (r) => (r.LastSyncedAt ? new Date(r.LastSyncedAt).toLocaleString('vi-VN') : 'Chưa chạy lần nào') }
        ]}
        rows={data.jobs}
      />

      <h3>20 lượt chạy gần nhất</h3>
      <DataTable
        columns={[
          { key: 'JobName', label: 'Job' },
          { key: 'Status', label: 'Trạng thái' },
          { key: 'RowCount', label: 'Số dòng' },
          { key: 'StartedAt', label: 'Bắt đầu', render: (r) => new Date(r.StartedAt).toLocaleString('vi-VN') }
        ]}
        rows={data.recentRuns}
      />
    </div>
  );
}
