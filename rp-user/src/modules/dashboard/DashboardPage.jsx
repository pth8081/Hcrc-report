// modules/dashboard/DashboardPage.jsx — Dashboard nhiều ô + lọc chéo (Giai
// đoạn C, hướng Power BI — xem VERSION.md). Route/mục menu 'dashboard' đã có
// sẵn từ trước (xem App.jsx/Layout.jsx/schema.sql) — trang này chỉ thay nội
// dung khung trống trước đây.
import { useEffect, useState } from 'react';
import { api } from '../../lib/api';
import DashboardTile from './DashboardTile';

export default function DashboardPage() {
  const [dashboards, setDashboards] = useState([]);
  const [selectedId, setSelectedId] = useState('');
  const [dashboard, setDashboard] = useState(null);
  const [error, setError] = useState('');
  // Bấm vào 1 điểm/cột/lát ở BẤT KỲ ô nào (xem DashboardTile -> ReportBody ->
  // ReportChart onPointClick) -> gộp vào đây theo tên field THÔ (đúng "key"
  // trong definition.columns của báo cáo nguồn) -> MỌI ô khác tự chạy lại
  // với bộ lọc này (ô nào không khai field đó thì rp-server tự bỏ qua).
  const [crossFilters, setCrossFilters] = useState({});

  useEffect(() => {
    api.get('/dashboards').then(list => {
      setDashboards(list);
      if (list.length) setSelectedId(list[0].DashboardId);
    }).catch(err => setError(err.message));
  }, []);

  useEffect(() => {
    if (!selectedId) return;
    setCrossFilters({});
    api.get(`/dashboards/${selectedId}`).then(setDashboard).catch(err => setError(err.message));
  }, [selectedId]);

  function handlePointClick(field, value) {
    setCrossFilters(prev => ({ ...prev, [field]: value }));
  }

  function clearFilter(field) {
    setCrossFilters(prev => {
      const next = { ...prev };
      delete next[field];
      return next;
    });
  }

  if (!dashboards.length && !error) {
    return (
      <div className="page">
        <h1>Dashboard</h1>
        <p className="empty-message">Chưa có dashboard nào được cấu hình.</p>
      </div>
    );
  }

  const filterEntries = Object.entries(crossFilters);

  return (
    <div className="page">
      <h1>Dashboard</h1>
      {error && <p className="form-error">{error}</p>}

      {dashboards.length > 1 && (
        <label className="report-picker">
          <span>Chọn dashboard</span>
          <select value={selectedId} onChange={(e) => setSelectedId(e.target.value)}>
            {dashboards.map(d => <option key={d.DashboardId} value={d.DashboardId}>{d.Title}</option>)}
          </select>
        </label>
      )}

      {filterEntries.length > 0 && (
        <div className="dashboard-crossfilter-bar">
          <span>Đang lọc chéo:</span>
          {filterEntries.map(([field, value]) => (
            <span key={field} className="dashboard-crossfilter-chip">
              {field} = {String(value)}
              <button type="button" onClick={() => clearFilter(field)}>✕</button>
            </span>
          ))}
          <button type="button" onClick={() => setCrossFilters({})}>Xoá hết lọc</button>
        </div>
      )}

      {dashboard && (
        <>
          <h2 className="dashboard-title">{dashboard.title}</h2>
          <div className="dashboard-grid">
            {dashboard.tiles.map(tile => (
              <DashboardTile key={tile.key} tile={tile} crossFilters={crossFilters} onPointClick={handlePointClick} />
            ))}
          </div>
        </>
      )}
    </div>
  );
}
