// modules/dashboard/DashboardPage.jsx — Dashboard nhiều ô + lọc chéo (Giai
// đoạn C, hướng Power BI — xem VERSION.md). Route/mục menu 'dashboard' đã có
// sẵn từ trước (xem App.jsx/Layout.jsx/schema.sql) — trang này chỉ thay nội
// dung khung trống trước đây.
//
// Các khối TUỲ CHỌN thêm ở bản 8.20-8.22 (Dashboard "Top 5 chi nhánh" — xem
// scripts/seedTop5ChiNhanhReports.js) — mỗi khối chỉ BẬT khi dashboard đang
// chọn CÓ tile khai đúng field tương ứng, dashboard khác (không khai gì)
// chạy ĐÚNG như trước, không đổi hành vi cũ:
//   - Bộ lọc "Từ ngày — đến ngày" (bản 8.22, thay cho "Ngày báo cáo" 1 ngày
//     trước đó) — hiện khi có ÍT NHẤT 1 tile khai `dateMode` ('day'/'month',
//     xem DashboardTile.jsx), mặc định CẢ HAI = hôm nay.
//   - Tab theo `metricTab` (vd 'revenue'/'transactions') x chế độ xem
//     (bảng/biểu đồ) — hiện khi dashboard có TỪ 2 giá trị metricTab khác
//     nhau trở lên.
//   - Nhóm tile theo `chain` (vd 'mart'/'minimart') — hiện tiêu đề nhóm +
//     tách lưới riêng từng nhóm khi CÓ tile khai field này.
//   - Nút "Xuất Excel"/"Xuất PDF" (bản 8.21) — LUÔN hiện khi dashboard có ít
//     nhất 1 tile (không phụ thuộc dateMode/metricTab/chain) — xuất ĐÚNG các
//     Ô đang hiện trên bảng (viewMode='table'; ở chế độ biểu đồ vẫn xuất
//     bảng số liệu, KHÔNG xuất hình biểu đồ — xem routes/dashboards.js).
//
// Tự động làm mới mỗi 30 GIÂY (bản 8.24) — `refreshTick` tăng dần theo
// setInterval, truyền xuống DashboardTile/Top5ChartTile qua dependency của
// useEffect gọi `/run` — KHÔNG xoá `result` trước khi gọi lại (xem các
// component đó) nên bảng/biểu đồ CŨ vẫn hiện nguyên trong lúc chờ số MỚI,
// không nhấp nháy "Đang tải..." mỗi 30s. Dashboard khác không có tile nào
// cũng tự refresh — vô hại (chỉ gọi lại đúng API đã có sẵn), nhưng chỉ THẬT
// SỰ cần thiết cho dashboard có dữ liệu "Realtime"/hay đổi trong ngày.
import { lazy, Suspense, useEffect, useState } from 'react';
import { api, downloadFile } from '../../lib/api';
import DashboardTile from './DashboardTile';
import { periodLabelFor } from '../../lib/dateRange';

// lazy() — Top5ChartTile.jsx import tĩnh recharts (BarChart/Cell/...), y hệt
// lib do components/ReportChart.jsx dùng — KHÔNG lazy ở đây thì recharts bị
// gộp thẳng vào chunk chính (đã thấy qua `npm run build`: chunk chính phình
// từ ~280KB lên ~656KB, chunk ReportChart lẽ ra tách riêng rớt xuống còn
// ~50KB) — mọi dashboard, kể cả dashboard KHÔNG dùng biểu đồ, đều phải tải
// recharts ngay từ đầu. Lazy giữ đúng tinh thần code-splitting đã có sẵn
// (xem chú thích "recharts tách chunk riêng" ở ReportChart.jsx).
const Top5ChartTile = lazy(() => import('./Top5ChartTile'));

function todayStr() {
  return new Date().toISOString().slice(0, 10);
}

// 4 tab = 2 chỉ tiêu (Doanh thu/Giao dịch) x 2 cách xem (Bảng xếp hạng/Biểu
// đồ). "Biểu đồ..." gộp Top 5 MART + MINIMART của cùng giai đoạn vào 1 biểu
// đồ cột ngang, tô màu theo chuỗi — xem Top5ChartTile.jsx. Dashboard khác
// (không có tile.metricTab) không hiện nhóm tab này (xem metricTabs.length
// bên dưới), KHÔNG ảnh hưởng gì.
const VIEW_TABS = [
  { metricTab: 'revenue', mode: 'table', label: 'Xếp theo Doanh thu' },
  { metricTab: 'transactions', mode: 'table', label: 'Xếp theo Giao dịch' },
  { metricTab: 'revenue', mode: 'chart', label: 'Biểu đồ doanh thu' },
  { metricTab: 'transactions', mode: 'chart', label: 'Biểu đồ giao dịch' }
];
const DIRECTION_LABEL = { cao: 'Cao nhất', thap: 'Thấp nhất' };

// reportId chứa "-cao"/"-thap" (quy ước đặt tên của
// scripts/seedTop5ChiNhanhReports.js) — suy ra hướng xếp hạng để tô viền
// xanh/cam (xem renderTiles() -> tile.tone) và gộp biểu đồ (buildChartGroups).
function deriveDirection(reportId) {
  if (reportId.includes('-cao')) return 'cao';
  if (reportId.includes('-thap')) return 'thap';
  return null;
}

function buildChartGroups(tiles, fromDate, toDate) {
  const groups = [];
  for (const direction of ['cao', 'thap']) {
    for (const dateMode of ['day', 'month']) {
      const martTile = tiles.find(t => t.chain === 'mart' && t.dateMode === dateMode && deriveDirection(t.reportId) === direction);
      const minimartTile = tiles.find(t => t.chain === 'minimart' && t.dateMode === dateMode && deriveDirection(t.reportId) === direction);
      if (martTile && minimartTile) {
        const periodLabel = periodLabelFor(dateMode, fromDate, toDate);
        groups.push({ key: `${direction}-${dateMode}`, title: `${DIRECTION_LABEL[direction]} (${periodLabel})`, martTile, minimartTile });
      }
    }
  }
  return groups;
}

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
  const [fromDate, setFromDate] = useState(todayStr());
  const [toDate, setToDate] = useState(todayStr());
  const [metricTab, setMetricTab] = useState('');
  const [viewMode, setViewMode] = useState('table');
  const [exporting, setExporting] = useState(false);
  // refreshTick — tăng dần mỗi 30s, CHỈ dùng làm dependency ép các tile gọi
  // lại /run (không tự mang dữ liệu gì) — xem chú thích đầu file.
  const [refreshTick, setRefreshTick] = useState(0);
  const [lastRefreshedAt, setLastRefreshedAt] = useState(null);

  useEffect(() => {
    api.get('/dashboards').then(list => {
      setDashboards(list);
      if (list.length) setSelectedId(list[0].DashboardId);
    }).catch(err => setError(err.message));
  }, []);

  useEffect(() => {
    setLastRefreshedAt(new Date());
    const id = setInterval(() => {
      setRefreshTick(t => t + 1);
      setLastRefreshedAt(new Date());
    }, 30000);
    return () => clearInterval(id);
  }, [selectedId]);

  useEffect(() => {
    if (!selectedId) return;
    setCrossFilters({});
    setFromDate(todayStr());
    setToDate(todayStr());
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

  function resetToToday() {
    setFromDate(todayStr());
    setToDate(todayStr());
  }

  // "Đến ngày" không được sớm hơn "Từ ngày" — đổi "Từ ngày" vượt qua "Đến
  // ngày" thì đẩy luôn "Đến ngày" theo, tránh khoảng ngược (from > to) âm
  // thầm gây lệch dữ liệu (xem compositeReportRunner.js:resolveRequestedRange
  // — nó tự hoán đổi lại nếu lỡ lọt qua, nhưng tốt hơn chặn ngay ở UI).
  function handleFromDateChange(value) {
    setFromDate(value);
    if (value > toDate) setToDate(value);
  }
  function handleToDateChange(value) {
    setToDate(value);
    if (value < fromDate) setFromDate(value);
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
  const chartGroups = viewMode === 'chart' ? buildChartGroups(visibleTiles, fromDate, toDate) : [];
  const chartValueField = metricTab === 'transactions' ? 'soGiaoDich' : 'doanhThu';

  function renderTiles(tiles) {
    return (
      <div className="dashboard-grid">
        {tiles.map(tile => {
          const direction = deriveDirection(tile.reportId);
          const tone = direction === 'cao' ? 'high' : direction === 'thap' ? 'low' : undefined;
          return (
            <DashboardTile key={tile.key} tile={{ ...tile, tone }} crossFilters={crossFilters} fromDate={fromDate} toDate={toDate} refreshTick={refreshTick} onPointClick={handlePointClick} />
          );
        })}
      </div>
    );
  }

  async function exportAs(format) {
    setExporting(true);
    setError('');
    try {
      await downloadFile(
        `/dashboards/${selectedId}/export`,
        { tileKeys: visibleTiles.map(t => t.key), fromDate, toDate, format },
        `${dashboard?.title || 'dashboard'}.${format === 'excel' ? 'xlsx' : 'pdf'}`
      );
    } catch (err) {
      setError(err.message);
    } finally {
      setExporting(false);
    }
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
          <span>Từ ngày</span>
          <input type="date" value={fromDate} max={todayStr()} onChange={(e) => handleFromDateChange(e.target.value)} />
          <span>đến ngày</span>
          <input type="date" value={toDate} max={todayStr()} onChange={(e) => handleToDateChange(e.target.value)} />
          <button type="button" onClick={resetToToday}>Hôm nay</button>
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
          <div className="dashboard-title-bar">
            <h2 className="dashboard-title">{dashboard.title}</h2>
            <div className="dashboard-refresh-indicator">
              <span>Tự động làm mới mỗi 30 giây{lastRefreshedAt ? ` — cập nhật lúc ${lastRefreshedAt.toLocaleTimeString('vi-VN')}` : ''}</span>
              <button type="button" onClick={() => { setRefreshTick(t => t + 1); setLastRefreshedAt(new Date()); }}>🔄 Làm mới ngay</button>
            </div>
            {visibleTiles.length > 0 && (
              <div className="export-actions">
                <button type="button" disabled={exporting} onClick={() => exportAs('excel')}>Xuất Excel</button>
                <button type="button" disabled={exporting} onClick={() => exportAs('pdf')}>Xuất PDF</button>
              </div>
            )}
          </div>

          {metricTabs.length > 1 && (
            <div className="dashboard-metric-tabs">
              {VIEW_TABS.filter(t => metricTabs.includes(t.metricTab)).map(t => (
                <button
                  key={`${t.metricTab}-${t.mode}`}
                  type="button"
                  className={t.metricTab === metricTab && t.mode === viewMode ? 'active' : ''}
                  onClick={() => { setMetricTab(t.metricTab); setViewMode(t.mode); }}
                >
                  {t.label}
                </button>
              ))}
            </div>
          )}

          {viewMode === 'chart' ? (
            <Suspense fallback={<p>Đang tải biểu đồ...</p>}>
              <div className="dashboard-grid">
                {chartGroups.map(g => (
                  <Top5ChartTile key={g.key} title={g.title} martTile={g.martTile} minimartTile={g.minimartTile} valueField={chartValueField} fromDate={fromDate} toDate={toDate} refreshTick={refreshTick} />
                ))}
              </div>
            </Suspense>
          ) : chainGroups.length > 0 ? (
            chainGroups.map(chain => (
              <div key={chain} className="dashboard-group">
                <h3 className="dashboard-group-title">{chain.toUpperCase()}</h3>
                {renderTiles(visibleTiles.filter(t => t.chain === chain))}
              </div>
            ))
          ) : renderTiles(visibleTiles)}
        </>
      )}
    </div>
  );
}
