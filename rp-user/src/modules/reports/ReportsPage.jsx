// modules/reports/ReportsPage.jsx — MỘT trang "Báo cáo" duy nhất, thay 3
// trang riêng (kinh doanh/vận hành/Mua hàng) trước đây — gộp điều hướng cho
// gọn nhưng KHÔNG đổi phân quyền: nhóm nghiệp vụ vẫn đọc từ đúng
// app.MenuItems (mã bắt đầu "reports-") + me.menu đã lọc quyền sẵn ở server
// (GET /api/me — xem lib/permissions.js), báo cáo trong từng nhóm vẫn lọc
// riêng theo app.RoleReportAccess (GET /api/reports?menuCode=...). Vẽ thành
// TAB bên trong 1 trang thay vì 3 route/3 mục sidebar riêng.
import { useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { api, downloadFile } from '../../lib/api';
import { useAuth } from '../../lib/AuthContext';
import FilterForm from '../../components/FilterForm';
import ReportBody from '../../components/ReportBody';

export default function ReportsPage() {
  const { me } = useAuth();
  const groups = useMemo(
    () => (me?.menu || []).filter(m => m.code.startsWith('reports-')),
    [me]
  );

  const [activeCode, setActiveCode] = useState('');
  const [reports, setReports] = useState([]);
  const [selectedId, setSelectedId] = useState('');
  const [definition, setDefinition] = useState(null);
  const [filterValues, setFilterValues] = useState({});
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  // Báo cáo có khai definition.visualization -> mặc định xem biểu đồ, vẫn
  // cho chuyển qua bảng số bất kỳ lúc nào (giống Power BI: 1 visual luôn
  // xem lại được dạng bảng). Báo cáo KHÔNG khai visualization thì luôn là
  // bảng, không có nút chuyển (không có gì để chuyển sang).
  const [showTable, setShowTable] = useState(false);

  // Drill-through (Giai đoạn D — xem VERSION.md): bấm 1 điểm trên biểu đồ
  // của báo cáo NÀY điều hướng sang MỘT báo cáo KHÁC đã lọc sẵn, qua URL
  // `?reportId=...&filters=...` (đọc bên dưới) — cùng trang /reports, không
  // dựng route/khung riêng. `[selectedId]` effect bên dưới đọc cờ này để
  // biết có cần TỰ CHẠY báo cáo ngay (không đợi bấm "Lọc") hay không.
  const [searchParams, setSearchParams] = useSearchParams();
  const pendingDrillFiltersRef = useRef(null);
  const autoRunRef = useRef(false);

  // Vào trang lần đầu (hoặc quyền vừa đổi) -> tự chọn tab ĐẦU TIÊN còn hợp lệ.
  useEffect(() => {
    if (groups.length && !groups.some(g => g.code === activeCode)) {
      setActiveCode(groups[0].code);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [groups]);

  useEffect(() => {
    if (!activeCode) return;
    api.get(`/reports?menuCode=${encodeURIComponent(activeCode)}`).then(setReports).catch(err => setError(err.message));
    setSelectedId('');
    setDefinition(null);
    setResult(null);
  }, [activeCode]);

  // Drill-through đến (URL có ?reportId=...) — CHỌN THẲNG báo cáo đích, BỎ
  // QUA yêu cầu phải nằm trong danh sách `reports` của tab đang mở (báo cáo
  // đích có thể thuộc nhóm nghiệp vụ khác) — dropdown bên dưới tự thêm 1 lựa
  // chọn tạm cho trường hợp này. Chỉ tác dụng khi component ĐANG MỞ SẴN (bấm
  // 1 biểu đồ trong khi đang xem /reports) — activeCode lúc đó đã ổn định
  // nên effect ở trên không chạy lại, không có tranh chấp reset selectedId.
  useEffect(() => {
    const drillReportId = searchParams.get('reportId');
    if (!drillReportId) return;
    let filters = {};
    try { filters = JSON.parse(searchParams.get('filters') || '{}'); } catch { /* bỏ qua, coi như không có bộ lọc */ }
    pendingDrillFiltersRef.current = filters;
    setSelectedId(drillReportId);
    setSearchParams({}, { replace: true }); // dọn query string sau khi đã áp dụng
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  useEffect(() => {
    if (!selectedId) return;
    const drillFilters = pendingDrillFiltersRef.current;
    pendingDrillFiltersRef.current = null;
    setFilterValues(drillFilters || {});
    setResult(null);
    setShowTable(false);
    autoRunRef.current = !!drillFilters; // đến từ drill-through -> tự chạy ngay khi có definition, không đợi bấm "Lọc"
    api.get(`/reports/${selectedId}`).then(setDefinition).catch(err => setError(err.message));
  }, [selectedId]);

  useEffect(() => {
    if (definition && autoRunRef.current) {
      autoRunRef.current = false;
      runReport();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [definition]);

  // Bấm 1 điểm trên biểu đồ có khai visualization.drillThrough — điều hướng
  // sang báo cáo đích, đặt SẴN 1 bộ lọc {field: value}. `field` lấy từ cấu
  // hình drillThrough — có thể KHÁC field đang vẽ trục X của biểu đồ nguồn
  // (vd biểu đồ nguồn nhóm theo "tenCuaHang" cho đẹp, nhưng báo cáo đích lọc
  // theo "maCuaHang") — nên đọc `value` từ NGUYÊN dòng dữ liệu của điểm vừa
  // bấm (`row`, xem ReportChart.jsx), không phải chỉ mỗi giá trị trục X.
  function handleDrillThrough(row) {
    const { field, targetReportId } = definition.visualization.drillThrough;
    setSearchParams({ reportId: targetReportId, filters: JSON.stringify({ [field]: row[field] }) });
  }

  async function runReport() {
    setLoading(true);
    setError('');
    try {
      const data = await api.post(`/reports/${selectedId}/run`, { filters: filterValues, page: 1, pageSize: 200 });
      setResult(data);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  async function exportAs(format) {
    try {
      await downloadFile(`/reports/${selectedId}/export`, { filters: filterValues, format }, `${definition?.title || 'bao-cao'}.${format === 'excel' ? 'xlsx' : 'pdf'}`);
    } catch (err) {
      setError(err.message);
    }
  }

  if (!groups.length) {
    return (
      <div className="page">
        <h1>Báo cáo</h1>
        <p className="empty-message">Bạn chưa được cấp quyền xem nhóm báo cáo nào.</p>
      </div>
    );
  }

  return (
    <div className="page">
      <h1>Báo cáo</h1>
      {error && <p className="form-error">{error}</p>}

      <div className="tabs">
        {groups.map(g => (
          <button key={g.code} type="button" className={g.code === activeCode ? 'active' : ''} onClick={() => setActiveCode(g.code)}>
            {g.label}
          </button>
        ))}
      </div>

      <label className="report-picker">
        <span>Chọn báo cáo</span>
        <select value={selectedId} onChange={(e) => setSelectedId(e.target.value)}>
          <option value="">— Chọn —</option>
          {reports.map(r => <option key={r.ReportId} value={r.ReportId}>{r.Title}</option>)}
          {/* Đến từ drill-through, báo cáo đích thuộc nhóm nghiệp vụ KHÁC tab
              đang mở -> không nằm trong `reports` (đã lọc theo activeCode) —
              thêm 1 lựa chọn tạm để dropdown không hiện trống dù nội dung
              bên dưới đã đúng báo cáo đích. */}
          {selectedId && definition && !reports.some(r => r.ReportId === selectedId) && (
            <option value={selectedId}>{definition.title} (từ báo cáo khác)</option>
          )}
        </select>
      </label>

      {definition && (
        <>
          <FilterForm filters={definition.filters} values={filterValues} onChange={setFilterValues} onSubmit={runReport} />
          {result && (
            <>
              <div className="export-actions">
                <button type="button" onClick={() => exportAs('excel')}>Xuất Excel</button>
                <button type="button" onClick={() => exportAs('pdf')}>Xuất PDF</button>
                {/* Chỉ hiện nút chuyển đổi khi báo cáo THẬT SỰ có biểu đồ để
                    chuyển sang/về — báo cáo không khai visualization luôn ở
                    dạng bảng, không có gì để bấm. */}
                {definition.visualization && (
                  <button type="button" onClick={() => setShowTable(v => !v)}>
                    {showTable
                      ? (definition.visualization.type === 'pivot' ? '🔀 Xem Pivot' : '📊 Xem biểu đồ')
                      : '📋 Xem bảng chi tiết'}
                  </button>
                )}
              </div>
              {/* warnings — CHỈ có ở báo cáo composite (xem
                  rp-server/lib/compositeReportRunner.js), khi 1 khối nguồn
                  trả nhiều hơn 1 dòng cho cùng thực thể — thực thể đó đã bị
                  LOẠI khỏi kết quả bên dưới (không hiện số liệu có thể sai),
                  báo ở đây để người dùng biết báo cáo đang THIẾU vài dòng,
                  không phải "hết dữ liệu". */}
              {result.warnings?.map((w, i) => <p key={i} className="form-warning">⚠️ {w}</p>)}
              {/* result.columns đã là [{key,label}] — rp-server chuẩn hoá sẵn
                  (kể cả cột công thức), xem rp-server/lib/reportEngine.js:describeColumns(). */}
              <ReportBody
                visualization={definition.visualization}
                showTable={showTable}
                result={result}
                onPointClick={definition.visualization?.drillThrough ? (row) => handleDrillThrough(row) : undefined}
              />
            </>
          )}
          {loading && <p>Đang tải...</p>}
        </>
      )}
    </div>
  );
}
