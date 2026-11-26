// lib/reportRunner.js — Tải định nghĩa báo cáo (app.ReportCatalog) và chạy
// đúng SourceType (directDb/apiReport/apiRealtime/externalApi), tách ra từ
// routes/reports.js để dùng chung với jobs/reportEmailScheduler.js (gửi báo
// cáo qua email theo lịch cũng cần chạy đúng logic này, không phải chỉ khi
// có request HTTP từ rp-user).
const { sql, getPool } = require('../db');
const { getPoolForDataSource } = require('./dataSourcePool');
const { runReport, projectColumns, describeColumns } = require('./reportEngine');
const { runApiReport } = require('./apiReportClient');
const { runExternalReport } = require('./externalReportClient');
const { runCompositeReport } = require('./compositeReportRunner');
const { runTopZeroStockReport } = require('./topSellingZeroStockRunner');
const { runCoreZeroStockReport } = require('./coreZeroStockRunner');
const { runStockThresholdReport } = require('./stockThresholdRunner');
const { runStockAlertReport } = require('./stockAlertRunner');
const { runPurchaseOrderReport } = require('./purchaseOrderRunner');
const { runNganhHangBrgReport } = require('./nganhHangBrgRunner');
const { runDoanhThuTongHopHcrcReport } = require('./doanhThuTongHopHcrcRunner');
const { runKinhDoanhTuanReport } = require('./kinhDoanhTuanRunner');
const { runKhachHangTuanReport } = require('./khachHangTuanRunner');
const { runBrgPostByItemsReport } = require('./brgPostByItemsRunner');
const { runBrgPostByStoreReport } = require('./brgPostByStoreRunner');
const { runBrgPostRankingsReport } = require('./brgPostRankingsRunner');
const { runBrgPostRecapReport } = require('./brgPostRecapRunner');
const { runBrgPostDetailReport } = require('./brgPostDetailRunner');
const { runBrgWeeklyPostReport } = require('./brgWeeklyPostRunner');
const { runDioNganhHangReport } = require('./dioNganhHangRunner');
const { runDoanhThuMtdKeHoachReport } = require('./doanhThuMtdKeHoachRunner');
const { runPhuHangCoreChiTietReport, runPhuHangCoreRecapReport } = require('./phuHangCoreRunner');
const { assignSttIfPresent } = require('./reportCellFormat');

async function loadDefinition(reportId) {
  const rpPool = await getPool('RP');
  const result = await rpPool.request()
    .input('reportId', sql.VarChar(80), reportId)
    .query(`
      SELECT Title, Domain, DataSourceId, SourceType, ApiConnectionId, ApiTarget, ExternalConnectionId, DefinitionJson, IsActive
      FROM app.ReportCatalog WHERE ReportId = @reportId
    `);
  if (!result.recordset.length) return null;
  const row = result.recordset[0];
  return {
    ...JSON.parse(row.DefinitionJson),
    dataSourceId: row.DataSourceId,
    sourceType: row.SourceType,
    apiConnectionId: row.ApiConnectionId,
    apiTarget: row.ApiTarget,
    externalConnectionId: row.ExternalConnectionId,
    isActive: row.IsActive
  };
}

async function resolveFactsPool(definition) {
  if (definition.dataSourceId) return getPoolForDataSource(definition.dataSourceId);
  return getPool('DWH');
}

// Trả {columns, rows} — columns LUÔN [{key,label}] (xem
// reportEngine.js:describeColumns()), dù cột nào là field thô hay công thức
// tính toán, dù báo cáo chạy trực tiếp, qua API Server, hay qua API đối tác,
// để bên gọi (rp-user, hoặc jobs/reportEmailScheduler.js) không cần biết
// khác biệt đó. 'directDb' tự chiếu cột + tính công thức tại chỗ;
// 'apiReport'/'apiRealtime' forward NGUYÊN response từ API Server (đã chiếu
// cột VÀ tính công thức ở phía đó); 'externalApi' tự chiếu cột + tính công
// thức tại chỗ (giống 'directDb') nhưng đọc từ JSON đối tác thay vì SQL
// Server — KHÔNG áp lại definition.columns của rp-server lên response đã
// chiếu sẵn từ nơi khác, tránh tính 2 lần với 2 định nghĩa khác nhau nếu 2
// bên có khai báo cột không khớp. 'composite' ghép NHIỀU khối nguồn (mỗi
// khối tự directDb/apiReport/apiRealtime, hoặc đọc dwh.SalesTargets) thành
// 1 dòng/thực thể theo entityCode RỒI mới tự chiếu cột + tính công thức tại
// chỗ (xem lib/compositeReportRunner.js) — KHÔNG áp dụng pagination
// (composite luôn trả toàn bộ dòng, cần đủ để tính "Tổng cộng" ở tầng gọi).
// 'topZeroStock' tự xếp hạng top N mặt hàng bán chạy mỗi chi nhánh rồi lọc
// tồn kho <= ngưỡng, cột hiển thị CỐ ĐỊNH (không dùng definition.columns) —
// xem lib/topSellingZeroStockRunner.js. 'coreZeroStock' KHÔNG tự xếp hạng —
// dùng danh sách mặt hàng "Core" cố định (etl.CoreItemList) theo LoaiĐiểm
// (MART/MINIMART), cùng công thức tồn=0, cột hiển thị CỐ ĐỊNH — xem
// lib/coreZeroStockRunner.js. 'stockThreshold' (bản 8.68) — người xem TỰ
// CHỌN chiều lọc (tồn dưới/trên) VÀ mức ngưỡng ngay trên bộ lọc, áp dụng
// MỌI mặt hàng đang có dữ liệu (không cần danh sách cố định) — xem
// lib/stockThresholdRunner.js. 'stockAlert' (bản 8.68) — đối chiếu với
// NGƯỠNG RIÊNG cho từng cặp (Mã hàng, Siêu thị) do admin tự khai/upload
// (etl.StockAlertThresholds) — xem lib/stockAlertRunner.js. 'purchaseOrder'
// (bản 8.75, SỬA nguồn dữ liệu ở bản 8.92) — domain `don_dat_hang`
// (nguồn STRANS, TRANS_CODE 133=đặt/333=nhập, MỖI LOẠI 1 DÒNG RIÊNG), tự
// ánh xạ mã BU_ID thô sang mã Điểm chuẩn qua "Ánh xạ Điểm - STK_ID" TRƯỚC
// khi chiếu cột, gộp SUM theo REF (mã đơn gốc) cho báo cáo so sánh — xem
// lib/purchaseOrderRunner.js. 'nganhHangBrg' (bản 9.63, theo yêu cầu người
// dùng, theo đúng mẫu Excel BRGMART) — CHIA 3 khối lặp lại "Toàn hệ thống
// BRG"/"LFL"/"NSO" (siêu thị mới mở, khai qua etl-admin "Siêu thị NSO")
// cho cùng 12 ngành hàng, thêm Lãi gộp + "Giá trị hàng hỏng hủy"/"Doanh
// thu cuối" (CHỈ ở khối BRG) — xem lib/nganhHangBrgRunner.js.
async function runDefinition(definition, filterValues, pagination) {
  if (definition.sourceType === 'externalApi') {
    return runExternalReport(definition, filterValues);
  }
  if (definition.sourceType === 'composite') {
    return runCompositeReport(definition, filterValues);
  }
  if (definition.sourceType === 'topZeroStock') {
    return runTopZeroStockReport(definition, filterValues, pagination);
  }
  if (definition.sourceType === 'coreZeroStock') {
    return runCoreZeroStockReport(definition, filterValues);
  }
  if (definition.sourceType === 'stockThreshold') {
    return runStockThresholdReport(definition, filterValues, pagination);
  }
  if (definition.sourceType === 'stockAlert') {
    return runStockAlertReport(definition, filterValues);
  }
  if (definition.sourceType === 'purchaseOrder') {
    return runPurchaseOrderReport(definition, filterValues, pagination);
  }
  if (definition.sourceType === 'nganhHangBrg') {
    return runNganhHangBrgReport(definition, filterValues);
  }
  // 'doanhThuTongHopHcrc' (bản 10.82, theo yêu cầu người dùng — "Báo cáo
  // tổng hợp doanh thu siêu thị hàng ngày") — MỖI DÒNG/mã Điểm, 3 khối
  // Ngày/Tháng/Năm tính SONG SONG từ 1 ngày neo (filterValues.eventDate,
  // kiểu 'date' đơn — KHÁC 'dateRange' các composite khác) + Chỉ tiêu +
  // số nhân sự (app.UserStoreAccess) — xem lib/doanhThuTongHopHcrcRunner.js.
  if (definition.sourceType === 'doanhThuTongHopHcrc') {
    return runDoanhThuTongHopHcrcReport(definition, filterValues);
  }
  // 'kinhDoanhTuan' (bản 11.24, theo yêu cầu đội MKT) — "Báo cáo kinh doanh
  // theo tuần": MỖI DÒNG/mã Điểm, so sánh Tuần này/Tuần trước/Tỷ lệ +
  // Tháng luỹ kế/Cùng kỳ năm trước/Tỷ lệ, cho Doanh số/Số Bill/AOV x
  // Total/Qua thẻ — xem lib/kinhDoanhTuanRunner.js.
  if (definition.sourceType === 'kinhDoanhTuan') {
    return runKinhDoanhTuanReport(definition, filterValues);
  }
  // 'khachHangTuan' (bản 11.24, theo yêu cầu đội MKT) — "Báo cáo khách
  // hàng theo tuần": MỖI DÒNG/mã Điểm, so sánh Tuần này/Tuần trước/LFL
  // (trung bình tuần cùng kỳ năm trước) cho Bill/AOV/Doanh số x
  // Total/Qua thẻ — xem lib/khachHangTuanRunner.js.
  if (definition.sourceType === 'khachHangTuan') {
    return runKhachHangTuanReport(definition, filterValues);
  }
  // 'brgPostByItems' (bản 11.24, "BRG Weekly Post" — Báo cáo 3 MKT, sheet
  // "By items") — MỖI DÒNG/SKU của 1 chiến dịch khuyến mãi (chọn qua bộ
  // lọc campaignId), chỉ tiêu cả chuỗi + thực tế — xem
  // lib/brgPostByItemsRunner.js + lib/brgWeeklyPostCore.js.
  if (definition.sourceType === 'brgPostByItems') {
    return runBrgPostByItemsReport(definition, filterValues);
  }
  // 'brgPostByStore' (bản 11.24, "BRG Weekly Post", sheet "By Store") —
  // MỖI DÒNG/mã Điểm, tổng thực tế + chỉ tiêu ĐÃ PHÂN BỔ theo trọng số —
  // xem lib/brgPostByStoreRunner.js.
  if (definition.sourceType === 'brgPostByStore') {
    return runBrgPostByStoreReport(definition, filterValues);
  }
  // 'brgPostRankings' (bản 11.24, "BRG Weekly Post") — gộp 4 sheet nhỏ
  // "Top SL"/"Top DS"/"Top KH"/"Vượt KH" — xem lib/brgPostRankingsRunner.js.
  if (definition.sourceType === 'brgPostRankings') {
    return runBrgPostRankingsReport(definition, filterValues);
  }
  // 'brgPostRecap' (bản 11.24, "BRG Weekly Post") — Tổng quan Toàn chuỗi/
  // Mart/Mini Mart + theo Ngành hàng — xem lib/brgPostRecapRunner.js.
  if (definition.sourceType === 'brgPostRecap') {
    return runBrgPostRecapReport(definition, filterValues);
  }
  // 'brgPostDetail' (bản 11.24, "BRG Weekly Post") — GỘP 2 sheet "Từng
  // ST.CH"/"Từng sản phẩm" (cùng 1 bảng chi tiết siêu thị x SKU) — xem
  // lib/brgPostDetailRunner.js.
  // pagination (bản 11.30) — CHỈ báo cáo này (PHẲNG, không nhóm/subtotal,
  // xem chú thích ở lib/brgPostDetailRunner.js) trong cả nhóm BRG được
  // truyền `pagination` — 4 báo cáo BRG còn lại CÓ nhóm/subtotal, CHƯA làm
  // (xem audit-hieu-nang-bao-cao.md mục A.3).
  if (definition.sourceType === 'brgPostDetail') {
    return runBrgPostDetailReport(definition, filterValues, pagination);
  }
  // 'brgWeeklyPost' (bản 11.26, theo yêu cầu người dùng — gộp 5 SourceType
  // 'brgPost*' ở trên thành 1 báo cáo DUY NHẤT, chọn "sheet" qua bộ lọc nội
  // bộ `sheet` thay vì 5 báo cáo riêng trong menu) — ĐIỀU PHỐI sang ĐÚNG 1
  // trong 5 hàm run...Report() ở trên tuỳ `filterValues.sheet`, KHÔNG viết
  // lại logic — xem lib/brgWeeklyPostRunner.js. GIỮ NGUYÊN 5 nhánh
  // 'brgPost*' ở trên (không xoá) dù scripts/seedBrgWeeklyPostReport.js đã
  // xoá 5 dòng ReportCatalog dùng chúng — phòng rủi ro, không ảnh hưởng gì.
  if (definition.sourceType === 'brgWeeklyPost') {
    return runBrgWeeklyPostReport(definition, filterValues, pagination);
  }
  // 'dioNganhHang' (bản 11.32, báo cáo ĐẦU TIÊN trong 4 báo cáo "Báo cáo
  // vận hành" mới, theo yêu cầu người dùng) — "DIO theo ngành hàng" (Days
  // Inventory Outstanding) — MỖI DÒNG/mã Điểm × ngành hàng, Giá trị tồn ÷
  // Giá vốn bán ra trung bình 3 tháng — xem lib/dioNganhHangRunner.js. Báo
  // cáo PHẲNG (không nhóm/subtotal) nên truyền `pagination` (áp dụng
  // applyDisplayCap bên trong runner), cùng mẫu brgPostDetail.
  if (definition.sourceType === 'dioNganhHang') {
    return runDioNganhHangReport(definition, filterValues, pagination);
  }
  // 'doanhThuMtdKeHoach' (bản 11.33, báo cáo 2/4 "Báo cáo vận hành" mới,
  // theo yêu cầu người dùng) — "Theo dõi doanh thu MTD theo kế hoạch"
  // (3 ReportId riêng ALL/LFL/NSO, khác nhau qua definition.loaiSieuThi) —
  // xem lib/doanhThuMtdKeHoachRunner.js. Số dòng nhỏ (bằng số siêu thị),
  // KHÔNG cần pagination/applyDisplayCap.
  if (definition.sourceType === 'doanhThuMtdKeHoach') {
    return runDoanhThuMtdKeHoachReport(definition, filterValues);
  }
  // 'phuHangCoreChiTiet'/'phuHangCoreRecap' (bản 11.34, báo cáo 4/4 "Báo
  // cáo vận hành" mới, theo yêu cầu người dùng — CHỈ 2 sheet "Chi
  // tiết"/"Recap ST" như file mẫu gốc) — xem lib/phuHangCoreRunner.js. Số
  // dòng nhỏ (Core MART), KHÔNG cần pagination/applyDisplayCap.
  if (definition.sourceType === 'phuHangCoreChiTiet') {
    return runPhuHangCoreChiTietReport(definition, filterValues);
  }
  if (definition.sourceType === 'phuHangCoreRecap') {
    return runPhuHangCoreRecapReport(definition, filterValues);
  }
  if (definition.sourceType && definition.sourceType !== 'directDb') {
    return runApiReport(definition, filterValues, pagination);
  }
  const pool = await resolveFactsPool(definition);
  const rows = await runReport(pool, definition, filterValues, pagination);
  // columnGroups (bản 8.53) — trả kèm để rp-user vẽ tiêu đề nhóm có màu
  // khớp hệt Excel/PDF (xem components/DataTable.jsx) — an toàn để lộ, chỉ
  // là nhãn/màu nhóm + danh sách key đã CÓ SẴN trong `columns` trả ở trên,
  // không thêm chi tiết kiến trúc nguồn dữ liệu nào mới. standaloneColumnColors
  // (bản 8.58) — cùng lý do an toàn để lộ, chỉ là tên màu cho 1 cột đơn lẻ.
  // Cột 'stt' (bản 9.44) — KHÔNG có cột nguồn thật trong DWH để projectColumns
  // chiếu (không phải field/measures/formula nào), nên lọc RA trước khi gọi
  // projectColumns (tránh lỗi/giá trị rác), rồi gán SAU bằng assignSttIfPresent
  // (đánh số 1..N theo đúng thứ tự dòng trả về) — xem reportCellFormat.js.
  const projectableColumns = definition.columns.filter(c => (typeof c === 'string' ? c : c.key) !== 'stt');
  const columns = describeColumns(definition.columns);
  const projectedRows = rows.map(r => projectColumns(r, projectableColumns));
  assignSttIfPresent(projectedRows, columns);
  return {
    columns, rows: projectedRows,
    columnGroups: definition.columnGroups || null, standaloneColumnColors: definition.standaloneColumnColors || null
  };
}

// runDefinitionForExport (bản 11.30, SỬA LỖI THẬT phát hiện qua audit hiệu
// năng báo cáo — theo yêu cầu người dùng) — CHỈ SourceType 'directDb' (nhánh
// mặc định ở cuối runDefinition() phía trên, dùng runReport() với SQL
// OFFSET/FETCH THẬT, xem lib/reportEngine.js) tôn trọng `pagination` — gọi
// runDefinition(..., { page:1, pageSize: 5000 }) như /export đã làm TRƯỚC
// ĐÂY nghĩa là báo cáo 'directDb' nào khớp HƠN 5000 dòng bộ lọc sẽ bị CẮT
// ÂM THẦM khi xuất Excel/PDF, không có cảnh báo gì — SAI với yêu cầu "xuất
// Excel phải trọn gói". 14 SourceType khác (composite/kinhDoanhTuan/
// brgPost*/...) KHÔNG đọc `pagination` (luôn trả ĐỦ dòng ngay ở 1 lượt gọi,
// xem bảng đối chiếu trong audit-hieu-nang-bao-cao.md) nên KHÔNG được lặp
// trang ở đây — lặp thêm sẽ gọi lại ĐÚNG same full dataset và NHÂN ĐÔI dữ
// liệu một cách sai lệch. Mirror ĐÚNG mẫu `fetchAllReportRows()` đã có sẵn
// trong lib/compositeReportRunner.js (bản 8.99, cùng lớp lỗi: "runReport()
// cắt cứng ở pageSize, ORDER BY EventDate DESC khiến phần dữ liệu xa hơn bị
// bỏ qua âm thầm") — lặp theo batch tới khi hết dữ liệu, kèm 1 trần an toàn
// tuyệt đối (EXPORT_SAFETY_CAP) để không treo server/tràn bộ nhớ nếu bộ lọc
// vô tình khớp số dòng cực lớn.
const EXPORT_BATCH_SIZE = 5000;
const EXPORT_SAFETY_CAP = 200000;

function isDirectDbSourceType(definition) {
  return !definition.sourceType || definition.sourceType === 'directDb';
}

async function runDefinitionForExport(definition, filterValues) {
  if (!isDirectDbSourceType(definition)) {
    // 14 SourceType khác — 1 lượt gọi ĐÃ trả đủ mọi dòng (không đọc
    // `pagination`), giữ NGUYÊN hành vi cũ, không lặp thêm.
    return runDefinition(definition, filterValues, { page: 1, pageSize: EXPORT_BATCH_SIZE });
  }
  let page = 1;
  let result;
  let allRows = [];
  for (;;) {
    result = await runDefinition(definition, filterValues, { page, pageSize: EXPORT_BATCH_SIZE });
    allRows = allRows.concat(result.rows);
    if (result.rows.length < EXPORT_BATCH_SIZE || allRows.length >= EXPORT_SAFETY_CAP) break;
    page += 1;
  }
  if (allRows.length >= EXPORT_SAFETY_CAP) {
    console.warn(`⚠️  [export "${definition.title}"] đạt trần an toàn ${EXPORT_SAFETY_CAP} dòng — có thể vẫn còn dữ liệu chưa xuất, thu hẹp bộ lọc nếu cần đủ.`);
  }
  return { ...result, rows: allRows };
}

module.exports = { loadDefinition, runDefinition, runDefinitionForExport, resolveFactsPool };
