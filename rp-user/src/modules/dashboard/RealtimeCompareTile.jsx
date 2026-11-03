// modules/dashboard/RealtimeCompareTile.jsx (bản 10.62, theo yêu cầu người
// dùng: "cho phép tôi tích chọn tìm kiếm... biểu đồ sẽ so sánh các siêu thị
// dạng lên xuống để so sánh được doanh thu từng ngày/tháng của siêu thị")
// — tab RIÊNG "So sánh siêu thị" bên cạnh 4 tab Realtime đã có (xem
// DashboardPage.jsx:buildRealtimeTabs()) — KHÔNG đụng gì tới 4 tab cũ,
// hoàn toàn cộng thêm.
//
// Khác 4 tab Realtime cũ (luôn đúng 1 mốc thời gian "hôm nay"/"tháng này"):
// - Chọn nhiều siêu thị (chip, màu ỔN ĐỊNH theo danh tính — xem colorFor()
//   bên dưới) để so sánh XU HƯỚNG qua nhiều ngày/tháng, không chỉ 1 mốc.
// - Bộ lọc riêng: đơn vị thời gian (ngày/tháng) + khoảng "Từ ngày — đến
//   ngày" RIÊNG (không dùng chung thanh "Từ ngày — đến ngày" của Dashboard
//   ở trên, vì khoảng đó phục vụ nghĩa KHÁC — xem DashboardTile.jsx — chọn
//   1 mốc để xem Top 5, còn đây là khoảng NHIỀU mốc để so sánh).
// - Gọi API MỚI `POST /dashboards/:dashboardId/realtime-compare` (xem
//   routes/dashboards.js) — trả doanh thu MỌI siêu thị theo TỪNG mốc, tự lọc
//   ra đúng siêu thị đã CHỌN để vẽ/hiện bảng ở tầng này — ĐỔI lựa chọn
//   siêu thị không cần gọi lại API (đã có đủ dữ liệu mọi siêu thị).
// - KHÔNG tự refresh theo refreshTick mỗi 30s (dữ liệu xu hướng nhiều ngày/
//   tháng không cần làm mới theo giây như Ô "hôm nay") — chỉ gọi lại khi
//   đổi đơn vị thời gian/khoảng ngày.
//
// Tái dùng ReportChart.jsx (type:'line') thay vì tự vẽ SVG riêng — nhất
// quán với mọi biểu đồ khác trong hệ thống (cùng PALETTE/Tooltip/Legend/
// rotateXLabels bản 10.62), chỉ truyền thêm visualization.seriesColors để
// màu từng siêu thị ỔN ĐỊNH theo danh tính (xem chú thích ở ReportChart.jsx)
// khi đổi lựa chọn.
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

function defaultRangeFor(granularity) {
  const to = todayISO();
  const from = granularity === 'month' ? addMonthsISO(to, -5) : addDaysISO(to, -13);
  return { from, to };
}

export default function RealtimeCompareTile({ reportId, dashboardId, title }) {
  const [granularity, setGranularity] = useState('day');
  const [{ from: fromDate, to: toDate }, setRange] = useState(() => defaultRangeFor('day'));
  const [data, setData] = useState(null);
  const [selected, setSelected] = useState(() => new Set());
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  // showValueLabels (bản 10.63, theo yêu cầu người dùng — "cho tôi optional
  // là chọn hiển thị doanh thu hoặc không") — mặc định TẮT (nhiều siêu thị x
  // nhiều mốc thời gian cùng hiện số sẽ rối, di chuột vào biểu đồ vẫn xem
  // được số chính xác qua Tooltip) — người xem tự bật khi cần.
  const [showValueLabels, setShowValueLabels] = useState(false);
  // chartType (bản 10.64, theo yêu cầu người dùng — "phong phú với phần
  // biểu đồ... cho chọn mấy cái loại biểu đồ") — 'line' (xu hướng theo thời
  // gian, mặc định) / 'bar' (so sánh trực tiếp từng mốc) / 'pie' (tỷ trọng
  // TỔNG CỘNG DỒN cả khoảng đã chọn — xem pieRows bên dưới, KHÁC hẳn 2 kiểu
  // kia vì pie không thể hiện "theo thời gian" được, chỉ hiện đúng 1 lát
  // cắt tổng).
  const [chartType, setChartType] = useState('line');
  // exportingFormat (thay vì 1 boolean DÙNG CHUNG) — "Xuất Excel"/"Xuất PDF"
  // là 2 HÀNH ĐỘNG khác nhau trên CÙNG 1 khối — bấm Excel không được khoá
  // nhầm nút PDF và ngược lại (đúng quy ước CLAUDE.md "nhiều nút hành động
  // khác nhau, mỗi hành động 1 biến riêng").
  const [exportingFormat, setExportingFormat] = useState(null);

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
    api.post(`/dashboards/${dashboardId}/realtime-compare`, { reportId, dateMode: granularity, fromDate, toDate })
      .then(result => {
        setData(result);
        // Lần đầu có dữ liệu (chưa ai chọn gì) -> không tự chọn sẵn siêu thị
        // nào (tránh đoán sai ý người xem) — chỉ giữ lại các lựa chọn CŨ còn
        // tồn tại trong danh sách siêu thị MỚI (đổi khoảng ngày có thể khiến
        // 1 vài siêu thị không còn dữ liệu trong khoảng đó).
        setSelected(prev => new Set([...prev].filter(name => result.stores.includes(name))));
      })
      .catch(err => setError(err.message))
      .finally(() => setLoading(false));
  }, [reportId, dashboardId, granularity, fromDate, toDate]);

  function toggleStore(name) {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name); else next.add(name);
      return next;
    });
  }

  const stores = data?.stores || [];
  const colorFor = (name) => SERIES_PALETTE[stores.indexOf(name) % SERIES_PALETTE.length];
  const selectedStores = stores.filter(s => selected.has(s));

  const seriesColors = Object.fromEntries(selectedStores.map(name => [name, colorFor(name)]));

  // pie: KHÔNG có trục thời gian — mỗi siêu thị đã chọn thành 1 LÁT, giá
  // trị = TỔNG CỘNG DỒN doanh thu của siêu thị đó trên TOÀN BỘ khoảng ngày/
  // tháng đang xem (không phải 1 mốc riêng lẻ) — trả lời câu hỏi "trong cả
  // khoảng này, siêu thị nào đóng góp bao nhiêu %", khác hẳn line/bar (xem
  // xu hướng TỪNG mốc).
  const pieRows = selectedStores.map(name => ({
    _store: name, tong: (data?.series[name] || []).reduce((sum, v) => sum + (v || 0), 0)
  }));
  const pieColumns = [{ key: '_store', label: 'Siêu thị' }, { key: 'tong', label: 'Tổng doanh thu' }];
  const pieVisualization = {
    type: 'pie', xField: '_store', valueFields: ['tong'],
    unitDivisor: 1_000_000, unitNote: 'ĐVT: 1.000.000 — tổng cộng dồn cả khoảng đã chọn',
    seriesColors
  };

  const chartColumns = chartType === 'pie' ? pieColumns : selectedStores.map(name => ({ key: name, label: name }));
  const chartRows = chartType === 'pie' ? pieRows : (data ? data.buckets.map((b, i) => ({
    _bucket: b.label,
    ...Object.fromEntries(selectedStores.map(name => [name, data.series[name]?.[i] ?? 0]))
  })) : []);
  const chartVisualization = chartType === 'pie' ? pieVisualization : {
    type: chartType, xField: '_bucket', valueFields: selectedStores,
    unitDivisor: 1_000_000, unitNote: 'ĐVT: 1.000.000', rotateXLabels: true,
    showValueLabels,
    seriesColors
  };

  async function exportAs(format) {
    setExportingFormat(format);
    setError('');
    try {
      await downloadFile(
        `/dashboards/${dashboardId}/realtime-compare/export`,
        { reportId, dateMode: granularity, fromDate, toDate, stores: selectedStores, format },
        `so-sanh-sieu-thi.${format === 'excel' ? 'xlsx' : 'pdf'}`
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
        <h3 className="dashboard-tile-title">{title} — So sánh siêu thị theo thời gian</h3>
        {selectedStores.length > 0 && (
          <div className="export-actions">
            <button type="button" disabled={exportingFormat === 'excel'} onClick={() => exportAs('excel')}>{exportingFormat === 'excel' ? 'Đang xuất...' : 'Xuất Excel'}</button>
            <button type="button" disabled={exportingFormat === 'pdf'} onClick={() => exportAs('pdf')}>{exportingFormat === 'pdf' ? 'Đang xuất...' : 'Xuất PDF'}</button>
          </div>
        )}
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
      </div>
      <p className="form-hint">
        {granularity === 'day'
          ? `Xem theo từng ngày trong khoảng đã chọn (tối đa ${MAX_DAYS} ngày/lần).`
          : `Xem theo từng tháng (cộng dồn từ đầu tháng) trong khoảng đã chọn (tối đa ${MAX_MONTHS} tháng/lần).`}
      </p>

      {error && <p className="form-error">{error}</p>}

      {stores.length > 0 && (
        <div className="realtime-compare-picker">
          {stores.map(name => (
            <label key={name} className={`realtime-compare-chip${selected.has(name) ? ' checked' : ''}`} style={{ '--chip-color': colorFor(name) }}>
              <input type="checkbox" checked={selected.has(name)} onChange={() => toggleStore(name)} />
              <span className="realtime-compare-chip-dot" />
              {name}
            </label>
          ))}
        </div>
      )}

      {loading && <p>Đang tải...</p>}
      {!loading && data && !selectedStores.length && <p className="empty-message">Chọn ít nhất 1 siêu thị ở trên để xem so sánh.</p>}

      {!loading && selectedStores.length > 0 && (
        <>
          <div className="realtime-compare-chart-options">
            <div className="realtime-compare-field">
              <span className="realtime-compare-field-label">Kiểu biểu đồ</span>
              <div className="seg">
                <button type="button" className={chartType === 'line' ? 'active' : ''} onClick={() => setChartType('line')}>📈 Đường</button>
                <button type="button" className={chartType === 'bar' ? 'active' : ''} onClick={() => setChartType('bar')}>📊 Cột</button>
                <button type="button" className={chartType === 'pie' ? 'active' : ''} onClick={() => setChartType('pie')}>🥧 Tròn</button>
              </div>
            </div>
            {chartType !== 'pie' && (
              <label className="checkbox-row realtime-compare-showvalues">
                <input type="checkbox" checked={showValueLabels} onChange={(e) => setShowValueLabels(e.target.checked)} />
                Hiện số liệu trên từng điểm biểu đồ
              </label>
            )}
          </div>
          {chartType === 'pie' && (
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
                  {selectedStores.map(name => <th key={name}>{name}</th>)}
                </tr>
              </thead>
              <tbody>
                {data.buckets.map((b, i) => (
                  <tr key={b.key}>
                    <td>{b.label}</td>
                    {selectedStores.map(name => <td key={name}>{formatCellValue(data.series[name]?.[i] ?? 0)}</td>)}
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
