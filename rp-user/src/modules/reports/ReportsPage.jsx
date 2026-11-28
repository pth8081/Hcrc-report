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
import ReportSummaryCards from '../../components/ReportSummaryCards';
import SearchableSelect from '../../components/SearchableSelect';
import { filterColumns, filterGroups } from '../../lib/reportGroupColors';
import { resolveQuickDatePreset } from '../../lib/dateRange';

// Bản 10.87/10.90 — 2 báo cáo CÓ nút "Xuất Excel theo tháng (1 sheet/ngày)"
// riêng (xem routes/reports.js:POST /:reportId/export-month) — HCRC +
// LĐTĐ, cùng SourceType 'doanhThuTongHopHcrc', chỉ khác nguồn Chỉ tiêu.
const MONTHLY_EXPORT_REPORT_IDS = ['bc-doanh-thu-tong-hop-hcrc', 'bc-doanh-thu-tong-hop-ldtd'];

// Bản 11.26 (theo yêu cầu người dùng — "chức năng xuất file báo cáo gộp
// nhiều báo cáo thành nhiều sheet") — nút RIÊNG chỉ cho báo cáo "BRG Weekly
// Post" (xem routes/reports.js:POST /:reportId/export-sheets), gộp đủ 5
// "sheet" nội bộ thành 1 file .xlsx, KHÁC "Xuất Excel" (1 sheet đang xem).
// LƯU Ý bản 11.57-11.58 — báo cáo "PMH" từng dùng thử kiến trúc này (1
// báo cáo gộp nhiều sheet) rồi được người dùng yêu cầu ĐỔI LẠI thành
// NHIỀU báo cáo riêng (xem VERSION.md bản 11.58) — danh sách này quay về
// CHỈ 'bc-brg-weekly-post' như bản 11.26 ban đầu.
const MULTI_SHEET_EXPORT_REPORT_IDS = ['bc-brg-weekly-post'];

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
  // exportingMonth (bản 10.87, theo yêu cầu người dùng) — nút RIÊNG "Xuất
  // Excel theo tháng (1 sheet/ngày)", CHỈ hiện cho đúng 1 báo cáo
  // bc-doanh-thu-tong-hop-hcrc (xem điều kiện render bên dưới) — biến
  // trạng thái TÁCH RIÊNG khỏi exportingFormat (nút khác, không khoá nhầm
  // nhau theo đúng quy ước khoá nút của dự án).
  const [exportingMonth, setExportingMonth] = useState(false);
  // exportingSheets (bản 11.26) — nút "Xuất Excel đủ 5 sheet" (BRG Weekly
  // Post), TÁCH RIÊNG khỏi exportingFormat/exportingMonth theo đúng quy
  // ước khoá nút của dự án (xem chú thích exportingMonth ở trên).
  const [exportingSheets, setExportingSheets] = useState(false);
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

  // SỬA LỖI (bản 9.93, theo báo cáo người dùng — "chuyển tab chậm, chọn Mua
  // hàng lại ra Vận hành, chọn Vận hành lại ra Doanh thu" — mạng di động
  // chập chờn làm lộ rõ): race condition — chuyển tab NHANH (bấm tab B
  // ngay sau khi vừa bấm tab A) khi lượt gọi API của tab A CHƯA VỀ kịp,
  // 2 lượt gọi `GET /reports?menuCode=...` cùng chạy song song, không có
  // gì đảm bảo trả về ĐÚNG THỨ TỰ — nếu lượt của tab A (đã rời khỏi) về
  // SAU lượt của tab B (đang xem), `setReports` ghi đè danh sách báo cáo
  // của tab B bằng danh sách của tab A đã cũ, dù `activeCode` đã đúng là B
  // từ lâu — đúng hiện tượng "đi sau 1 bước" người dùng mô tả. `cancelled`
  // (đóng theo ĐÚNG lượt effect đang chạy, qua cleanup function) chặn
  // response TRỄ ghi đè state của tab đã rời đi.
  useEffect(() => {
    if (!activeCode) return;
    let cancelled = false;
    // setError('') (bản 11.36, theo báo cáo người dùng — "Failed to fetch"
    // hiện ở ĐẦU trang dù báo cáo bên dưới vẫn chọn/chạy được bình thường)
    // — TRƯỚC ĐÂY lỗi của 1 lượt gọi API bị lỗi (vd mạng di động chập chờn
    // lúc mới mở app) KHÔNG BAO GIỜ được xoá, dù các lượt gọi SAU đó (đổi
    // tab, chọn báo cáo khác) đã thành công — banner lỗi "dính" mãi trên
    // màn hình, khiến người dùng tưởng NHẦM báo cáo đang xem bị lỗi dù
    // thực ra chỉ là lỗi CŨ của 1 hành động trước đó đã qua.
    setError('');
    api.get(`/reports?menuCode=${encodeURIComponent(activeCode)}`)
      .then(data => { if (!cancelled) setReports(data); })
      .catch(err => { if (!cancelled) setError(err.message); });
    setSelectedId('');
    setDefinition(null);
    setResult(null);
    setVisibleColumnKeys([]);
    return () => { cancelled = true; };
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
    setError(''); // xem chú thích setError('') ở effect [activeCode] phía trên — cùng lỗi, áp dụng y hệt cho lượt chọn báo cáo.
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

  // defaultPreset (bản 11.30, theo yêu cầu người dùng — audit hiệu năng báo
  // cáo, mục B4 "giới hạn mặc định khoảng ngày khi mở báo cáo lần đầu") —
  // filter kiểu 'dateRange' khai `defaultPreset` (vd 'thisMonth', xem
  // lib/dateRange.js:resolveQuickDatePreset()) được TỰ ĐỘNG điền sẵn ngay
  // khi mở báo cáo, thay vì để trống/không giới hạn ngày như trước — CHỈ áp
  // dụng khi field ĐÓ CHƯA có giá trị (không ghi đè bộ lọc đến từ drill-through
  // hay giá trị người dùng đã tự chọn trước đó cho CÙNG lượt mở báo cáo này).
  // Báo cáo KHÔNG khai `defaultPreset` thì KHÔNG đổi gì (vẫn để trống như cũ).
  useEffect(() => {
    if (!definition) return;
    setFilterValues(prev => {
      let changed = false;
      const next = { ...prev };
      (definition.filters || []).forEach(f => {
        if (f.type === 'dateRange' && f.defaultPreset && !next[f.field]) {
          const preset = resolveQuickDatePreset(f.defaultPreset);
          if (preset) { next[f.field] = preset; changed = true; }
        }
      });
      return changed ? next : prev;
    });
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
        `${displayResult?.displayTitle || definition?.title || 'bao-cao'}.${format === 'excel' ? 'xlsx' : 'pdf'}`
      );
    } catch (err) {
      setError(err.message);
    } finally {
      setExportingFormat(null);
    }
  }

  // exportMonth (bản 10.87, theo yêu cầu người dùng — "mỗi sheet 1 ngày
  // trong tháng... ngày 17/11 thì 17 sheet") — dùng ĐÚNG eventDate đang
  // chọn trên bộ lọc ("ngày neo") làm mốc tháng/số sheet, xem
  // routes/reports.js:POST /:reportId/export-month.
  async function exportMonth() {
    setExportingMonth(true);
    try {
      await downloadFile(
        `/reports/${selectedId}/export-month`,
        { eventDate: filterValues.eventDate },
        `${definition?.title || 'bao-cao'}-theo-thang.xlsx`
      );
    } catch (err) {
      setError(err.message);
    } finally {
      setExportingMonth(false);
    }
  }

  // exportSheets (bản 11.26) — gộp đủ 5 "sheet" nội bộ của BRG Weekly Post
  // thành 1 file .xlsx (campaignId đang chọn giữ nguyên, server tự chạy
  // lại với từng `sheet`, xem routes/reports.js:POST /:reportId/export-sheets).
  // Tên file THẬT lấy từ Content-Disposition server trả về
  // ("BRG-Weekly-Post.xlsx") — fallback dưới CHỈ dùng khi thiếu header đó
  // (không xảy ra trong vận hành thường).
  async function exportSheets() {
    setExportingSheets(true);
    try {
      await downloadFile(
        `/reports/${selectedId}/export-sheets`,
        { filters: filterValues },
        `${displayResult?.displayTitle || definition?.title || 'bao-cao'}-du-5-sheet.xlsx`
      );
    } catch (err) {
      setError(err.message);
    } finally {
      setExportingSheets(false);
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
          {/* Tiêu đề + khoảng ngày đang xem (bản 11.35, theo yêu cầu người
              dùng — "MKT report cần tiêu đề rõ"/"Weekly post cần thể hiện
              thời gian ngày nào đến ngày nào..."). displayTitle (vd "BRG
              Weekly Post — <tên chiến dịch>") CHỈ có ở vài báo cáo (BRG
              Weekly Post) — báo cáo khác dùng luôn definition.title như cũ.
              periodLabel (khoảng ngày THẬT đang xem — W/W-1, MTD, kỳ chiến
              dịch...) CHỈ có SAU KHI chạy báo cáo (result), xem các hàm
              run...Report() tương ứng ở rp-server/lib/. */}
          <h2 className="report-title">{displayResult?.displayTitle || definition.title}</h2>
          {displayResult?.periodLabel && <p className="hint report-period-label">{displayResult.periodLabel}</p>}
          <FilterForm reportId={selectedId} filters={definition.filters} values={filterValues} onChange={setFilterValues} onSubmit={runReport} loading={loading} />
          {result && (
            <>
              <div className="export-actions">
                <button type="button" onClick={() => exportAs('excel')} disabled={!!exportingFormat}>{exportingFormat === 'excel' ? 'Đang xuất...' : 'Xuất Excel'}</button>
                <button type="button" onClick={() => exportAs('pdf')} disabled={!!exportingFormat}>{exportingFormat === 'pdf' ? 'Đang xuất...' : 'Xuất PDF'}</button>
                {/* Bản 10.87 — nút RIÊNG chỉ cho 2 báo cáo "Báo cáo tổng hợp
                    doanh thu siêu thị (HCRC)"/"(LĐTĐ)" (Phase 2, theo yêu
                    cầu người dùng; bản 10.90 tách thêm biến thể LĐTĐ) —
                    xuất 1 sheet/ngày cho cả tháng chứa ngày đang chọn ở bộ
                    lọc, KHÁC hẳn "Xuất Excel" (1 sheet) ở trên. */}
                {MONTHLY_EXPORT_REPORT_IDS.includes(selectedId) && (
                  <button type="button" onClick={exportMonth} disabled={exportingMonth}>
                    {exportingMonth ? 'Đang xuất...' : 'Xuất Excel theo tháng (1 sheet/ngày)'}
                  </button>
                )}
                {/* Bản 11.26 — nút RIÊNG chỉ cho "BRG Weekly Post" (gộp 5
                    sheet nội bộ thành 1 file), KHÁC hẳn "Xuất Excel" (1
                    sheet đang xem theo bộ lọc "Chọn sheet" hiện tại). */}
                {MULTI_SHEET_EXPORT_REPORT_IDS.includes(selectedId) && (
                  <button type="button" onClick={exportSheets} disabled={exportingSheets}>
                    {exportingSheets ? 'Đang xuất...' : 'Xuất Excel đủ 5 sheet'}
                  </button>
                )}
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
              {/* ReportSummaryCards (bản 10.21) — CHỈ hiện khi API trả
                  result.summaryCards (4 báo cáo "Doanh thu cuối ngày", xem
                  rp-server/lib/reportCellFormat.js:computeSummaryCards()) —
                  báo cáo khác summaryCards luôn undefined, không hiện gì. */}
              <ReportSummaryCards cards={displayResult?.summaryCards} />
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
