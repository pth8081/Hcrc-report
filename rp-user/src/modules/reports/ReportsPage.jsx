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
import SearchableSelect from '../../components/SearchableSelect';
import { filterColumns, filterGroups } from '../../lib/reportGroupColors';

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
  const [exportingFormat, setExportingFormat] = useState(null);
  // visibleColumnKeys (bản 8.97, theo yêu cầu người dùng: "cho phép mình
  // chọn các trường ẩn đi khi xem báo cáo trên web hoặc xuất excel/pdf") —
  // CHỈ áp dụng cho báo cáo có columnGroups (hiện 4 báo cáo "Doanh thu cuối
  // ngày", xem điều kiện hiện ô chọn bên dưới) — rỗng = hiện ĐỦ cột (mặc
  // định). Lọc NGAY TRÊN TRÌNH DUYỆT cho bảng xem (không gọi lại server —
  // result.rows đã có sẵn mọi field, DataTable chỉ vẽ theo đúng columns
  // truyền vào) — chỉ gửi lên server lúc xuất Excel/PDF (xem exportAs()).
  // Là lựa chọn THEO PHIÊN XEM hiện tại, không lưu lại — đổi báo cáo khác
  // (selectedId đổi) thì về lại mặc định "hiện đủ cột".
  const [visibleColumnKeys, setVisibleColumnKeys] = useState([]);

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
    setVisibleColumnKeys([]);
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
    setVisibleColumnKeys([]);
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
    setExportingFormat(format);
    try {
      // visibleColumnKeys (bản 8.97) — gửi kèm đúng cột đang chọn hiện trên
      // web, để file Excel/PDF xuất ra KHỚP những gì đang xem, không phải
      // luôn đủ cột — xem routes/reports.js:POST /:reportId/export.
      await downloadFile(
        `/reports/${selectedId}/export`,
        { filters: filterValues, format, visibleColumnKeys },
        `${definition?.title || 'bao-cao'}.${format === 'excel' ? 'xlsx' : 'pdf'}`
      );
    } catch (err) {
      setError(err.message);
    } finally {
      setExportingFormat(null);
    }
  }

  // displayResult (bản 8.97) — result đã lọc theo visibleColumnKeys để vẽ
  // bảng trên web (xem chú thích state ở trên) — KHÔNG đụng result.rows
  // (DataTable chỉ vẽ theo đúng mảng columns truyền vào, field thừa trên
  // mỗi row tự bị bỏ qua, xem components/DataTable.jsx).
  const displayResult = useMemo(() => {
    if (!result || !visibleColumnKeys.length) return result;
    const columns = filterColumns(result.columns, visibleColumnKeys);
    const columnGroups = result.columnGroups ? filterGroups(result.columnGroups, columns) : result.columnGroups;
    return { ...result, columns, columnGroups };
  }, [result, visibleColumnKeys]);

  if (!groups.length) {
    return (
      <div className="page page--wide">
        <h1>Báo cáo</h1>
        <p className="empty-message">Bạn chưa được cấp quyền xem nhóm báo cáo nào.</p>
      </div>
    );
  }

  return (
    <div className="page page--wide">
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
          <FilterForm reportId={selectedId} filters={definition.filters} values={filterValues} onChange={setFilterValues} onSubmit={runReport} loading={loading} />
          {result && (
            <>
              <div className="export-actions">
                <button type="button" onClick={() => exportAs('excel')} disabled={!!exportingFormat}>{exportingFormat === 'excel' ? 'Đang xuất...' : 'Xuất Excel'}</button>
                <button type="button" onClick={() => exportAs('pdf')} disabled={!!exportingFormat}>{exportingFormat === 'pdf' ? 'Đang xuất...' : 'Xuất PDF'}</button>
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
              {/* Ô chọn cột hiển thị (bản 8.97) — CHỈ hiện cho báo cáo có
                  columnGroups (hiện 4 báo cáo "Doanh thu cuối ngày", đã rà
                  soát `grep columnGroups` toàn repo — xem chú thích cùng chủ
                  đề ở rp-user/src/styles.css:.data-table--grouped) — báo cáo
                  phẳng khác KHÔNG hiện ô này, không đổi gì. Lọc NGAY lúc
                  tick (xem displayResult ở trên), đồng thời gửi kèm đúng cột
                  đang chọn lúc xuất Excel/PDF (xem exportAs()). */}
              {result.columnGroups?.length > 0 && (
                <div className="filter-config">
                  <strong>Cột hiển thị (không chọn = hiện đủ cột)</strong>
                  <SearchableSelect
                    multi
                    options={result.columns.map(c => ({ value: c.key, label: c.label }))}
                    value={visibleColumnKeys}
                    onChange={setVisibleColumnKeys}
                    placeholder="Tất cả cột"
                  />
                  <p className="hint">
                    Áp dụng NGAY cho bảng đang xem VÀ cho file xuất Excel/PDF — chỉ áp dụng cho
                    phiên xem hiện tại, đổi báo cáo khác sẽ về lại hiện đủ cột.
                  </p>
                </div>
              )}
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
                result={displayResult}
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
