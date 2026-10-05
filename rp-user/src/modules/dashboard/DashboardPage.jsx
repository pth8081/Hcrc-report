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
//   - Nút "Xuất Excel"/"Xuất PDF" (bản 8.21, mở rộng sang tab Realtime bản
//     8.29) — LUÔN hiện khi dashboard có ít nhất 1 tile/1 tab Realtime
//     (không phụ thuộc dateMode/metricTab/chain/kind) — xuất ĐÚNG bảng số
//     liệu đang xem (ở chế độ biểu đồ/tab Realtime-biểu đồ vẫn xuất BẢNG,
//     KHÔNG xuất hình biểu đồ — xem routes/dashboards.js). QUY ƯỚC CHUNG từ
//     bản 8.29 (người dùng yêu cầu): MỌI loại Ô/tab dashboard thêm SAU NÀY
//     mặc định PHẢI xuất được Excel/PDF — khi thêm `tile.kind` mới, nhớ mở
//     rộng cả điều kiện hiện nút này lẫn vòng lặp xử lý tile ở
//     routes/dashboards.js, đừng để tab mới âm thầm thiếu nút Xuất.
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
import RealtimeReportTile from './RealtimeReportTile';
import { addDaysISO, periodLabelFor, todayISO } from '../../lib/dateRange';

// lazy() — Top5ChartTile.jsx import tĩnh recharts (BarChart/Cell/...), y hệt
// lib do components/ReportChart.jsx dùng — KHÔNG lazy ở đây thì recharts bị
// gộp thẳng vào chunk chính (đã thấy qua `npm run build`: chunk chính phình
// từ ~280KB lên ~656KB, chunk ReportChart lẽ ra tách riêng rớt xuống còn
// ~50KB) — mọi dashboard, kể cả dashboard KHÔNG dùng biểu đồ, đều phải tải
// recharts ngay từ đầu. Lazy giữ đúng tinh thần code-splitting đã có sẵn
// (xem chú thích "recharts tách chunk riêng" ở ReportChart.jsx).
const Top5ChartTile = lazy(() => import('./Top5ChartTile'));

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

// Tile "Realtime" (bản 8.24 — xem RealtimeReportTile.jsx) — tile.kind
// === 'realtime' hiện NGUYÊN 1 báo cáo đã có sẵn (vd "bc-doanh-thu-hcrc")
// toàn trang, KHÔNG theo khuôn lưới 8 ô nhỏ của Top 5 — 4 tab = 2 cách xem
// (Bảng/Biểu đồ) x 2 giai đoạn (Ngày/Tháng cộng dồn), mỗi tab chọn ĐÚNG 1
// trong các tile.kind==='realtime' đã khai theo tile.dateMode/tile.realtimeMode.
const REALTIME_PERIOD_LABEL = { day: 'Theo ngày', month: 'Theo tháng (cộng dồn)' };
function buildRealtimeTabs(tiles) {
  return tiles
    .filter(t => t.kind === 'realtime')
    .map(t => ({
      key: t.key,
      label: `${t.realtimeMode === 'chart' ? 'Biểu đồ Realtime' : 'Realtime'} ${REALTIME_PERIOD_LABEL[t.dateMode] || ''}`.trim(),
      tile: t
    }));
}

// reportId chứa "-cao"/"-thap" (quy ước đặt tên của
// scripts/seedTop5ChiNhanhReports.js) — suy ra hướng xếp hạng để tô viền
// xanh/cam (xem renderTiles() -> tile.tone) và gộp biểu đồ (buildChartGroups).
// applyTileOrder/PREFERENCES (bản 8.45, theo yêu cầu người dùng) — cá nhân
// hoá Dashboard, lưu trên server theo UserId (xem app.UserDashboardPreferences
// + routes/dashboards.js:/:dashboardId/preferences), KHÔNG lưu localStorage
// (để dùng được trên nhiều máy/điện thoại cùng tài khoản). Không ảnh hưởng
// người khác, không liên quan app.RoleDashboardGroupAccess (quyền XEM, áp
// dụng chung cho cả vai trò) — đây chỉ là tuỳ chọn HIỂN THỊ riêng của từng
// người trên các Ô mình ĐÃ có quyền xem.
function applyTileOrder(tiles, order) {
  if (!order || !order.length) return tiles;
  const byKey = new Map(tiles.map(t => [t.key, t]));
  const ordered = order.map(k => byKey.get(k)).filter(Boolean);
  const remaining = tiles.filter(t => !order.includes(t.key));
  return [...ordered, ...remaining];
}

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
  const [fromDate, setFromDate] = useState(todayISO());
  const [toDate, setToDate] = useState(todayISO());
  const [metricTab, setMetricTab] = useState('');
  const [viewMode, setViewMode] = useState('table');
  // activeGroup (bản 8.42, theo yêu cầu người dùng) — Ô có khai tile.group
  // được gộp theo nhóm, chọn 1 nhóm ở đầu trang mới hiện Ô bên dưới (xem
  // groups/groupFilteredTiles bên dưới). Dashboard không khai tile.group
  // nào (groups rỗng) chạy y hệt trước — không có gì để chọn.
  const [activeGroup, setActiveGroup] = useState('');
  const [exporting, setExporting] = useState(false);
  // activeRealtimeKey — key của tile.kind==='realtime' đang chọn (xem
  // buildRealtimeTabs() ở trên); null = đang xem Top 5 (bảng/biểu đồ) như
  // trước, khác hẳn khối viewMode/metricTab (Top 5) để không trộn lẫn logic.
  const [activeRealtimeKey, setActiveRealtimeKey] = useState(null);
  // refreshTick — tăng dần mỗi 30s, CHỈ dùng làm dependency ép các tile gọi
  // lại /run (không tự mang dữ liệu gì) — xem chú thích đầu file.
  const [refreshTick, setRefreshTick] = useState(0);
  const [lastRefreshedAt, setLastRefreshedAt] = useState(null);
  // preferences (bản 8.45) — tuỳ chỉnh cá nhân đã lưu CỦA DASHBOARD ĐANG XEM
  // (nạp lại mỗi khi đổi selectedId, xem effect dưới); customizing — đóng/mở
  // khung "Tuỳ chỉnh Dashboard".
  const [preferences, setPreferences] = useState({});
  const [customizing, setCustomizing] = useState(false);

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
    setActiveRealtimeKey(null);
    setCustomizing(false);
    Promise.all([
      api.get(`/dashboards/${selectedId}`),
      api.get(`/dashboards/${selectedId}/preferences`).catch(() => ({}))
    ]).then(([d, prefs]) => {
      setDashboard(d);
      setPreferences(prefs || {});

      const to = todayISO();
      const rangeDays = prefs?.defaultRangeDays || 0;
      setFromDate(rangeDays > 0 ? addDaysISO(to, -rangeDays) : to);
      setToDate(to);

      // Ô đã ẩn/đổi thứ tự theo tuỳ chỉnh cá nhân (xem applyTileOrder() ở
      // trên) — tính TRƯỚC khi suy ra nhóm/tab mặc định để nhóm/tab khôi
      // phục lại đúng những gì người này còn thấy (vd ẩn hết Ô của 1 nhóm
      // thì không khôi phục lại đúng nhóm đó).
      const tiles = applyTileOrder(d.tiles || [], prefs?.tileOrder).filter(t => !(prefs?.hiddenTileKeys || []).includes(t.key));
      const groupsPresent = [...new Set(tiles.map(t => t.group).filter(Boolean))];
      const firstGroup = tiles.find(t => t.group)?.group || '';
      const initialGroup = prefs?.lastGroup && groupsPresent.includes(prefs.lastGroup) ? prefs.lastGroup : firstGroup;
      setActiveGroup(initialGroup);

      const groupTiles = initialGroup ? tiles.filter(t => t.group === initialGroup) : tiles;
      const tabs = [...new Set(groupTiles.map(t => t.metricTab).filter(Boolean))];
      setMetricTab(prefs?.lastMetricTab && tabs.includes(prefs.lastMetricTab) ? prefs.lastMetricTab : (tabs[0] || ''));
      if (prefs?.lastViewMode === 'chart' || prefs?.lastViewMode === 'table') setViewMode(prefs.lastViewMode);

      const realtimeKeysPresent = groupTiles.filter(t => t.kind === 'realtime').map(t => t.key);
      if (prefs?.lastRealtimeKey && realtimeKeysPresent.includes(prefs.lastRealtimeKey)) setActiveRealtimeKey(prefs.lastRealtimeKey);
    }).catch(err => setError(err.message));
  }, [selectedId]);

  // Lưu 1 phần tuỳ chỉnh lên server — GỘP với preferences hiện có (không gửi
  // nguyên state cũ của người khác, vì route PUT luôn ghi đè nguyên object
  // theo UserId+DashboardId của CHÍNH người gọi, xem routes/dashboards.js).
  // Không chờ kết quả (không ai cần biết đã lưu xong hay chưa, lỗi mạng ở
  // đây tối đa là lần sau mở lại không khôi phục đúng, không mất dữ liệu
  // nghiệp vụ gì) — lỗi âm thầm bỏ qua, không làm phiền người dùng.
  function savePreferences(patch) {
    const next = { ...preferences, ...patch };
    setPreferences(next);
    api.put(`/dashboards/${selectedId}/preferences`, next).catch(() => {});
  }

  // Đổi nhóm (bấm thẻ nhóm khác) — reset sub-tab giống lúc đổi dashboard ở
  // trên, tránh giữ lại metricTab/activeRealtimeKey của nhóm CŨ (vd đang ở
  // tab "Realtime" của nhóm A, chọn sang nhóm B không có tile Realtime nào
  // sẽ hiện trống trơn nếu không reset).
  function selectGroup(groupKey) {
    setActiveGroup(groupKey);
    setActiveRealtimeKey(null);
    // Tính lại ĐÚNG như allTiles ở dưới (đã bỏ Ô ẩn) — không lấy thẳng
    // dashboard.tiles, tránh gợi ý sai tab cho 1 Ô người dùng đã tự ẩn.
    const tiles = applyTileOrder(dashboard?.tiles || [], preferences.tileOrder).filter(t => !(preferences.hiddenTileKeys || []).includes(t.key));
    const groupTiles = tiles.filter(t => t.group === groupKey);
    const tabs = [...new Set(groupTiles.map(t => t.metricTab).filter(Boolean))];
    const nextTab = tabs[0] || '';
    setMetricTab(nextTab);
    savePreferences({ lastGroup: groupKey, lastMetricTab: nextTab, lastRealtimeKey: null });
  }

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
    setFromDate(todayISO());
    setToDate(todayISO());
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

  // Khung "Tuỳ chỉnh Dashboard" (bản 8.45) — 3 thao tác, lưu NGAY mỗi lần
  // bấm (không có nút "Lưu" riêng, giống cách bật/tắt khác trong hệ thống —
  // vd toggleActive ở trang Sync Jobs): ẩn/hiện 1 Ô, đổi vị trí 1 Ô (lên/
  // xuống trong CHÍNH danh sách đầy đủ, không phải danh sách đã lọc theo
  // nhóm/tab đang xem, để thứ tự nhất quán ở mọi nhóm/tab), đổi số ngày mặc
  // định khi mở lại Dashboard.
  function toggleHiddenTile(key) {
    const hidden = preferences.hiddenTileKeys || [];
    savePreferences({ hiddenTileKeys: hidden.includes(key) ? hidden.filter(k => k !== key) : [...hidden, key] });
  }

  function moveTile(key, direction) {
    const order = rawTiles.map(t => t.key);
    const index = order.indexOf(key);
    const swapWith = index + direction;
    if (swapWith < 0 || swapWith >= order.length) return;
    [order[index], order[swapWith]] = [order[swapWith], order[index]];
    savePreferences({ tileOrder: order });
  }

  function setDefaultRangeDays(days) {
    savePreferences({ defaultRangeDays: days });
  }

  function resetPersonalization() {
    if (!confirm('Khôi phục Dashboard về mặc định ban đầu (bỏ hết ẩn/hiện, thứ tự, nhóm/tab/số ngày đã nhớ)?')) return;
    savePreferences({ hiddenTileKeys: [], tileOrder: [], lastGroup: undefined, lastMetricTab: undefined, lastViewMode: undefined, lastRealtimeKey: undefined, defaultRangeDays: 0 });
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
  // rawTiles — ĐÚNG thứ tự tuỳ chỉnh, nhưng CHƯA lọc Ô đã ẩn (dùng cho khung
  // "Tuỳ chỉnh Dashboard" — phải thấy cả Ô đang ẩn mới bật lại được); allTiles
  // — bản hiện trên Dashboard (đã bỏ Ô ẩn), mọi tính toán nhóm/tab/lưới dưới
  // đây giữ nguyên như trước bản 8.45, chỉ đổi NGUỒN đầu vào.
  const rawTiles = applyTileOrder(dashboard?.tiles || [], preferences.tileOrder);
  const allTiles = rawTiles.filter(t => !(preferences.hiddenTileKeys || []).includes(t.key));
  // groups (bản 8.42) — chỉ hiện bộ chọn khi CÓ TỪ 2 nhóm trở lên (giống
  // đúng quy ước metricTabs.length > 1 đã có) — dashboard chỉ 1 nhóm hoặc
  // không khai nhóm nào thì groupFilteredTiles = allTiles, chạy y hệt
  // trước khi có tính năng này.
  const groupsMap = new Map();
  for (const t of allTiles) {
    if (t.group && !groupsMap.has(t.group)) {
      groupsMap.set(t.group, { key: t.group, label: t.groupLabel || t.group, icon: t.groupIcon || '', count: 0 });
    }
    if (t.group) groupsMap.get(t.group).count++;
  }
  const groups = [...groupsMap.values()];
  const groupFilteredTiles = groups.length > 1 && activeGroup ? allTiles.filter(t => t.group === activeGroup) : allTiles;
  const needsDatePicker = groupFilteredTiles.some(t => t.dateMode);
  const metricTabs = [...new Set(groupFilteredTiles.map(t => t.metricTab).filter(Boolean))];
  const visibleTiles = metricTabs.length > 1 ? groupFilteredTiles.filter(t => !t.metricTab || t.metricTab === metricTab) : groupFilteredTiles;
  const chainGroups = [...new Set(visibleTiles.map(t => t.chain).filter(Boolean))];
  const chartGroups = viewMode === 'chart' ? buildChartGroups(visibleTiles, fromDate, toDate) : [];
  const chartValueField = metricTab === 'transactions' ? 'soGiaoDich' : 'doanhThu';
  const realtimeTabs = buildRealtimeTabs(groupFilteredTiles);
  const activeRealtimeTab = realtimeTabs.find(t => t.key === activeRealtimeKey);
  // Xuất Excel/PDF ở tab Realtime (bản 8.29) — LUÔN xuất đúng Ô "bảng" (không
  // phải "biểu đồ") của CÙNG giai đoạn (ngày/tháng) đang xem, kể cả khi đang
  // đứng ở tab biểu đồ — xuất file luôn là bảng số đầy đủ (giống hệt báo cáo
  // cuối ngày), không xuất ảnh biểu đồ (đúng quy ước mọi nút "Xuất" khác
  // trong hệ thống — xem routes/dashboards.js/export route).
  const realtimeExportTile = activeRealtimeTab
    ? realtimeTabs.find(t => t.tile.dateMode === activeRealtimeTab.tile.dateMode && t.tile.realtimeMode === 'table')?.tile
    : null;

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
      const tileKeys = realtimeExportTile ? [realtimeExportTile.key] : visibleTiles.map(t => t.key);
      await downloadFile(
        `/dashboards/${selectedId}/export`,
        { tileKeys, fromDate, toDate, format },
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

      {/* Droplist thay thẻ lưới (bản 8.84, theo yêu cầu người dùng — "để sau
          này nhiều nhóm Dashboard sẽ gọn hơn") — cùng mẫu "Chọn dashboard" ở
          trên/"Chọn báo cáo" bên trang Báo cáo (.report-picker), thay vì thẻ
          lưới .dashboard-group-grid cũ (chiếm nhiều chỗ khi có nhiều nhóm). */}
      {groups.length > 1 && (
        <label className="report-picker">
          <span>Chọn nhóm</span>
          <select value={activeGroup} onChange={(e) => selectGroup(e.target.value)}>
            {groups.map(g => (
              <option key={g.key} value={g.key}>{g.icon ? `${g.icon} ` : ''}{g.label} ({g.count} ô)</option>
            ))}
          </select>
        </label>
      )}

      {needsDatePicker && (
        <div className="dashboard-daterange-bar">
          <span>Từ ngày</span>
          <input type="date" value={fromDate} max={todayISO()} onChange={(e) => handleFromDateChange(e.target.value)} />
          <span>đến ngày</span>
          <input type="date" value={toDate} max={todayISO()} onChange={(e) => handleToDateChange(e.target.value)} />
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
            <button type="button" className="dashboard-customize-toggle" onClick={() => setCustomizing(v => !v)}>
              ⚙️ Tuỳ chỉnh
            </button>
            {/* activeRealtimeTab (bản 8.29): routes/dashboards.js/export giờ
                hiểu tile.kind==='realtime' (ép cheDoSoSanh='past' + dùng
                đúng exportTitle/columnGroups màu của báo cáo gốc) — hiện 2
                nút này cả ở tab Realtime, xuất đúng Ô "bảng" của giai đoạn
                đang xem (xem realtimeExportTile ở trên). */}
            {(realtimeExportTile || (!activeRealtimeTab && visibleTiles.length > 0)) && (
              <div className="export-actions">
                <button type="button" disabled={exporting} onClick={() => exportAs('excel')}>Xuất Excel</button>
                <button type="button" disabled={exporting} onClick={() => exportAs('pdf')}>Xuất PDF</button>
              </div>
            )}
          </div>

          {customizing && (
            <div className="dashboard-customize-panel">
              <p className="form-hint">
                Tuỳ chỉnh CHỈ áp dụng cho riêng bạn, không ảnh hưởng người khác — lưu lại
                ngay khi bấm, dùng được trên mọi máy/điện thoại đã đăng nhập tài khoản này.
              </p>
              <label className="dashboard-customize-rangedays">
                Số ngày mặc định khi mở lại Dashboard
                <select value={preferences.defaultRangeDays || 0} onChange={(e) => setDefaultRangeDays(Number(e.target.value))}>
                  <option value={0}>Hôm nay</option>
                  <option value={7}>7 ngày gần nhất</option>
                  <option value={30}>30 ngày gần nhất</option>
                </select>
              </label>
              <ul className="dashboard-customize-tile-list">
                {rawTiles.map((t, i) => {
                  const hidden = (preferences.hiddenTileKeys || []).includes(t.key);
                  return (
                    <li key={t.key} className={hidden ? 'hidden' : ''}>
                      <label className="checkbox-row">
                        <input type="checkbox" checked={!hidden} onChange={() => toggleHiddenTile(t.key)} />
                        {t.title || t.reportId}
                      </label>
                      {/* Chữ "Lên"/"Xuống" rõ nghĩa hơn ký tự mũi tên ▲▼. */}
                      <span className="dashboard-customize-tile-move">
                        <button type="button" disabled={i === 0} onClick={() => moveTile(t.key, -1)}>Lên</button>
                        <button type="button" disabled={i === rawTiles.length - 1} onClick={() => moveTile(t.key, 1)}>Xuống</button>
                      </span>
                    </li>
                  );
                })}
              </ul>
              <div className="dashboard-customize-actions">
                <button type="button" onClick={resetPersonalization}>Khôi phục mặc định</button>
                <button type="button" onClick={() => setCustomizing(false)}>Đóng</button>
              </div>
            </div>
          )}

          {(metricTabs.length > 1 || realtimeTabs.length > 0) && (
            <div className="dashboard-metric-tabs">
              {VIEW_TABS.filter(t => metricTabs.includes(t.metricTab)).map(t => (
                <button
                  key={`${t.metricTab}-${t.mode}`}
                  type="button"
                  className={!activeRealtimeTab && t.metricTab === metricTab && t.mode === viewMode ? 'active' : ''}
                  onClick={() => {
                    setMetricTab(t.metricTab); setViewMode(t.mode); setActiveRealtimeKey(null);
                    savePreferences({ lastMetricTab: t.metricTab, lastViewMode: t.mode, lastRealtimeKey: null });
                  }}
                >
                  {t.label}
                </button>
              ))}
              {realtimeTabs.map(t => (
                <button
                  key={t.key}
                  type="button"
                  className={activeRealtimeKey === t.key ? 'active' : ''}
                  onClick={() => { setActiveRealtimeKey(t.key); savePreferences({ lastRealtimeKey: t.key }); }}
                >
                  {t.label}
                </button>
              ))}
            </div>
          )}

          {activeRealtimeTab ? (
            <RealtimeReportTile
              key={activeRealtimeTab.key}
              reportId={activeRealtimeTab.tile.reportId}
              title={activeRealtimeTab.tile.title}
              dateMode={activeRealtimeTab.tile.dateMode}
              mode={activeRealtimeTab.tile.realtimeMode}
              fromDate={fromDate}
              toDate={toDate}
              refreshTick={refreshTick}
            />
          ) : viewMode === 'chart' ? (
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
