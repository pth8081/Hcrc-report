// pages/StatsPage.jsx — "Top truy vấn": tổng hợp theo endpoint và theo đối
// tác, trong khoảng thời gian chọn được.
import { useEffect, useState } from 'react';
import { api } from '../lib/api';
import DataTable from '../components/DataTable';

const WINDOWS = [
  { value: '1h', label: '1 giờ qua' },
  { value: '24h', label: '24 giờ qua' },
  { value: '7d', label: '7 ngày qua' }
];

export default function StatsPage() {
  const [since, setSince] = useState('24h');
  const [data, setData] = useState({ byEndpoint: [], byConsumer: [] });
  const [error, setError] = useState('');

  useEffect(() => {
    api.get(`/stats/top?since=${since}`).then(setData).catch(err => setError(err.message));
  }, [since]);

  return (
    <div className="page">
      <h1>Top truy vấn</h1>
      {error && <p className="form-error">{error}</p>}

      <div className="tabs">
        {WINDOWS.map(w => (
          <button key={w.value} type="button" className={since === w.value ? 'active' : ''} onClick={() => setSince(w.value)}>{w.label}</button>
        ))}
      </div>

      <h3>Theo endpoint</h3>
      <DataTable
        columns={[
          { key: 'Endpoint', label: 'Endpoint' },
          { key: 'CallCount', label: 'Số lượt gọi' },
          { key: 'AvgDurationMs', label: 'Thời gian TB', render: (r) => `${Math.round(r.AvgDurationMs)} ms` }
        ]}
        rows={data.byEndpoint}
      />

      <h3>Theo đối tác</h3>
      <DataTable
        columns={[
          { key: 'ConsumerName', label: 'Đối tác' },
          { key: 'CallCount', label: 'Số lượt gọi' }
        ]}
        rows={data.byConsumer}
      />
    </div>
  );
}
