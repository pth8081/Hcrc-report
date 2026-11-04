// modules/dashboard/RealtimeCompareTile.jsx (bản 10.62, theo yêu cầu người
// dùng: "cho phép tôi tích chọn tìm kiếm... biểu đồ sẽ so sánh các siêu thị
// dạng lên xuống để so sánh được doanh thu từng ngày/tháng của siêu thị")
// — tab RIÊNG "So sánh" bên cạnh 4 tab Realtime đã có (xem
// DashboardPage.jsx:buildRealtimeTabs()) — KHÔNG đụng gì tới 4 tab cũ,
// hoàn toàn cộng thêm.
//
// Khác 4 tab Realtime cũ (luôn đúng 1 mốc thời gian "hôm nay"/"tháng này"):
// - Chọn nhiều ĐỐI TƯỢNG (chip, màu ỔN ĐỊNH theo danh tính — xem colorFor()
//   bên dưới) để so sánh XU HƯỚNG qua nhiều ngày/tháng, không chỉ 1 mốc.
// - Bộ lọc riêng: đơn vị thời gian (ngày/tháng) + khoảng "Từ ngày — đến
//   ngày" RIÊNG (không dùng chung thanh "Từ ngày — đến ngày" của Dashboard
//   ở trên, vì khoảng đó phục vụ nghĩa KHÁC — xem DashboardTile.jsx — chọn
//   1 mốc để xem Top 5, còn đây là khoảng NHIỀU mốc để so sánh).
// - Gọi API MỚI `POST /dashboards/:dashboardId/realtime-compare` (xem
//   routes/dashboards.js) — trả doanh thu CẢ siêu thị LẪN 3 nhóm (MART/
//   MINIMART/Tổng) theo TỪNG mốc, tự lọc ra đúng đối tượng người dùng CHỌN
//   để hiển thị (API trả ĐỦ, không lọc ở tầng server, để đổi lựa chọn
//   không cần gọi lại API — CHỈ gọi lại khi đổi scope cần dữ liệu khác,
//   như bật "So với năm cùng kỳ").
// - KHÔNG tự refresh theo refreshTick mỗi 30s (dữ liệu xu hướng nhiều ngày/
//   tháng không cần làm mới theo giây như Ô "hôm nay") — chỉ gọi lại khi
//   đổi bộ lọc.
//
// scope (bản 10.65, theo yêu cầu người dùng — "cho tôi thêm 3 cái so sánh
// nữa... so sánh theo minimart, so sánh theo mart, so sánh theo [tổng]")
// — 'store' (so sánh TỪNG siêu thị, như bản 10.62) / 'group' (so sánh theo
// MART/MINIMART/Toàn hệ thống — đúng 3 dòng "Tổng cộng" đã có sẵn trong
// báo cáo gốc, KHÔNG tính lại gì — xem routes/dashboards.js:
// GROUP_ENTITY_LABELS). CẢ 2 scope dùng CHUNG 1 response API (đã có đủ cả
// stores/groups/series), đổi scope KHÔNG cần gọi lại API — chỉ đổi scope
// RỒI bật "So với năm cùng kỳ" (CHỈ áp dụng cho scope='group') mới cần gọi
// lại (vì includeLastYear tốn thêm 1 truy vấn domain gốc/mốc, xem
// routes/dashboards.js).
//
// Tái dùng ReportChart.jsx (type:'line'/'bar'/'pie') thay vì tự vẽ SVG
// riêng — nhất quán với mọi biểu đồ khác trong hệ thống, chỉ truyền thêm
// visualization.seriesColors để màu từng đối tượng ỔN ĐỊNH theo danh tính
// (xem chú thích ở ReportChart.jsx) khi đổi lựa chọn. "So với năm cùng
// kỳ" KHÔNG cần sửa gì thêm ở ReportChart.jsx — chỉ gấp đôi valueFields
// (mỗi đối tượng thành 2 field "<tên> (Năm nay)"/"<tên> (Cùng kỳ)"), màu
// "Cùng kỳ" = màu gốc PHA NHẠT (xem lighten() bên dưới).
import { lazy, Suspense, useEffect, useState } from 'react';
import { api, downloadFile } from '../../lib/api';
import { formatCellValue } from '../../lib/formatCell';
import { addDaysISO, addMonthsISO, todayISO } from '../../lib/dateRange';
import DateInput from '../../components/DateInput';
// lazy() — ReportChart.jsx import tĩnh recharts, GIỐNG HỆT lý do
// ReportBody.jsx/DashboardPage.jsx:Top5ChartTile đã lazy (xem chú thích ở
// 2 nơi đó) — import thẳng (không lazy) ở ĐÂY sẽ gộp recharts vào chunk
// CHÍNH của rp-user (đã thấy qua `npm run build`: chunk chính phình từ
// ~373KB lên 798KB khi thử import thẳng) vì DashboardPage.jsx import
// component NÀY KHÔNG qua lazy — giữ đúng tinh thần code-splitting.
const ReportChart = lazy(() => import('../../components/ReportChart'));

const MAX_DAYS = 31;
const MAX_MONTHS = 12;

// Bảng màu phân loại đã kiểm định (dataviz skill — thứ tự CỐ ĐỊNH, không
// được xáo trộn/xoay vòng, xem rp-user tổng quan thiết kế biểu đồ nội bộ).
const SERIES_PALETTE = ['#2a78d6', '#eb6834', '#1baf7a', '#eda100', '#e87ba4', '#008300', '#6250d6', '#e34948'];

const SCOPE_LABEL = { store: 'So sánh siêu thị', group: 'So sánh theo nhóm' };
// Nhãn RÚT GỌN cho chip chọn nhóm — khác hẳn `tenCuaHang` thật của dòng
// "Tổng cộng"/"Tổng cộng <nhóm>" (dài dòng khi lặp lại ở mọi nơi khác trên
// trang — tiêu đề biểu đồ/bảng VẪN hiện ĐÚNG tên gốc, chỉ riêng chip chọn
// rút ngắn cho dễ đọc).
const GROUP_CHIP_LABELS = { 'Tổng cộng MART': 'MART', 'Tổng cộng MINIMART': 'MINIMART', 'Tổng cộng': 'Toàn hệ thống' };

function defaultRangeFor(granularity) {
  const to = todayISO();
  const from = granularity === 'month' ? addMonthsISO(to, -5) : addDaysISO(to, -13);
  return { from, to };
}

// lighten(hex, amount) — pha màu gốc với trắng theo tỷ lệ `amount` (0-1) —
// dùng cho cột/đường "Cùng kỳ năm trước" trong chế độ "So với năm cùng kỳ":
// CÙNG màu với "Năm nay" của ĐÚNG đối tượng đó (giữ đúng nguyên tắc "màu
// theo danh tính") nhưng NHẠT HƠN để phân biệt 2 năm mà không cần thêm
// màu/thêm 1 bộ chú giải riêng.
function lighten(hex, amount = 0.55) {
  const n = parseInt(hex.slice(1), 16);
  const r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
  const mix = (c) => Math.round(c + (255 - c) * amount);
  return `#${[mix(r), mix(g), mix(b)].map(v => v.toString(16).padStart(2, '0')).join('')}`;
}

export default function RealtimeCompareTile({ reportId, dashboardId, title }) {
  const [scope, setScope] = useState('store');
  const [granularity, setGranularity] = useState('day');
  const [{ from: fromDate, to: toDate }, setRange] = useState(() => defaultRangeFor('day'));
  const [data, setData] = useState(null);
  const [selectedStores, setSelectedStores] = useState(() => new Set());
  const [selectedGroups, setSelectedGroups] = useState(() => new Set());
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  // showValueLabels (bản 10.63, theo yêu cầu người dùng — "cho tôi optional
  // là chọn hiển thị doanh thu hoặc không") — mặc định TẮT (nhiều đối tượng
  // x nhiều mốc thời gian cùng hiện số sẽ rối, di chuột vào biểu đồ vẫn xem
  // được số chính xác qua Tooltip) — người xem tự bật khi cần.
  const [showValueLabels, setShowValueLabels] = useState(false);
  // chartType (bản 10.64, theo yêu cầu người dùng — "phong phú với phần
  // biểu đồ... cho chọn mấy cái loại biểu đồ") — 'line' (xu hướng theo thời
  // gian, mặc định) / 'bar' (so sánh trực tiếp từng mốc) / 'pie' (tỷ trọng
  // TỔNG CỘNG DỒN cả khoảng đã chọn — xem pieRows bên dưới, KHÁC hẳn 2 kiểu
  // kia vì pie không thể hiện "theo thời gian" được, chỉ hiện đúng 1 lát
  // cắt tổng).
  const [chartType, setChartType] = useState('line');
  // includeLastYear (bản 10.65) — CHỈ áp dụng khi scope='group' (theo đúng
  // yêu cầu người dùng — "so sánh của minimart và tổng thì sẽ theo ngày,
  // theo tháng và so với năm cùng kỳ", KHÔNG nhắc tới so sánh từng siêu
  // thị) — ĐỘC LẬP với granularity (dùng được CẢ Theo ngày LẪN Theo tháng,
  // không phải 1 chế độ riêng thay thế 2 cái kia).
  const [includeLastYear, setIncludeLastYear] = useState(false);
  // exportingFormat (thay vì 1 boolean DÙNG CHUNG) — "Xuất Excel"/"Xuất PDF"
  // là 2 HÀNH ĐỘNG khác nhau trên CÙNG 1 khối — bấm Excel không được khoá
  // nhầm nút PDF và ngược lại (đúng quy ước CLAUDE.md "nhiều nút hành động
  // khác nhau, mỗi hành động 1 biến riêng").
  const [exportingFormat, setExportingFormat] = useState(null);

  const effectiveIncludeLastYear = scope === 'group' && includeLastYear;

  function changeGranularity(g) {
    setGranularity(g);
    setRange(defaultRangeFor(g));
  }
  function changeFromDate(value) {
    setRange(r => (value > r.to ? { from: value, to: value } : { ...r, from: value }));
  }
  function changeToDate(value) {
    setRange(r => (value < r.from ? { from: value, to: value } : { ...r, to: value }));
  }

  useEffect(() => {
    setLoading(true);
    setError('');
    api.post(`/dashboards/${dashboardId}/realtime-compare`, {
      reportId, dateMode: granularity, fromDate, toDate, includeLastYear: effectiveIncludeLastYear
    })
      .then(result => {
        setData(result);
        // Lần đầu có dữ liệu (chưa ai chọn gì) -> không tự chọn sẵn đối
        // tượng nào (tránh đoán sai ý người xem) — chỉ giữ lại các lựa
        // chọn CŨ còn tồn tại trong danh sách MỚI (đổi khoảng ngày có thể
        // khiến 1 vài siêu thị không còn dữ liệu trong khoảng đó).
        setSelectedStores(prev => new Set([...prev].filter(name => result.stores.includes(name))));
        setSelectedGroups(prev => new Set([...prev].filter(name => result.groups.includes(name))));
      })
      .catch(err => setError(err.message))
      .finally(() => setLoading(false));
  }, [reportId, dashboardId, granularity, fromDate, toDate, effectiveIncludeLastYear]);

  const entities = data ? (scope === 'store' ? data.stores : data.groups) : [];
  const selected = scope === 'store' ? selectedStores : selectedGroups;
  const setSelected = scope === 'store' ? setSelectedStores : setSelectedGroups;

  function toggleEntity(name) {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name); else next.add(name);
      return next;
    });
  }

  const colorFor = (name) => SERIES_PALETTE[entities.indexOf(name) % SERIES_PALETTE.length];
  const selectedEntities = entities.filter(s => selected.has(s));

  const baseColors = Object.fromEntries(selectedEntities.map(name => [name, colorFor(name)]));

  // pie: KHÔNG có trục thời gian — mỗi đối tượng đã chọn thành 1 LÁT, giá
  // trị = TỔNG CỘNG DỒN doanh thu trên TOÀN BỘ khoảng ngày/tháng đang xem
  // (không phải 1 mốc riêng lẻ) — trả lời câu hỏi "trong cả khoảng này, ai
  // đóng góp bao nhiêu %", khác hẳn line/bar (xem xu hướng TỪNG mốc). KHÔNG
  // có ý nghĩa ở chế độ "So với năm cùng kỳ" (so 2 năm, không phải tỷ
  // trọng) — ẩn hẳn nút "Tròn" khi effectiveIncludeLastYear (xem JSX).
  const pieRows = selectedEntities.map(name => ({
    _entity: name, tong: (data?.series[name] || []).reduce((sum, v) => sum + (v || 0), 0)
  }));
  const pieColumns = [{ key: '_entity', label: scope === 'store' ? 'Siêu thị' : 'Nhóm' }, { key: 'tong', label: 'Tổng doanh thu' }];
  const pieVisualization = {
    type: 'pie', xField: '_entity', valueFields: ['tong'],
    unitDivisor: 1_000_000, unitNote: 'ĐVT: 1.000.000 — tổng cộng dồn cả khoảng đã chọn',
    seriesColors: baseColors
  };

  const effectiveChartType = effectiveIncludeLastYear && chartType === 'pie' ? 'bar' : chartType;

  // So với năm cùng kỳ: mỗi đối tượng GẤP ĐÔI thành 2 field "<tên> (Năm
  // nay)"/"<tên> (Cùng kỳ)" — field key = chính label hiển thị (đơn giản,
  // ReportChart tự fallback label=key khi không khớp columns).
  const yoyFields = effectiveIncludeLastYear
    ? selectedEntities.flatMap(name => [`${name} (Năm nay)`, `${name} (Cùng kỳ)`])
    : null;

  const chartColumns = effectiveChartType === 'pie' ? pieColumns
    : (yoyFields || selectedEntities).map(key => ({ key, label: key }));
  const chartRows = effectiveChartType === 'pie' ? pieRows : (data ? data.buckets.map((b, i) => ({
    _bucket: b.label,
    ...(effectiveIncludeLastYear
      ? Object.fromEntries(selectedEntities.flatMap(name => [
          [`${name} (Năm nay)`, data.series[name]?.[i] ?? 0],
          [`${name} (Cùng kỳ)`, data.seriesLastYear?.[name]?.[i] ?? 0]
        ]))
      : Object.fromEntries(selectedEntities.map(name => [name, data.series[name]?.[i] ?? 0])))
  })) : []);
  const chartVisualization = effectiveChartType === 'pie' ? pieVisualization : {
    type: effectiveChartType, xField: '_bucket', valueFields: yoyFields || selectedEntities,
    unitDivisor: 1_000_000, unitNote: 'ĐVT: 1.000.000', rotateXLabels: true,
    showValueLabels,
    seriesColors: effectiveIncludeLastYear
      ? Object.fromEntries(selectedEntities.flatMap(name => [[`${name} (Năm nay)`, baseColors[name]], [`${name} (Cùng kỳ)`, lighten(baseColors[name])]]))
      : baseColors
  };

  async function exportAs(format) {
    setExportingFormat(format);
    setError('');
    try {
      await downloadFile(
        `/dashboards/${dashboardId}/realtime-compare/export`,
        { reportId, dateMode: granularity, fromDate, toDate, includeLastYear: effectiveIncludeLastYear, entities: selectedEntities, scopeLabel: SCOPE_LABEL[scope], format },
        `so-sanh.${format === 'excel' ? 'xlsx' : 'pdf'}`
      );
    } catch (err) {
      setError(err.message);
    } finally {
      setExportingFormat(null);
    }
  }

  return (
    <div className="dashboard-tile dashboard-tile--wide">
      <div className="dashboard-tile-header">
        <h3 className="dashboard-tile-title">{title} — {SCOPE_LABEL[scope]} theo thời gian</h3>
        {selectedEntities.length > 0 && (
          <div className="export-actions">
            <button type="button" disabled={exportingFormat === 'excel'} onClick={() => exportAs('excel')}>{exportingFormat === 'excel' ? 'Đang xuất...' : 'Xuất Excel'}</button>
            <button type="button" disabled={exportingFormat === 'pdf'} onClick={() => exportAs('pdf')}>{exportingFormat === 'pdf' ? 'Đang xuất...' : 'Xuất PDF'}</button>
          </div>
        )}
      </div>

      <div className="realtime-compare-field realtime-compare-scope-field">
        <span className="realtime-compare-field-label">Phạm vi so sánh</span>
        <div className="seg">
          <button type="button" className={scope === 'store' ? 'active' : ''} onClick={() => setScope('store')}>So sánh siêu thị</button>
          <button type="button" className={scope === 'group' ? 'active' : ''} onClick={() => setScope('group')}>So sánh theo nhóm (MART / MINIMART / Toàn hệ thống)</button>
        </div>
      </div>

      <div className="realtime-compare-controls">
        <div className="realtime-compare-field">
          <span className="realtime-compare-field-label">Đơn vị thời gian</span>
          <div className="seg">
            <button type="button" className={granularity === 'day' ? 'active' : ''} onClick={() => changeGranularity('day')}>Theo ngày</button>
            <button type="button" className={granularity === 'month' ? 'active' : ''} onClick={() => changeGranularity('month')}>Theo tháng</button>
          </div>
        </div>
        <div className="realtime-compare-field">
          <span className="realtime-compare-field-label">Từ ngày</span>
          <DateInput value={fromDate} max={todayISO()} onChange={(e) => changeFromDate(e.target.value)} />
        </div>
        <div className="realtime-compare-field">
          <span className="realtime-compare-field-label">đến ngày</span>
          <DateInput value={toDate} max={todayISO()} onChange={(e) => changeToDate(e.target.value)} />
        </div>
        {scope === 'group' && (
          <label className="checkbox-row realtime-compare-showvalues">
            <input type="checkbox" checked={includeLastYear} onChange={(e) => setIncludeLastYear(e.target.checked)} />
            So với năm cùng kỳ
          </label>
        )}
      </div>
      <p className="form-hint">
        {granularity === 'day'
          ? `Xem theo từng ngày trong khoảng đã chọn (tối đa ${MAX_DAYS} ngày/lần).`
          : `Xem theo từng tháng (cộng dồn từ đầu tháng) trong khoảng đã chọn (tối đa ${MAX_MONTHS} tháng/lần).`}
        {effectiveIncludeLastYear && ' Mỗi mốc hiện thêm giá trị cùng kỳ năm trước (cùng màu, nhạt hơn) để so sánh.'}
      </p>

      {error && <p className="form-error">{error}</p>}

      {entities.length > 0 && (
        <div className="realtime-compare-picker">
          {entities.map(name => (
            <label key={name} className={`realtime-compare-chip${selected.has(name) ? ' checked' : ''}`} style={{ '--chip-color': colorFor(name) }}>
              <input type="checkbox" checked={selected.has(name)} onChange={() => toggleEntity(name)} />
              <span className="realtime-compare-chip-dot" />
              {scope === 'group' ? (GROUP_CHIP_LABELS[name] || name) : name}
            </label>
          ))}
        </div>
      )}

      {loading && <p>Đang tải...</p>}
      {!loading && data && !selectedEntities.length && <p className="empty-message">Chọn ít nhất 1 {scope === 'store' ? 'siêu thị' : 'nhóm'} ở trên để xem so sánh.</p>}

      {!loading && selectedEntities.length > 0 && (
        <>
          <div className="realtime-compare-chart-options">
            <div className="realtime-compare-field">
              <span className="realtime-compare-field-label">Kiểu biểu đồ</span>
              <div className="seg">
                <button type="button" className={effectiveChartType === 'line' ? 'active' : ''} onClick={() => setChartType('line')}>📈 Đường</button>
                <button type="button" className={effectiveChartType === 'bar' ? 'active' : ''} onClick={() => setChartType('bar')}>📊 Cột</button>
                <button type="button" className={effectiveChartType === 'pie' ? 'active' : ''} disabled={effectiveIncludeLastYear} onClick={() => setChartType('pie')}>🥧 Tròn</button>
              </div>
            </div>
            {effectiveChartType !== 'pie' && (
              <label className="checkbox-row realtime-compare-showvalues">
                <input type="checkbox" checked={showValueLabels} onChange={(e) => setShowValueLabels(e.target.checked)} />
                Hiện số liệu trên từng điểm biểu đồ
              </label>
            )}
          </div>
          {effectiveChartType === 'pie' && (
            <p className="form-hint">Biểu đồ tròn hiện tỷ trọng TỔNG CỘNG DỒN cả khoảng đã chọn ({granularity === 'day' ? `${data.buckets.length} ngày` : `${data.buckets.length} tháng`}), không theo từng mốc riêng — muốn xem xu hướng từng ngày/tháng, chọn "Đường" hoặc "Cột".</p>
          )}
          <Suspense fallback={<p>Đang tải biểu đồ...</p>}>
            <ReportChart columns={chartColumns} rows={chartRows} visualization={chartVisualization} onPointClick={() => {}} />
          </Suspense>

          <div className="table-scroll">
            <table className="data-table">
              <thead>
                <tr>
                  <th>{granularity === 'day' ? 'Ngày' : 'Tháng'}</th>
                  {effectiveIncludeLastYear
                    ? selectedEntities.flatMap(name => [
                        <th key={`${name}-cur`}>{name} (Năm nay)</th>,
                        <th key={`${name}-ly`}>{name} (Cùng kỳ)</th>
                      ])
                    : selectedEntities.map(name => <th key={name}>{name}</th>)}
                </tr>
              </thead>
              <tbody>
                {data.buckets.map((b, i) => (
                  <tr key={b.key}>
                    <td>{b.label}</td>
                    {effectiveIncludeLastYear
                      ? selectedEntities.flatMap(name => [
                          <td key={`${name}-cur`}>{formatCellValue(data.series[name]?.[i] ?? 0)}</td>,
                          <td key={`${name}-ly`}>{formatCellValue(data.seriesLastYear?.[name]?.[i] ?? 0)}</td>
                        ])
                      : selectedEntities.map(name => <td key={name}>{formatCellValue(data.series[name]?.[i] ?? 0)}</td>)}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
