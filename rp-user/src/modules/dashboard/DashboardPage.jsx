// modules/dashboard/DashboardPage.jsx — Dashboard nhiều ô + lọc chéo (Giai
// đoạn C, hướng Power BI — xem VERSION.md). Route/mục menu 'dashboard' đã có
// sẵn từ trước (xem App.jsx/Layout.jsx/schema.sql) — trang này chỉ thay nội
// dung khung trống trước đây.
//
// 3 khối TUỲ CHỌN thêm ở bản 8.20 (Dashboard "Top 5 chi nhánh" — xem
// scripts/seedTop5ChiNhanhReports.js) — mỗi khối chỉ BẬT khi dashboard đang
// chọn CÓ tile khai đúng field tương ứng, dashboard khác (không khai gì)
// chạy ĐÚNG như trước, không đổi hành vi cũ:
//   - Bộ lọc "Ngày báo cáo" (1 ngày, không phải khoảng) — hiện khi có ÍT
//     NHẤT 1 tile khai `dateMode` ('day'/'month', xem DashboardTile.jsx).
//   - Tab theo `metricTab` (vd 'revenue'/'transactions') — hiện khi dashboard
//     có TỪ 2 giá trị metricTab khác nhau trở lên, lọc bớt tile không khớp
//     tab đang chọn.
//   - Nhóm tile theo `chain` (vd 'mart'/'minimart') — hiện tiêu đề nhóm +
//     tách lưới riêng từng nhóm khi CÓ tile khai field này.
import { useEffect, useState } from 'react';
import { api } from '../../lib/api';
import DashboardTile from './DashboardTile';

function todayStr() {
  return new Date().toISOString().slice(0, 10);
}

const METRIC_TAB_LABELS = { revenue: 'Xếp theo Doanh thu', transactions: 'Xếp theo Giao dịch' };

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
  const [reportDate, setReportDate] = useState(todayStr());
  const [metricTab, setMetricTab] = useState('');

  useEffect(() => {
    api.get('/dashboards').then(list => {
      setDashboards(list);
      if (list.length) setSelectedId(list[0].DashboardId);
    }).catch(err => setError(err.message));
  }, []);

  useEffect(() => {
    if (!selectedId) return;
    setCrossFilters({});
    setReportDate(todayStr());
    api.get(`/dashboards/${selectedId}`).then(d => {
      setDashboard(d);
      const tabs = [...new Set((d.tiles || []).map(t => t.metricTab).filter(Boolean))];
      setMetricTab(tabs[0] || '');
    }).catch(err => setError(err.message));
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
  const allTiles = dashboard?.tiles || [];
  const needsDatePicker = allTiles.some(t => t.dateMode);
  const metricTabs = [...new Set(allTiles.map(t => t.metricTab).filter(Boolean))];
  const visibleTiles = metricTabs.length > 1 ? allTiles.filter(t => !t.metricTab || t.metricTab === metricTab) : allTiles;
  const chainGroups = [...new Set(visibleTiles.map(t => t.chain).filter(Boolean))];

  function renderTiles(tiles) {
    return (
      <div className="dashboard-grid">
        {tiles.map(tile => (
          <DashboardTile key={tile.key} tile={tile} crossFilters={crossFilters} reportDate={reportDate} onPointClick={handlePointClick} />
        ))}
      </div>
    );
  }

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

      {needsDatePicker && (
        <div className="dashboard-daterange-bar">
          <span>Ngày báo cáo</span>
          <input type="date" value={reportDate} max={todayStr()} onChange={(e) => setReportDate(e.target.value)} />
          <button type="button" onClick={() => setReportDate(todayStr())}>Hôm nay</button>
        </div>
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

          {metricTabs.length > 1 && (
            <div className="dashboard-metric-tabs">
              {metricTabs.map(m => (
                <button key={m} type="button" className={m === metricTab ? 'active' : ''} onClick={() => setMetricTab(m)}>
                  {METRIC_TAB_LABELS[m] || m}
                </button>
              ))}
            </div>
          )}

          {chainGroups.length > 0
            ? chainGroups.map(chain => (
              <div key={chain} className="dashboard-group">
                <h3 className="dashboard-group-title">{chain.toUpperCase()}</h3>
                {renderTiles(visibleTiles.filter(t => t.chain === chain))}
              </div>
            ))
            : renderTiles(visibleTiles)}
        </>
      )}
    </div>
  );
}
