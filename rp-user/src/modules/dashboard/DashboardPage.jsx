// modules/dashboard/DashboardPage.jsx — Dashboard nhiều ô + lọc chéo (Giai
// đoạn C, hướng Power BI — xem VERSION.md). Route/mục menu 'dashboard' đã có
// sẵn từ trước (xem App.jsx/Layout.jsx/schema.sql) — trang này chỉ thay nội
// dung khung trống trước đây.
//
// Các khối TUỲ CHỌN thêm ở bản 8.20/8.21 (Dashboard "Top 5 chi nhánh" — xem
// scripts/seedTop5ChiNhanhReports.js) — mỗi khối chỉ BẬT khi dashboard đang
// chọn CÓ tile khai đúng field tương ứng, dashboard khác (không khai gì)
// chạy ĐÚNG như trước, không đổi hành vi cũ:
//   - Bộ lọc "Ngày báo cáo" (1 ngày, không phải khoảng) — hiện khi có ÍT
//     NHẤT 1 tile khai `dateMode` ('day'/'month', xem DashboardTile.jsx).
//   - Tab theo `metricTab` (vd 'revenue'/'transactions') x chế độ xem
//     (bảng/biểu đồ) — hiện khi dashboard có TỪ 2 giá trị metricTab khác
//     nhau trở lên.
//   - Nhóm tile theo `chain` (vd 'mart'/'minimart') — hiện tiêu đề nhóm +
//     tách lưới riêng từng nhóm khi CÓ tile khai field này.
//   - Nút "Xuất Excel"/"Xuất PDF" (bản 8.21) — LUÔN hiện khi dashboard có ít
//     nhất 1 tile (không phụ thuộc dateMode/metricTab/chain) — xuất ĐÚNG các
//     Ô đang hiện trên bảng (viewMode='table'; ở chế độ biểu đồ vẫn xuất
//     bảng số liệu, KHÔNG xuất hình biểu đồ — xem routes/dashboards.js).
import { lazy, Suspense, useEffect, useState } from 'react';
import { api, downloadFile } from '../../lib/api';
import DashboardTile from './DashboardTile';

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
const PERIOD_LABEL = { day: 'Trong ngày', month: 'Trong tháng' };

// reportId chứa "-cao"/"-thap" (quy ước đặt tên của
// scripts/seedTop5ChiNhanhReports.js) — suy ra hướng xếp hạng để tô viền
// xanh/cam (xem renderTiles() -> tile.tone) và gộp biểu đồ (buildChartGroups).
function deriveDirection(reportId) {
  if (reportId.includes('-cao')) return 'cao';
  if (reportId.includes('-thap')) return 'thap';
  return null;
}

function buildChartGroups(tiles) {
  const groups = [];
  for (const direction of ['cao', 'thap']) {
    for (const dateMode of ['day', 'month']) {
      const martTile = tiles.find(t => t.chain === 'mart' && t.dateMode === dateMode && deriveDirection(t.reportId) === direction);
      const minimartTile = tiles.find(t => t.chain === 'minimart' && t.dateMode === dateMode && deriveDirection(t.reportId) === direction);
      if (martTile && minimartTile) {
        groups.push({ key: `${direction}-${dateMode}`, title: `${DIRECTION_LABEL[direction]} (${PERIOD_LABEL[dateMode]})`, martTile, minimartTile });
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
  const [reportDate, setReportDate] = useState(todayStr());
  const [metricTab, setMetricTab] = useState('');
  const [viewMode, setViewMode] = useState('table');
  const [exporting, setExporting] = useState(false);

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
  const chartGroups = viewMode === 'chart' ? buildChartGroups(visibleTiles) : [];
  const chartValueField = metricTab === 'transactions' ? 'soGiaoDich' : 'doanhThu';

  function renderTiles(tiles) {
    return (
      <div className="dashboard-grid">
        {tiles.map(tile => {
          const direction = deriveDirection(tile.reportId);
          const tone = direction === 'cao' ? 'high' : direction === 'thap' ? 'low' : undefined;
          return (
            <DashboardTile key={tile.key} tile={{ ...tile, tone }} crossFilters={crossFilters} reportDate={reportDate} onPointClick={handlePointClick} />
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
        { tileKeys: visibleTiles.map(t => t.key), reportDate, format },
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
          <div className="dashboard-title-bar">
            <h2 className="dashboard-title">{dashboard.title}</h2>
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
                  <Top5ChartTile key={g.key} title={g.title} martTile={g.martTile} minimartTile={g.minimartTile} valueField={chartValueField} reportDate={reportDate} />
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
