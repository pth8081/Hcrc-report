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
const { resolveTitleWithDate, resolveExportFileBaseName } = require('../lib/reportTitleDate');
const { exportExcel } = require('../lib/exportExcel');
const { exportPdf } = require('../lib/exportPdf');
const { filterColumns, filterGroups } = require('../lib/reportCellFormat');
const { getUserContext } = require('../lib/permissions');
const { loadDiemStkMapping } = require('../lib/diemStkMapping');
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
    const FILTER_OPTIONS_CACHE_TTL_MS = parseInt(process.env.REPORT_FILTER_OPTIONS_CACHE_TTL_MS, 10) || 10 * 60 * 1000;
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
      reportResultCache.set(filterOptionsCacheKey, options, FILTER_OPTIONS_CACHE_TTL_MS);
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
      const list = [...diemMapping.entries()]
        .map(([maDiem, info]) => ({ value: maDiem, label: info.tenSieuThi || maDiem }))
        .sort((a, b) => a.label.localeCompare(b.label, 'vi'));
      return res.json(list);
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
    // 9.21/9.22 — nên chậm hẳn so với trước). Danh sách NCC/chi nhánh gần
    // như KHÔNG đổi phút-qua-phút (chỉ đổi khi có NCC mới phát sinh giao
    // dịch) nên cache 10 phút là an toàn — khác hẳn cache 30s của /run (kết
    // quả báo cáo cần mới hơn). reportResultCache dùng CHUNG cho mọi người
    // gọi (không phân biệt user) — đúng nguyên tắc đã ghi ở
    // lib/reportResultCache.js (kết quả chỉ phụ thuộc reportId+field, không
    // phụ thuộc danh tính người gọi). FILTER_OPTIONS_CACHE_TTL_MS/
    // filterOptionsCacheKey đã khai sớm hơn ở đầu route (bản 9.54, dùng
    // chung với nhánh coreZeroStockBranches).
    const cached = reportResultCache.get(filterOptionsCacheKey);
    if (cached) return res.json(cached);

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
            JSON_VALUE(Dimensions, '$.${valueField}') AS value,
            JSON_VALUE(Dimensions, '$.${labelField || valueField}') AS label,
            ROW_NUMBER() OVER (
              PARTITION BY JSON_VALUE(Dimensions, '$.${valueField}')
              ORDER BY SyncedAt DESC
            ) AS rn
          FROM dwh.ReportFacts
          WHERE Domain = @domain AND JSON_VALUE(Dimensions, '$.${valueField}') IS NOT NULL
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

    reportResultCache.set(filterOptionsCacheKey, result.recordset, FILTER_OPTIONS_CACHE_TTL_MS);
    res.json(result.recordset);
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
      const buffer = await exportExcel(exportDefinition, projected);
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

module.exports = router;
