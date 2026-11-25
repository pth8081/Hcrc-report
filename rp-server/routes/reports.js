// routes/reports.js — Danh mục báo cáo (app.ReportCatalog), lọc theo quyền
// của người dùng (app.RoleReportAccess — xem lib/permissions.js), chạy báo
// cáo và xuất file. ĐỊNH NGHĨA báo cáo (bộ lọc/cột) luôn đọc từ
// app.ReportCatalog (CSDL RP). Dữ liệu THẬT có 5 đường, theo SourceType:
//   'directDb'    — Data Warehouse mặc định hoặc nguồn bổ sung
//                    (DataSourceId — xem lib/dataSourcePool.js), query SQL
//                    tại chỗ (lib/reportEngine.js).
//   'apiReport'/
//   'apiRealtime' — gọi API Server CỦA CHÍNH MÌNH qua HTTP
//                    (lib/apiReportClient.js) — dùng khi cần dữ liệu
//                    realtime mà API Server đã có sẵn kết nối, tránh Report
//                    Server tự mở thêm một đường kết nối trực tiếp riêng.
//   'externalApi' — gọi THẲNG một API do ĐỐI TÁC BÊN NGOÀI xây dựng, không
//                    qua API Server (lib/externalReportClient.js).
//   'composite'   — ghép NHIỀU khối nguồn (blocks) thành 1 dòng/thực thể
//                    theo entityCode rồi mới chạy công thức
//                    (lib/compositeReportRunner.js) — dùng khi 1 báo cáo
//                    cần trộn "hôm nay" (directDb/apiRealtime) với "cùng kỳ
//                    năm trước" + "chỉ tiêu" (dwh.SalesTargets), xem README
//                    mục "Báo cáo ghép nhiều nguồn (composite)".
//   'topZeroStock' — báo cáo riêng "Top bán chạy tồn kho = 0" (tự xếp hạng +
//                    lọc ngưỡng tồn kho, không phải SELECT phẳng), xem
//                    lib/topSellingZeroStockRunner.js.
const express = require('express');
const { sql, getPool } = require('../db');
const { requireAuth } = require('../lib/auth');
const { loadDefinition, runDefinition, resolveFactsPool } = require('../lib/reportRunner');
const { PERSISTED_DIMENSION_COLUMNS } = require('../lib/reportEngine');
const { resolveTitleWithDate, resolveExportFileBaseName } = require('../lib/reportTitleDate');
const { exportExcel, exportExcelWithChartSheet, exportMultiSheetExcel } = require('../lib/exportExcel');
const { buildChartImages } = require('../lib/khachHangTuanRunner');
const { SHEET_OPTIONS } = require('../lib/brgWeeklyPostRunner');
const { exportPdf } = require('../lib/exportPdf');
const { buildDoanhThuTongHopHcrcMonthlyWorkbook } = require('../lib/doanhThuTongHopHcrcMonthlyExport');
const { filterColumns, filterGroups, computeSummaryCards } = require('../lib/reportCellFormat');
const { getUserContext } = require('../lib/permissions');
const { loadDiemStkMapping, buildStkIdLookup } = require('../lib/diemStkMapping');
const { listCampaigns: listPromoCampaigns } = require('../lib/brgWeeklyPostCore');
const reportResultCache = require('../lib/reportResultCache');
const { logAction } = require('../lib/auditLog');

const router = express.Router();
router.use(requireAuth);

async function requireReportAccess(req, res, reportId) {
  const context = await getUserContext(req.user.sub);
  if (!context) {
    res.status(401).json({ error: 'Tài khoản không còn hoạt động' });
    return null;
  }
  if (!context.reportIds.has(reportId)) {
    res.status(403).json({ error: 'Bạn không có quyền xem báo cáo này' });
    return null;
  }
  return context;
}

// Danh mục báo cáo THEO ĐÚNG QUYỀN của người dùng, lọc theo TRANG (menuCode —
// vd GET /api/reports?menuCode=reports-mua-hang cho đúng 1 trong 3 trang báo
// cáo) hoặc theo domain nội bộ (Data Warehouse) nếu cần trực tiếp.
router.get('/', async (req, res, next) => {
  try {
    const context = await getUserContext(req.user.sub);
    if (!context) return res.status(401).json({ error: 'Tài khoản không còn hoạt động' });

    const rpPool = await getPool('RP');
    const request = rpPool.request();
    let query = `
      SELECT c.ReportId, c.Title, c.Domain
      FROM app.ReportCatalog c JOIN app.MenuItems m ON c.MenuItemId = m.Id
      WHERE c.IsActive = 1
    `;
    if (req.query.menuCode) {
      request.input('menuCode', sql.VarChar(50), req.query.menuCode);
      query += ' AND m.Code = @menuCode';
    }
    if (req.query.domain) {
      request.input('domain', sql.VarChar(50), req.query.domain);
      query += ' AND c.Domain = @domain';
    }
    query += ' ORDER BY c.Title';

    const result = await request.query(query);
    const allowed = context.isSystemRole
      ? result.recordset
      : result.recordset.filter(r => context.reportIds.has(r.ReportId));
    // Title CÓ THỂ chứa token "{ngayBaoCao}" (xem lib/reportTitleDate.js) —
    // danh sách này chưa có bộ lọc ngày nào được chọn (người dùng mới đang
    // xem danh sách báo cáo để bấm vào), dùng mặc định "hôm nay" (giống hành
    // vi resolveRequestedRange() khi không truyền filterValues) để không lộ
    // token thô ra dropdown chọn báo cáo.
    res.json(allowed.map(r => ({ ...r, Title: resolveTitleWithDate(r.Title, {}, '/') })));
  } catch (err) { next(err); }
});

router.get('/:reportId', async (req, res, next) => {
  try {
    if (!(await requireReportAccess(req, res, req.params.reportId))) return;
    const definition = await loadDefinition(req.params.reportId);
    if (!definition || !definition.isActive) return res.status(404).json({ error: 'Không tìm thấy báo cáo' });
    // CHỈ trả đúng phần rp-user/.../ReportsPage.jsx thật sự dùng để vẽ form
    // lọc (title, filters) — trước đây trả NGUYÊN definition (gộp cả
    // DataSourceId/ApiConnectionId/ExternalConnectionId/blocks composite kèm
    // domain+filters SQL nội bộ/formula thô) cho MỌI người dùng có quyền
    // xem báo cáo đó, lộ chi tiết kiến trúc nguồn dữ liệu không cần cho
    // hiển thị — hữu ích cho kẻ tấn công nếu tài khoản đó bị chiếm.
    // "visualization" (xem hướng_dẫn_báo_cáo.md mục "Biểu đồ") an toàn để lộ
    // thêm — chỉ khai loại biểu đồ/cột nào vẽ trục X, trục giá trị, không
    // đụng gì tới nguồn dữ liệu nội bộ như 3 trường bị chặn ở trên.
    // filters[].optionsSource (domain/tên field JSON nội bộ dùng để dựng
    // danh sách lựa chọn động — xem GET /:reportId/filter-options/:field)
    // cũng là chi tiết kiến trúc nguồn, KHÔNG gửi nguyên cho client — chỉ
    // báo `hasDynamicOptions: true` để rp-user biết cần gọi route đó.
    const filters = (definition.filters || []).map(f => {
      if (!f.optionsSource) return f;
      const { optionsSource, ...rest } = f;
      return { ...rest, hasDynamicOptions: true };
    });
    // title CÓ THỂ chứa token "{ngayBaoCao}" — trang này vẽ TIÊU ĐỀ trước khi
    // người dùng bấm "Chạy báo cáo" (chưa có filters thật), dùng mặc định
    // "hôm nay" cùng lý do ở GET /reports phía trên.
    res.json({ title: resolveTitleWithDate(definition.title, {}, '/'), filters, visualization: definition.visualization || null });
  } catch (err) { next(err); }
});

// cacheFilterOptionsUnlessSuspicious (bản 10.40, SỬA LỖI THẬT phát hiện
// qua báo cáo người dùng — dropdown "Chi nhánh" hiện "<mã> (chưa khai
// tên)" cho TOÀN BỘ mã, dù người dùng xác nhận các mã đó ĐÃ khai tên
// trong "Ánh xạ Điểm - STK_ID") — NGUYÊN NHÂN THẬT: lib/diemStkMapping.js:
// loadDiemStkMapping() có thể trả về Map RỖNG tạm thời (lỗi kết nối
// thoáng qua tới CSDL ETL_DIEM_STK, vd ngay sau khi restart `rp-server`
// trong lúc pool kết nối chưa kịp sẵn sàng — xem chú thích đầu file đó),
// khiến TOÀN BỘ nhãn rơi về "(chưa khai tên)" — nếu CACHE NGUYÊN kết quả
// SAI này với TTL 2 GIỜ (bản 10.35) thì lỗi THOÁNG QUA biến thành lỗi
// "đóng băng" treo tới 2 giờ, dù gọi lại ngay sau đó sẽ ra đúng. Áp dụng
// CHO CẢ 4 nhánh optionsSource cần dịch tên qua "Ánh xạ Điểm - STK_ID"
// (coreZeroStockBranches/nganhHangBranches/storeCatalog/
// translateStkViaDiemStkMapping) — nếu TOÀN BỘ nhãn trả về đều mang hậu
// tố "(chưa khai tên)" (dấu hiệu nghi ngờ diemMapping rỗng do lỗi thoáng
// qua, KHÁC hẳn trường hợp bình thường chỉ VÀI dòng thiếu tên lẫn trong
// nhiều dòng CÓ tên), chỉ cache NGẮN (30 giây) thay vì TTL đầy đủ — tự
// "lành" sau tối đa 30 giây thay vì treo sai tới 2 giờ, không ảnh hưởng gì
// tới trường hợp bình thường (TTL đầy đủ vẫn áp dụng khi có ít nhất 1 nhãn
// hợp lệ xen giữa).
const SUSPICIOUS_EMPTY_RETRY_TTL_MS = 30 * 1000;
function cacheFilterOptionsUnlessSuspicious(cacheKey, options, normalTtlMs) {
  const allUnnamed = options.length > 0 && options.every(o => /\(chưa khai tên\)$/.test(o.label || ''));
  reportResultCache.set(cacheKey, options, allUnnamed ? SUSPICIOUS_EMPTY_RETRY_TTL_MS : normalTtlMs);
}

// Lấy danh sách lựa chọn THẬT cho 1 ô lọc select/multiSelect (yêu cầu:
// "tất cả kiểu chọn và lọc trong report" phải là dropdown searchable +
// multi-select nối dữ liệu thật, không gõ tay) — chỉ áp dụng cho filter có
// khai `optionsSource` (đọc DISTINCT giá trị 1 field trong Dimensions của
// domain đã đồng bộ qua ETL, vd danh sách chi nhánh của báo cáo
// topZeroStock). Filter KHÔNG khai optionsSource (đã có sẵn `options` tĩnh
// trong definition.filters, vd 4 lựa chọn "Khoảng thời gian xếp hạng") thì
// KHÔNG gọi route này — rp-user dùng luôn `options` trả về ở GET
// /:reportId. `optionsSource` (tên domain/field nội bộ) KHÔNG lộ ra
// response — chỉ dùng ở server để dựng câu truy vấn, cùng nguyên tắc che
// giấu kiến trúc nguồn dữ liệu như route GET /:reportId ở trên.
router.get('/:reportId/filter-options/:field', async (req, res, next) => {
  try {
    if (!(await requireReportAccess(req, res, req.params.reportId))) return;
    const definition = await loadDefinition(req.params.reportId);
    if (!definition || !definition.isActive) return res.status(404).json({ error: 'Không tìm thấy báo cáo' });

    const filterDef = (definition.filters || []).find(f => f.field === req.params.field);
    if (!filterDef || !filterDef.optionsSource) return res.status(404).json({ error: 'Bộ lọc không có danh sách lựa chọn động' });

    // Cache TTL DÙNG CHUNG cho mọi nhánh optionsSource bên dưới (bản 9.24 —
    // xem giải thích đầy đủ ở nhánh domain/JSON_VALUE phía dưới). Khai SỚM
    // ở đây để nhánh coreZeroStockBranches (bản 9.54) cũng dùng được, không
    // phải khai riêng.
    // TTL TĂNG 10 phút -> 2 giờ (bản 10.35, theo báo cáo người dùng: mở
    // bộ lọc "Mã hàng"/"Nhà cung cấp" ở báo cáo Mua hàng bị chậm) — nguyên
    // nhân THẬT không đổi so với bản 9.24 (truy vấn JSON_VALUE()+ROW_NUMBER()
    // quét TOÀN BỘ domain, domain `don_dat_hang` giờ CÒN LỚN HƠN nữa sau
    // bản 9.21/9.22 (Lịch sử nhiều năm) + bản 10.24/10.25 (thêm nhánh
    // ON_ORDER/FN_ORDER) + bản 10.31 (thêm chính bộ lọc "Mã hàng" này) —
    // cache 10 phút cũ nghĩa là CHỈ CẦN 10 phút không ai mở dropdown đó là
    // lượt tiếp theo lại phải chạy lại truy vấn chậm từ đầu, CHƯA KỂ cache
    // này là cache TRONG BỘ NHỚ (mất sạch mỗi lần restart `rp-server`, vd
    // sau mỗi lần deploy) — danh sách Mã hàng/NCC/chi nhánh gần như KHÔNG
    // đổi phút-qua-phút hay thậm chí giờ-qua-giờ (chỉ đổi khi phát sinh mã
    // hàng/NCC MỚI lần đầu), nên giữ cache lâu hơn hẳn là an toàn, giảm hẳn
    // tần suất người dùng phải chờ truy vấn chậm. KHÔNG sửa được tận gốc độ
    // chậm của bản thân câu truy vấn ở đây (cần thêm computed+index theo
    // TỪNG field cụ thể trên dwh.ReportFacts — đổi schema bảng dùng chung
    // cho MỌI domain, rủi ro cao hơn, cần đo tải thật với DBA trước khi làm
    // — xem "giá vốn dsmart.md"/VERSION.md bản 10.35 để biết thêm).
    const FILTER_OPTIONS_CACHE_TTL_MS = parseInt(process.env.REPORT_FILTER_OPTIONS_CACHE_TTL_MS, 10) || 2 * 60 * 60 * 1000;
    const filterOptionsCacheKey = ['filter-options', req.params.reportId, req.params.field];

    // optionsSource.coreZeroStockBranches (bản 9.54, theo yêu cầu người
    // dùng) — dropdown "Chi nhánh" của báo cáo Core stock=0 (Mart)/
    // (Minimart) TRƯỚC ĐÂY dùng optionsSource.domain='banhang_sku' — hiện
    // TOÀN BỘ chi nhánh trung tâm, KHÔNG phân biệt loại điểm, khiến người
    // dùng liên tục chọn NHẦM chi nhánh khác loại điểm (vd chọn 1 chi nhánh
    // Mart ở báo cáo Minimart) rồi tưởng báo cáo lỗi. Giờ CHỈ trả đúng tập
    // chi nhánh thuộc ĐÚNG loaiDiem của report này — dùng LẠI NGUYÊN VẸN
    // logic xác định "chain"/LoaiChuoi đã có ở lib/coreZeroStockRunner.js
    // (bản 9.52/9.53: domain doanhthu_chinhanh + LoaiChuoi khai tay ở "Ánh
    // xạ Điểm - STK_ID"), không cần khai domain/valueField riêng ở
    // DefinitionJson nữa (xem seedCoreZeroStockReports.js).
    if (filterDef.optionsSource.coreZeroStockBranches) {
      const cached = reportResultCache.get(filterOptionsCacheKey);
      if (cached) return res.json(cached);
      const { resolveEligibleBranchOptions } = require('../lib/coreZeroStockRunner');
      const options = await resolveEligibleBranchOptions(definition);
      cacheFilterOptionsUnlessSuspicious(filterOptionsCacheKey, options, FILTER_OPTIONS_CACHE_TTL_MS);
      return res.json(options);
    }

    // optionsSource.nganhHangBranches (bản 9.90, theo yêu cầu người dùng —
    // "3 filter theo Total/LFL/NSO: chọn siêu thị") — dropdown "Siêu thị"
    // RIÊNG cho từng khối của 2 báo cáo "Doanh thu theo ngành hàng"/
    // "(LDTD)" (SourceType='nganhHangBrg') — giá trị 'brg'/'lfl'/'nso' khai
    // sẵn trong DefinitionJson (seedNganhHangReports.js), KHÔNG đọc từ
    // request — xem lib/nganhHangBrgRunner.js:resolveNganhHangBranchOptions().
    if (filterDef.optionsSource.nganhHangBranches) {
      const cached = reportResultCache.get(filterOptionsCacheKey);
      if (cached) return res.json(cached);
      const { resolveNganhHangBranchOptions } = require('../lib/nganhHangBrgRunner');
      const options = await resolveNganhHangBranchOptions(definition, filterDef.optionsSource.nganhHangBranches);
      cacheFilterOptionsUnlessSuspicious(filterOptionsCacheKey, options, FILTER_OPTIONS_CACHE_TTL_MS);
      return res.json(options);
    }

    // optionsSource.storeCatalog (bản 9.13, theo yêu cầu người dùng — bộ
    // lọc "Siêu thị" cho báo cáo gộp theo NCC) — KHÁC hẳn nhánh domain/
    // JSON_VALUE bên dưới: domain `don_dat_hang` lưu Dimensions.MaDiem là
    // BU_ID THÔ chưa dịch (dịch sang mã Điểm chuẩn ở tầng JS lúc chạy báo
    // cáo — xem lib/purchaseOrderRunner.js), nên KHÔNG đọc trực tiếp từ
    // dwh.ReportFacts được (sẽ ra mã thô khó hiểu, TenDiem luôn rỗng vì
    // VIEW nguồn để NULL). Đọc thẳng bảng "Ánh xạ Điểm - STK_ID" (CSDL ETL,
    // cùng nguồn buildBuIdLookup() dùng) — LUÔN ra đúng mã Điểm/tên siêu thị
    // chuẩn đang hiển thị trên toàn hệ thống.
    if (filterDef.optionsSource.storeCatalog) {
      const diemMapping = await loadDiemStkMapping();
      // Chưa khai "Tên siêu thị" cho mã Điểm này trong "Ánh xạ Điểm -
      // STK_ID" (bản 10.36, theo báo cáo người dùng — dropdown "Siêu thị"
      // hiện mã Điểm trần thay vì tên, TƯỞNG là đọc sai nguồn nhưng thực
      // ra VẪN đọc đúng bảng ánh xạ, chỉ là dòng đó bị để trống cột "Tên
      // siêu thị") — KHÔNG bịa tên, ghi chú rõ lý do thay vì hiện trần mã
      // Điểm khó hiểu (mirror đúng lib/coreZeroStockRunner.js/
      // lib/nganhHangBrgRunner.js đã sửa cùng kiểu này từ bản 9.92).
      const list = [...diemMapping.entries()]
        .map(([maDiem, info]) => ({ value: maDiem, label: info.tenSieuThi || `${maDiem} (chưa khai tên)` }))
        .sort((a, b) => a.label.localeCompare(b.label, 'vi'));
      return res.json(list);
    }

    // optionsSource.promoCampaigns (bản 11.24, "BRG Weekly Post") — bộ lọc
    // "Chiến dịch khuyến mãi" đọc thẳng dwh.PromoCampaigns (KHÔNG phải
    // domain/Dimensions như nhánh chung bên dưới) — xem lib/brgWeeklyPostCore.js.
    if (filterDef.optionsSource.promoCampaigns) {
      const dwhPool = await getPool('DWH');
      const list = await listPromoCampaigns(dwhPool);
      return res.json(list.map(c => ({
        value: String(c.id),
        label: `${c.name} (${(c.startDate || '').toString().slice(0, 10)} - ${(c.endDate || '').toString().slice(0, 10)})`
      })));
    }

    const { domain, valueField, labelField } = filterDef.optionsSource;
    // valueField/labelField chèn thẳng vào chuỗi SQL (JSON_VALUE path) —
    // dù đến từ DefinitionJson do admin cấu hình (không phải người dùng
    // cuối gõ), vẫn kiểm tra ký tự để nhất quán với nguyên tắc "không cột
    // nào ngoài chữ/số/gạch dưới lọt vào câu SQL" (xem
    // etl/lib/tableSyncEngine.js:assertSafeIdentifier).
    const FIELD_RE = /^[A-Za-z0-9_]+$/;
    if (!FIELD_RE.test(valueField) || (labelField && !FIELD_RE.test(labelField))) {
      return res.status(500).json({ error: 'Cấu hình optionsSource không hợp lệ' });
    }

    // Cache TTL DÀI (bản 9.24, SỬA LỖI dropdown chậm — báo cáo người dùng:
    // "Nhà cung cấp" mở ra phải đợi 1 lúc mới ra danh sách) — truy vấn bên
    // dưới quét JSON_VALUE() + ROW_NUMBER() trên TOÀN BỘ dòng của domain
    // (giờ domain `don_dat_hang` có thêm nhiều năm dữ liệu lịch sử — bản
    // 9.21/9.22 — nên chậm hẳn so với trước). Bản 11.15 đã thêm cột
    // PERSISTED+INDEX cho `MaNCC`/`MaHang` (xem columnExpr() ở trên) — bớt
    // chậm đi NHIỀU cho 2 field này, nhưng field KHÁC (vd TenNCC/TenHang,
    // hoặc domain khác chưa persisted) vẫn đi JSON_VALUE() như cũ, nên vẫn
    // GIỮ cache dài này làm lớp phòng thủ thứ 2, không bỏ. Danh sách NCC/chi
    // nhánh gần như KHÔNG đổi phút-qua-phút (chỉ đổi khi có NCC mới phát
    // sinh giao dịch) nên cache 10 phút là an toàn — khác hẳn cache 30s của
    // /run (kết quả báo cáo cần mới hơn). reportResultCache dùng CHUNG cho
    // mọi người gọi (không phân biệt user) — đúng nguyên tắc đã ghi ở
    // lib/reportResultCache.js (kết quả chỉ phụ thuộc reportId+field, không
    // phụ thuộc danh tính người gọi). FILTER_OPTIONS_CACHE_TTL_MS/
    // filterOptionsCacheKey đã khai sớm hơn ở đầu route (bản 9.54, dùng
    // chung với nhánh coreZeroStockBranches).
    const cached = reportResultCache.get(filterOptionsCacheKey);
    if (cached) return res.json(cached);

    // Dùng cột PERSISTED + INDEX thật (xem dwh/schema.sql mục "Tối ưu lọc
    // theo Dimensions" + PERSISTED_DIMENSION_COLUMNS ở lib/reportEngine.js)
    // thay vì JSON_VALUE(...) khi valueField/labelField trùng tên 1 cột đã
    // persisted — SỬA bản 11.15 (theo báo cáo người dùng, dropdown "Nhà
    // cung cấp"/"Mã hàng" tải chậm) — PERSISTED_DIMENSION_COLUMNS khai theo
    // tên FIELD của filter (camelCase, vd 'maNCC'), còn ở ĐÂY cần so khớp
    // theo TÊN CỘT thật (PascalCase, vd 'MaNCC' — đúng giá trị
    // valueField/labelField trong optionsSource) nên so bằng Object.values(),
    // không phải Object.keys(). Field KHÔNG có cột persisted vẫn rơi về
    // JSON_VALUE(...) như cũ, không đổi hành vi.
    const persistedColumnNames = new Set(Object.values(PERSISTED_DIMENSION_COLUMNS));
    const columnExpr = (f) => (persistedColumnNames.has(f) ? `[${f}]` : `JSON_VALUE(Dimensions, '$.${f}')`);
    const valueExpr = columnExpr(valueField);
    const labelExpr = columnExpr(labelField || valueField);

    const pool = await resolveFactsPool(definition);
    // Nhãn lấy từ dòng SyncedAt MỚI NHẤT của mỗi giá trị (bản 9.14, SỬA LỖI
    // phát hiện qua báo cáo người dùng — dropdown "Nhà cung cấp" hiện tên
    // lỗi font dù VIEW nguồn đã sửa) — TRƯỚC ĐÂY dùng `MAX(label)` (so
    // sánh CHUỖI theo thứ tự chữ cái), nên khi 1 giá trị có NHIỀU dòng lịch
    // sử với nhãn khác nhau (vd đổi tên NCC, hoặc như lần này — VIEW đổi
    // cột nguồn hết lỗi font nhưng dòng LỊCH SỬ cũ vẫn còn trong
    // dwh.ReportFacts tới khi đồng bộ lại), `MAX` có thể chọn NHẦM bản ghi
    // CŨ nếu nó tình cờ sắp xếp chữ cái sau bản mới — không liên quan gì
    // tới thời điểm đồng bộ thật. Dùng ROW_NUMBER() theo SyncedAt DESC để
    // LUÔN lấy đúng nhãn của lần đồng bộ GẦN NHẤT.
    const result = await pool.request()
      .input('domain', sql.VarChar(50), domain)
      .query(`
        ;WITH ranked AS (
          SELECT
            ${valueExpr} AS value,
            ${labelExpr} AS label,
            ROW_NUMBER() OVER (
              PARTITION BY ${valueExpr}
              ORDER BY SyncedAt DESC
            ) AS rn
          FROM dwh.ReportFacts
          WHERE Domain = @domain AND ${valueExpr} IS NOT NULL
        )
        SELECT value, label FROM ranked WHERE rn = 1 ORDER BY label
      `);

    // Danh sách rỗng ở đây có 2 NGUYÊN NHÂN hoàn toàn khác nhau, cùng ra
    // 200 [] cho client — bình thường (domain CHƯA có dữ liệu, vd mới
    // triển khai, ETL chưa chạy lần đầu) và CẤU HÌNH SAI (optionsSource.
    // domain/valueField gõ sai tên, admin không hề biết vì giao diện chỉ
    // thấy ô lọc "trống", giống hệt trường hợp bình thường) — trước đây
    // không phân biệt được, phải soát DB tay mới biết. Chỉ truy vấn THÊM
    // ở nhánh HIẾM (rỗng) này để phân biệt, không tốn thêm round-trip cho
    // đường thường (có kết quả).
    if (!result.recordset.length) {
      const domainCheck = await pool.request().input('domain', sql.VarChar(50), domain)
        .query('SELECT COUNT(*) AS Cnt FROM dwh.ReportFacts WHERE Domain = @domain');
      const domainRowCount = domainCheck.recordset[0].Cnt;
      if (domainRowCount === 0) {
        console.warn(`⚠️  [filter-options] báo cáo "${req.params.reportId}" field "${req.params.field}" — optionsSource.domain "${domain}" KHÔNG có dòng nào trong dwh.ReportFacts (domain gõ sai trong DefinitionJson, hoặc ETL chưa từng đồng bộ domain này) — trả danh sách RỖNG cho client, DỄ NHẦM với "domain có thật nhưng chưa có dữ liệu". Kiểm tra lại optionsSource.domain.`);
      } else {
        console.warn(`⚠️  [filter-options] báo cáo "${req.params.reportId}" field "${req.params.field}" — domain "${domain}" CÓ dữ liệu (${domainRowCount} dòng) nhưng KHÔNG dòng nào có "${valueField}" khác NULL trong Dimensions — optionsSource.valueField có thể gõ sai tên cột. Trả danh sách RỖNG cho client.`);
      }
    }

    // optionsSource.translateStkViaDiemStkMapping (bản 10.39, theo báo cáo
    // người dùng — bộ lọc "Chi nhánh" của "Báo cáo nhập hàng theo ngành
    // hàng" hiện thẳng STK_ID trần làm NHÃN, vì khai `valueField: 'STK_ID'`
    // mà KHÔNG khai `labelField` — domain `nhaphang_nganhhang` cũng KHÔNG
    // có cột tên chi nhánh nào để JOIN (VIEW nguồn không JOIN STOCK, xem
    // "báo cáo doanh thu-nhập hàng theo ngành hàng.md" mục 2). Đúng quy
    // ước đã thêm ở CLAUDE.md (bản 10.37) — Siêu thị PHẢI lấy tên từ "Ánh
    // xạ Điểm - STK_ID", KHÔNG JOIN thẳng STOCK vào VIEW (tên kho có thể
    // đổi qua các kỳ, chỉ bảng ánh xạ biết tên CHUẨN hiện tại) — dịch
    // NHÃN qua `buildStkIdLookup()` (MIRROR đúng cách
    // lib/coreZeroStockRunner.js/lib/nganhHangBrgRunner.js đã làm), GIỮ
    // NGUYÊN `value` = STK_ID thô (báo cáo lọc theo đúng STK_ID này ở
    // tầng dưới, KHÔNG dịch qua Mã Điểm như domain đơn đặt hàng).
    let options = result.recordset;
    if (filterDef.optionsSource.translateStkViaDiemStkMapping) {
      const diemMapping = await loadDiemStkMapping();
      const stkLookup = buildStkIdLookup(diemMapping);
      // SỬA bản 10.52 (báo cáo người dùng — dropdown "Siêu thị" của báo cáo
      // "Doanh thu theo ngành hàng - theo mã hàng" hiện "(chưa khai tên)"
      // cho MỌI mã, dù "Ánh xạ Điểm - STK_ID" đã khai đủ) — `r.value` đọc
      // qua JSON_VALUE() có thể mang khoảng trắng đệm ở cuối (STK_ID trong
      // DSMART thường là CHAR cố định độ dài) nên KHÔNG khớp tuyệt đối với
      // key đã `.trim()` sẵn của `stkLookup` (`buildStkIdLookup()` dựng từ
      // `parseStkList()` — luôn trim). CÙNG lỗi đã vá ở
      // lib/nganhHangBrgRunner.js:resolveNganhHangBranchOptions() (dòng
      // `dimensions.STK_ID.trim()`) nhưng CHƯA áp dụng ở nhánh này — so
      // sánh bằng (`=`) trong SQL Server không phân biệt khoảng trắng đệm
      // cuối chuỗi, nên trim ở đây KHÔNG ảnh hưởng tới việc lọc báo cáo
      // sau khi chọn.
      const trim = (v) => (typeof v === 'string' ? v.trim() : v);
      options = options
        .map((r) => {
          const value = trim(r.value);
          return { value, label: stkLookup.get(value)?.tenSieuThi || `${value} (chưa khai tên)` };
        })
        .sort((a, b) => a.label.localeCompare(b.label, 'vi'));
    }

    // optionsSource.showCodeInLabel (bản 11.15, theo yêu cầu người dùng —
    // dropdown "Nhà cung cấp"/"Mã hàng" ở báo cáo Mua hàng chỉ hiện TÊN,
    // không thấy MÃ đâu để biết đang chọn đúng NCC/mã hàng nào, tên dài dễ
    // trùng khó phân biệt) — ghép "<Mã> — <Tên>" làm label hiển thị, CHỈ
    // khi labelField KHÁC valueField (field có labelField riêng mới có ý
    // nghĩa ghép thêm mã — field tự nó đã LÀ mã như "trạng thái" thì khai
    // cờ này cũng vô hại, value===label nên if dưới tự bỏ qua). KHÔNG đổi
    // `value` gửi lên khi lọc — chỉ đổi CHỮ hiển thị trong dropdown.
    if (filterDef.optionsSource.showCodeInLabel) {
      options = options.map((r) => (
        r.value != null && r.label != null && String(r.value) !== String(r.label)
          ? { value: r.value, label: `${r.value} — ${r.label}` }
          : r
      ));
    }

    cacheFilterOptionsUnlessSuspicious(filterOptionsCacheKey, options, FILTER_OPTIONS_CACHE_TTL_MS);
    res.json(options);
  } catch (err) { next(err); }
});

router.post('/:reportId/run', async (req, res, next) => {
  try {
    const context = await requireReportAccess(req, res, req.params.reportId);
    if (!context) return;
    const definition = await loadDefinition(req.params.reportId);
    if (!definition || !definition.isActive) return res.status(404).json({ error: 'Không tìm thấy báo cáo' });

    // __storeScope (bản 8.51) — SERVER tự gắn theo app.UserStoreAccess của
    // người đang gọi, GHI ĐÈ bất kỳ giá trị nào client lỡ gửi lên ở đúng
    // field này (spread TRƯỚC, gán SAU — không tin client tự khai phạm vi
    // dữ liệu của chính họ) — xem lib/compositeReportRunner.js.
    const filters = { ...(req.body?.filters || {}), __storeScope: context.storeScope };
    // Chặn trên (khớp đúng api-server/routes/v1/reports.js) — trước đây
    // pageSize lấy nguyên từ req.body không giới hạn, gọi {"pageSize":5000000}
    // là SQL Server cố trả cả triệu dòng vào 1 response JSON, vượt xa mức
    // 5000 dòng cố định của /export (bypass ngầm giới hạn xuất file).
    const page = Math.max(1, parseInt(req.body?.page, 10) || 1);
    const pageSize = Math.min(Math.max(1, parseInt(req.body?.pageSize, 10) || 200), 1000);

    // Cache TTL ngắn (lib/reportResultCache.js) — nhiều người dùng/dashboard
    // hay gọi lại CÙNG báo cáo + CÙNG bộ lọc trong vài giây liên tiếp, không
    // cần chạy lại nguyên truy vấn dwh.ReportFacts mỗi lần. KHÔNG dùng cho
    // /export hay jobs/reportEmailScheduler.js — chỉ đường xem tương tác này.
    const cacheKey = [req.params.reportId, filters, page, pageSize];
    let result = reportResultCache.get(cacheKey);
    if (!result) {
      // capForDisplay (bản 9.23) — CHỈ gắn cờ này ở ĐÚNG đây (xem trên web,
      // pageSize nhỏ do CHÍNH ReportsPage.jsx/người dùng quyết định) —
      // KHÔNG gắn cho /export, jobs/reportEmailScheduler.js,
      // lib/anomalyAlertRunner.js, routes/dashboards.js (đều cần ĐỦ dữ
      // liệu, không được cắt bớt). Hiện chỉ lib/purchaseOrderRunner.js đọc
      // cờ này (6 báo cáo nhóm "Mua hàng" — xem chú thích ở đó); các loại
      // báo cáo khác (runReport/runApiReport/...) bỏ qua field lạ này,
      // không ảnh hưởng gì.
      result = await runDefinition(definition, filters, { page, pageSize, capForDisplay: true });
      reportResultCache.set(cacheKey, result);
    }
    // summaryCards (bản 10.21) — tính LẠI mỗi lần trả response (rẻ, chỉ đọc
    // mảng rows đã có sẵn, không truy vấn gì thêm) thay vì lưu trong cache ở
    // trên — tránh phụ thuộc hành vi "mutate object đã cache" khó theo dõi.
    // CHỈ gắn khi definition có khai (4 báo cáo Doanh thu cuối ngày, xem
    // scripts/seedLdtdHcrcReports.js) — báo cáo khác result.summaryCards
    // luôn undefined, rp-user không vẽ khối thẻ.
    if (definition.summaryCards) {
      result = { ...result, summaryCards: computeSummaryCards(definition, result.rows) };
    }
    res.json(result);
  } catch (err) { next(err); }
});

router.post('/:reportId/export', async (req, res, next) => {
  try {
    const context = await requireReportAccess(req, res, req.params.reportId);
    if (!context) return;
    const definition = await loadDefinition(req.params.reportId);
    if (!definition || !definition.isActive) return res.status(404).json({ error: 'Không tìm thấy báo cáo' });

    // __storeScope (bản 8.51) — xem chú thích ở POST /:reportId/run phía trên.
    const { format = 'excel' } = req.body || {};
    const filters = { ...(req.body?.filters || {}), __storeScope: context.storeScope };
    const {
      columns: rawColumns, rows: projected,
      columnGroups: runtimeColumnGroups, columnSuperGroups, standaloneColumnColors: runtimeStandaloneColumnColors
    } = await runDefinition(definition, filters, { page: 1, pageSize: 5000 });
    // visibleColumnKeys (bản 8.97, TUỲ CHỌN — theo yêu cầu người dùng: "cho
    // phép mình chọn các trường ẩn đi khi xem báo cáo trên web hoặc xuất
    // excel/pdf") — người dùng chọn Ở TRANG XEM báo cáo (rp-user/.../
    // ReportsPage.jsx), gửi kèm lúc bấm "Xuất Excel"/"Xuất PDF" để file xuất
    // ra ĐÚNG những cột đang xem trên web, không phải luôn đủ cột như trước.
    // Rỗng/không gửi = xuất ĐỦ cột (hành vi cũ, không đổi báo cáo nào chưa
    // dùng tính năng này). Dùng CHUNG filterColumns/filterGroups với
    // lib/emailBodyRenderer.js (lib/reportCellFormat.js) — giữ nguyên thứ tự
    // cột gốc + tính lại colSpan nhóm màu đúng cách y hệt 3 nơi xuất khác.
    const visibleColumnKeys = Array.isArray(req.body?.visibleColumnKeys) ? req.body.visibleColumnKeys : null;
    const columns = visibleColumnKeys ? filterColumns(rawColumns, visibleColumnKeys) : rawColumns;
    // Dùng columnGroups TRẢ VỀ TỪ runDefinition() (runtimeColumnGroups), KHÔNG
    // phải definition.columnGroups tĩnh (lỗi THẬT, bản 9.73) — MỌI runner
    // KHÁC (directDb/composite/...) luôn trả CHÍNH XÁC `definition.columnGroups`
    // (xem lib/reportRunner.js/lib/compositeReportRunner.js, echo nguyên
    // văn), nên đổi sang đọc runtimeColumnGroups AN TOÀN, không đổi hành vi
    // báo cáo nào khác — NHƯNG lib/nganhHangBrgRunner.js (SourceType=
    // 'nganhHangBrg') tính columnGroups/columnSuperGroups ĐỘNG lúc chạy
    // (không lưu tĩnh trong DefinitionJson, vì phụ thuộc dữ liệu thật), nên
    // trước đây dùng `definition.columnGroups` ở đây LUÔN `undefined` cho 2
    // báo cáo "Doanh thu theo ngành hàng"/"(LDTD)" — Excel/PDF xuất ra MẤT
    // HẲN tiêu đề nhóm màu/3 khối BRG-LFL-NSO dù xem trên web (đi qua
    // POST /:reportId/run, trả nguyên `result` không qua nhánh này) vẫn ĐÚNG.
    const effectiveColumnGroups = runtimeColumnGroups || definition.columnGroups;
    const columnGroups = visibleColumnKeys && effectiveColumnGroups ? filterGroups(effectiveColumnGroups, columns) : effectiveColumnGroups;
    const standaloneColumnColors = runtimeStandaloneColumnColors || definition.standaloneColumnColors;
    // exportTitle (TUỲ CHỌN) — tiêu đề HIỂN THỊ TRONG TÀI LIỆU, tách riêng
    // khỏi definition.title (tên trong danh mục báo cáo, tĩnh) và
    // definition.exportFileCode (tên file, mã cố định) — báo cáo không
    // khai exportTitle thì rơi về dùng definition.title như trước (không
    // đổi hành vi cũ cho các báo cáo khác), xem scripts/seedLdtdHcrcReports.js.
    const displayTitle = resolveTitleWithDate(definition.exportTitle || definition.title, filters, '/');
    const fallbackFileTitle = resolveTitleWithDate(definition.exportTitle || definition.title, filters, '-');
    const fileTitle = resolveExportFileBaseName(definition.exportFileCode, filters, fallbackFileTitle);
    const exportDefinition = { ...definition, columns, columnGroups, columnSuperGroups, standaloneColumnColors, title: displayTitle };

    if (format === 'excel') {
      // sourceType 'khachHangTuan' (bản 11.26, theo yêu cầu người dùng —
      // file mẫu gốc có 1 sheet "Biểu đồ" RIÊNG) — thêm sheet ảnh biểu đồ
      // NGAY SAU sheet dữ liệu, xem lib/khachHangTuanRunner.js:buildChartImages()
      // + lib/exportExcel.js:exportExcelWithChartSheet(). Báo cáo khác
      // KHÔNG đổi hành vi (vẫn exportExcel() như cũ).
      const buffer = definition.sourceType === 'khachHangTuan'
        ? await exportExcelWithChartSheet(exportDefinition, projected, buildChartImages(projected))
        : await exportExcel(exportDefinition, projected);
      await logAction(req, { module: 'Báo cáo', actionType: 'XUAT_BAO_CAO', targetObject: req.params.reportId, description: `Xuất Excel báo cáo "${displayTitle}" (${projected.length} dòng)` });
      // res.attachment() (Express, dùng gói content-disposition bên trong) tự
      // mã hoá đúng chuẩn RFC 5987 (filename* + fallback ASCII) khi tên báo
      // cáo có ký tự tiếng Việt NGOÀI Latin-1 (vd "đ", "ậ" trong "Lãnh đạo Tập
      // đoàn") — trước đây gán thẳng chuỗi vào header khiến Node ném
      // TypeError [ERR_INVALID_CHAR], 500 lỗi máy chủ lúc xuất (xem VERSION.md).
      res.attachment(`${fileTitle}.xlsx`);
      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      return res.send(buffer);
    }
    if (format === 'pdf') {
      const buffer = await exportPdf(exportDefinition, projected);
      await logAction(req, { module: 'Báo cáo', actionType: 'XUAT_BAO_CAO', targetObject: req.params.reportId, description: `Xuất PDF báo cáo "${displayTitle}" (${projected.length} dòng)` });
      res.attachment(`${fileTitle}.pdf`);
      res.setHeader('Content-Type', 'application/pdf');
      return res.send(buffer);
    }
    return res.status(400).json({ error: `Định dạng xuất "${format}" chưa được hỗ trợ` });
  } catch (err) { next(err); }
});

// Bản 10.87 (theo yêu cầu người dùng, Phase 2 báo cáo "Báo cáo tổng hợp
// doanh thu siêu thị hàng ngày") — xuất Excel RIÊNG 1 SHEET/NGÀY cho cả
// tháng chứa "ngày neo" (eventDate) — KHÁC HẲN /export ở trên (1 sheet duy
// nhất, đúng filter đang xem) — chỉ báo cáo bc-doanh-thu-tong-hop-hcrc
// dùng route này, xem lib/doanhThuTongHopHcrcMonthlyExport.js.
router.post('/:reportId/export-month', async (req, res, next) => {
  try {
    const context = await requireReportAccess(req, res, req.params.reportId);
    if (!context) return;
    const definition = await loadDefinition(req.params.reportId);
    // Bản 10.90 — kiểm tra theo ĐÚNG SourceType (KHÔNG hardcode 1 reportId
    // cố định nữa) — từ bản này có 2 báo cáo CÙNG SourceType
    // 'doanhThuTongHopHcrc' (bc-doanh-thu-tong-hop-hcrc/-ldtd, chỉ khác
    // definition.targetDomain), cả 2 đều dùng route xuất theo tháng này.
    if (!definition || !definition.isActive || definition.sourceType !== 'doanhThuTongHopHcrc') {
      return res.status(400).json({ error: 'Báo cáo này không hỗ trợ xuất theo tháng (1 sheet/ngày)' });
    }
    const { eventDate } = req.body || {};
    const storeScope = Array.isArray(context.storeScope) ? new Set(context.storeScope) : null;
    const buffer = await buildDoanhThuTongHopHcrcMonthlyWorkbook({
      anchorDate: eventDate, storeScope,
      targetDomain: definition.targetDomain,
      titlePrefix: definition.title
    });
    const fileLabel = (eventDate || '').slice(0, 7) || 'thang-nay';
    await logAction(req, {
      module: 'Báo cáo', actionType: 'XUAT_BAO_CAO', targetObject: req.params.reportId,
      description: `Xuất Excel theo tháng (1 sheet/ngày) báo cáo "${definition.title}" tới ngày ${eventDate || '(hôm nay)'}`
    });
    res.attachment(`${definition.title}-${fileLabel}.xlsx`);
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    return res.send(buffer);
  } catch (err) { next(err); }
});

// Bản 11.26 (theo yêu cầu người dùng — "Sao bạn không gộp vào một file
// Excel và nhiều sheet? ... chức năng xuất file báo cáo gộp nhiều báo cáo
// thành nhiều sheet") — CHỈ báo cáo "BRG Weekly Post" (SourceType=
// 'brgWeeklyPost', xem lib/brgWeeklyPostRunner.js) dùng route này: chạy
// ĐỦ CẢ 5 "sheet" nội bộ (campaignId giữ nguyên, chỉ đổi `sheet`) rồi gộp
// thành 1 file .xlsx nhiều sheet (lib/exportExcel.js:exportMultiSheetExcel,
// ĐANG dùng cho "Xuất Excel" ở Dashboard — tái dùng nguyên, không viết lại)
// — mirror đúng cấu trúc nhiều sheet trong CÙNG 1 file của file mẫu Excel
// gốc "BRG_Weekly_Post_T6K1_BC1.xlsx". KHÁC HẲN /export ở trên (chỉ xuất
// ĐÚNG 1 sheet đang xem theo bộ lọc `sheet` hiện tại).
router.post('/:reportId/export-sheets', async (req, res, next) => {
  try {
    const context = await requireReportAccess(req, res, req.params.reportId);
    if (!context) return;
    const definition = await loadDefinition(req.params.reportId);
    if (!definition || !definition.isActive || definition.sourceType !== 'brgWeeklyPost') {
      return res.status(400).json({ error: 'Báo cáo này không hỗ trợ xuất gộp nhiều sheet' });
    }
    const baseFilters = { ...(req.body?.filters || {}), __storeScope: context.storeScope };

    const sheets = [];
    for (const opt of SHEET_OPTIONS) {
      const filters = { ...baseFilters, sheet: opt.value };
      const { columns, rows, columnGroups, columnSuperGroups, standaloneColumnColors } =
        await runDefinition(definition, filters, { page: 1, pageSize: 5000 });
      sheets.push({
        definition: { ...definition, columns, columnGroups, columnSuperGroups, standaloneColumnColors, title: opt.label },
        rows,
        sheetName: opt.label
      });
    }
    const buffer = await exportMultiSheetExcel(sheets);
    const campaignLabel = baseFilters.campaignId ? `-chien-dich-${baseFilters.campaignId}` : '';
    await logAction(req, {
      module: 'Báo cáo', actionType: 'XUAT_BAO_CAO', targetObject: req.params.reportId,
      description: `Xuất Excel gộp ${sheets.length} sheet báo cáo "${definition.title}"`
    });
    res.attachment(`BRG-Weekly-Post${campaignLabel}.xlsx`);
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    return res.send(buffer);
  } catch (err) { next(err); }
});

module.exports = router;
