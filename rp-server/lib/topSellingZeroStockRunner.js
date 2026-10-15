// lib/topSellingZeroStockRunner.js — SourceType='topZeroStock': báo cáo
// riêng "Top bán chạy đang tồn kho = 0", KHÔNG phải SELECT phẳng theo
// definition.columns như 'directDb' — bộ máy này TỰ:
//   1. Tính tổng Qty bán mỗi thực thể (EntityCode = "<MaChiNhánh>_<MaHàng>",
//      xem "Mã thực thể" ở hướng_dẫn_báo_cáo.md mục 6) trong khoảng ngày
//      xếp hạng người dùng chọn (filterValues.rankWindow), CHỈ những thực
//      thể có bán > 0 trong kỳ (hàng không nhập/không bán mà tồn = 0 không
//      tính là "hết hàng" — yêu cầu đã chốt với người dùng).
//   2. Với MỌI thực thể có bán > 0 trong kỳ (chưa cắt Top N vội), tính TỒN
//      KHO ƯỚC TÍNH HÔM NAY = Tồn cuối kỳ NGÀY HÔM QUA (dòng gần nhất
//      trước hôm nay trong stockDomain) − Số lượng bán HÔM NAY (không phụ
//      thuộc rankWindow — LUÔN là hôm nay, xem xác nhận người dùng: "hàng
//      ngày tính lại tồn kho và chuyển tồn cuối ngày HN sang đầu ngày hôm
//      sau"), và KHÔNG cộng lại hàng đã nhập trong ngày (dù từ NCC hay
//      điều chuyển) — vì mục đích là phát hiện thực ra đã hết hàng từ tồn
//      cũ, không bị "che" bởi lô hàng vừa về (xem xác nhận người dùng
//      "không phụ thuộc hàng nhập").
//   3. Chỉ giữ lại thực thể có tồn ước tính <= ngưỡng (definition.threshold,
//      mặc định 0 — sửa được sau qua DefinitionJson mà KHÔNG cần đổi code).
//   4. Xếp hạng Top N (bản 9.43, filterValues.topLimit — '50'/'100', người
//      xem tự chọn; KHÔNG khai thì rơi về definition.topN, mặc định 50)
//      TRONG TỪNG chi nhánh (không xếp hạng chung toàn hệ thống), ưu tiên
//      theo ĐÚNG 2 tiêu chí người dùng yêu cầu: (a) bán số lượng nhiều hơn
//      trước, (b) cùng mức bán thì tồn kho GẦN 0 HƠN trước (tồn = 0 ưu
//      tiên nhất, tồn âm CÀNG ÍT ưu tiên càng cao, âm càng sâu càng sau).
//   5. TUỲ CHỌN (định nghĩa qua DefinitionJson, KHÔNG hardcode bảng/điều
//      kiện trạng thái trong code — DBA tự đặt trong VIEW nguồn, xem
//      bc-ton-kho-0.md): thêm 4 cột thông tin "Chờ nhập"/"Đã
//      nhập" (mỗi loại tách NCC/Điều chuyển) — đọc từ 4 domain riêng do
//      người dùng CHỌN LÚC TẠO BÁO CÁO (pendingSupplierDomain/
//      pendingTransferDomain/receivedSupplierDomain/receivedTransferDomain),
//      KHÔNG ảnh hưởng tới việc xác định tồn=0 ở bước 3/4 — chỉ hiển thị
//      thêm thông tin tham khảo.
//
// DefinitionJson bắt buộc: { salesDomain, stockDomain } — xem bc-ton-kho-0.md cho
// mẫu VIEW + cấu hình job đầy đủ (2 job "Theo bảng", BẬT "Giữ lịch sử theo
// ngày"). Tuỳ chọn: topN (mặc định 50), threshold (mặc định 0),
// dataSourceId, và 4 domain "Chờ nhập"/"Đã nhập" nói trên (bỏ trống domain
// nào thì cột đó không hiện trong kết quả — không bắt buộc cấu hình đủ cả
// 4).
//
// filterValues: { rankWindow: '1'|'7'|'30'|'daily' (mặc định '1'),
//                 branches: [MaChiNhanh,...] (rỗng/bỏ trống = tất cả),
//                 topLimit: '50'|'100' (TUỲ CHỌN, mặc định definition.topN) }.
//
// Dimensions domain salesDomain/stockDomain PHẢI có sẵn MaChiNhanh/
// TenChiNhanh/MaHangHienThi/TenHang (tick khi tạo job etl-admin) — dùng để
// hiển thị, không cần tách lại từ EntityCode. 4 domain "Chờ nhập"/"Đã nhập"
// CHỈ cần Measures (không cần Dimensions) — chỉ tra theo EntityCode đã có
// sẵn từ salesDomain/stockDomain.
const { sql, getPool } = require('../db');
const { getPoolForDataSource } = require('./dataSourcePool');
const { todayUTC, loadLatestMeasureBefore, loadLatestMeasure, loadSumOnDate } = require('./reportFactsHelpers');

const RANK_WINDOWS = ['1', '7', '30', 'daily'];

// '1'/'7'/'30' tính theo ngày ĐÃ CHỐT SỔ, kết thúc ở HÔM QUA — dữ liệu
// TRONG NGÀY hôm nay thường chưa đồng bộ đủ (job etl chạy theo lịch, xem
// jobs/scheduler.js). 'daily' là lựa chọn RIÊNG cho người dùng muốn xem
// trong ngày. Đây CHỈ dùng để chọn TOP N bán chạy — tồn kho ước tính ở
// bước 3 LUÔN dùng "hôm nay" thật, độc lập với lựa chọn này.
function resolveDateRange(rankWindow) {
  const now = new Date();
  const todayUTC = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  if (rankWindow === 'daily') {
    return { from: todayUTC, to: todayUTC };
  }
  const days = rankWindow === '7' ? 7 : rankWindow === '30' ? 30 : 1;
  const to = new Date(todayUTC);
  to.setUTCDate(to.getUTCDate() - 1);
  const from = new Date(to);
  from.setUTCDate(from.getUTCDate() - (days - 1));
  return { from, to };
}

// width — trọng số bề rộng cột lúc XUẤT Excel/PDF (mặc định 1 nếu bỏ
// trống, xem lib/compositeReportRunner.js đầu file cho quy ước chung) — tên
// chi nhánh/tên hàng cần RỘNG HƠN hẳn cột số, không khai thì lib/exportPdf.js
// chia đều 9 cột (khi khai đủ 4 domain Chờ/Đã nhập) làm chữ đè lên nhau.
function describeColumns(definition) {
  const columns = [
    { key: 'chiNhanh', label: 'Chi nhánh', width: 1.6 },
    { key: 'maHang', label: 'Mã hàng', width: 0.8 },
    { key: 'tenHang', label: 'Tên hàng', width: 1.6 },
    { key: 'soLuongBan', label: 'Số lượng bán (trong kỳ)', width: 1 },
    // tonKhoHomQua/soLuongBanHomNay (bản 9.36, theo yêu cầu người dùng) —
    // hiện rõ 2 số dùng để TÍNH tonKho (Tồn hôm qua − Bán hôm nay = Tồn
    // hiện tại), để người xem tự đối chiếu được phép tính thay vì chỉ thấy
    // kết quả cuối — CỐ Ý tách riêng "Bán hôm nay" với "soLuongBan" ở trên
    // (số đó theo rankWindow người dùng chọn, có thể là 7/30 ngày, KHÔNG
    // phải số dùng trong công thức tồn kho — công thức LUÔN dùng đúng hôm
    // nay, xem resolveDateRange()/bước 3 ở runTopZeroStockReport()).
    { key: 'tonKhoHomQua', label: 'Tồn kho hôm qua', width: 1 },
    { key: 'soLuongBanHomNay', label: 'Bán hôm nay', width: 1 },
    { key: 'tonKho', label: 'Tồn kho hiện tại', width: 1 }
  ];
  if (definition.pendingSupplierDomain) columns.push({ key: 'choNhapNCC', label: 'Chờ nhập (NCC)', width: 1 });
  if (definition.pendingTransferDomain) columns.push({ key: 'choNhapDieuChuyen', label: 'Chờ nhập (Điều chuyển)', width: 1.1 });
  if (definition.receivedSupplierDomain) columns.push({ key: 'daNhapNCC', label: 'Đã nhập hôm nay (NCC)', width: 1.1 });
  if (definition.receivedTransferDomain) columns.push({ key: 'daNhapDieuChuyen', label: 'Đã nhập hôm nay (Điều chuyển)', width: 1.2 });
  return columns;
}

async function resolvePool(definition) {
  if (definition.dataSourceId) return getPoolForDataSource(definition.dataSourceId);
  return getPool('DWH');
}

// topLimit (bản 9.43, theo yêu cầu người dùng — "lọc lấy tồn top 100, lấy
// tồn top 50") — filterValues.topLimit (TUỲ CHỌN, '50'/'100', xem filter
// "topLimit" ở scripts/seedTopZeroStockReport.js) GHI ĐÈ definition.topN
// NGAY LÚC XEM, không cần sửa DefinitionJson/chạy lại seed script mỗi khi
// đổi cỡ top. KHÔNG truyền (báo cáo cũ chưa khai filter này) -> rơi về
// definition.topN như trước, không đổi hành vi.
const TOP_LIMITS = ['50', '100'];

async function runTopZeroStockReport(definition, filterValues = {}) {
  if (!definition.salesDomain || !definition.stockDomain) {
    throw new Error('Báo cáo thiếu cấu hình salesDomain/stockDomain (topZeroStock)');
  }
  const pool = await resolvePool(definition);
  const topN = TOP_LIMITS.includes(String(filterValues.topLimit))
    ? Number(filterValues.topLimit)
    : (Number(definition.topN) > 0 ? Number(definition.topN) : 50);
  const threshold = Number.isFinite(Number(definition.threshold)) ? Number(definition.threshold) : 0;
  const rankWindow = RANK_WINDOWS.includes(filterValues.rankWindow) ? filterValues.rankWindow : '1';
  const { from, to } = resolveDateRange(rankWindow);
  const today = todayUTC();
  const branchFilter = Array.isArray(filterValues.branches) ? filterValues.branches.filter(Boolean).map(String) : [];

  // Bước 1+2 — tổng Qty bán mỗi thực thể trong kỳ XẾP HẠNG (rankWindow),
  // chỉ nơi có bán > 0.
  const salesRequest = pool.request();
  salesRequest.input('domain', sql.VarChar(50), definition.salesDomain);
  salesRequest.input('dateFrom', sql.Date, from);
  salesRequest.input('dateTo', sql.Date, to);
  let salesWhere = 'Domain = @domain AND EventDate >= @dateFrom AND EventDate <= @dateTo';
  if (branchFilter.length) {
    const names = branchFilter.map((v, i) => {
      const p = `branch${i}`;
      salesRequest.input(p, sql.NVarChar(100), v);
      return `@${p}`;
    });
    salesWhere += ` AND JSON_VALUE(Dimensions, '$.MaChiNhanh') IN (${names.join(', ')})`;
  }
  const salesResult = await salesRequest.query(`
    SELECT
      EntityCode,
      MAX(JSON_VALUE(Dimensions, '$.MaChiNhanh')) AS BranchCode,
      MAX(JSON_VALUE(Dimensions, '$.TenChiNhanh')) AS BranchName,
      MAX(JSON_VALUE(Dimensions, '$.MaHangHienThi')) AS SkuCode,
      MAX(JSON_VALUE(Dimensions, '$.TenHang')) AS ItemName,
      SUM(CAST(JSON_VALUE(Measures, '$.SoLuongBan') AS DECIMAL(18,4))) AS QtySold
    FROM dwh.ReportFacts
    WHERE ${salesWhere}
    GROUP BY EntityCode
    HAVING SUM(CAST(JSON_VALUE(Measures, '$.SoLuongBan') AS DECIMAL(18,4))) > 0
  `);
  if (!salesResult.recordset.length) return { columns: describeColumns(definition), rows: [] };

  // Bản 9.43 (theo yêu cầu người dùng) — TRƯỚC ĐÂY cắt Top N theo Qty NGAY
  // Ở ĐÂY (trước khi biết tồn kho), rồi mới lọc trong đúng Top N đó xem ai
  // hết hàng — nghĩa là 1 mặt hàng bán rất chạy nhưng lọt ngoài Top N theo
  // SỐ LƯỢNG BÁN thô thì KHÔNG BAO GIỜ được xét tới dù tồn đã âm sâu. Giờ
  // tính tồn kho cho TẤT CẢ thực thể có bán > 0 trong kỳ (không cắt trước),
  // lọc tồn <= ngưỡng xong MỚI xếp hạng + cắt Top N — để tiêu chí "tồn
  // kho hiện tại" (ưu tiên =0, càng ít âm càng ưu tiên) cũng tham gia xếp
  // hạng cùng "bán số lượng nhiều", không chỉ mỗi doanh số quyết định ai
  // lọt vào Top N. Đánh đổi: entityCodes truyền vào 2 hàm dưới đây không
  // còn bị giới hạn bởi Top N nữa — có thể lớn hơn nếu kỳ xếp hạng dài (vd
  // 30 ngày) ra nhiều mặt hàng có bán > 0; chấp nhận được vì vẫn chỉ gồm
  // thực thể CÓ bán trong kỳ, không phải toàn bộ danh mục.
  const entityCodes = salesResult.recordset.map(r => r.EntityCode);

  // Bước 3 — tồn kho ƯỚC TÍNH HÔM NAY = tồn "hôm qua" (dòng gần nhất TRƯỚC
  // hôm nay trong stockDomain) − bán "hôm nay" (LUÔN đúng ngày hôm nay,
  // KHÔNG theo rankWindow) — độc lập hàng nhập trong ngày.
  const [yesterdayStockByEntity, todaySalesByEntity] = await Promise.all([
    loadLatestMeasureBefore(pool, definition.stockDomain, entityCodes, 'SoLuongTon', today),
    loadSumOnDate(pool, definition.salesDomain, entityCodes, 'SoLuongBan', today)
  ]);

  // Bước 5 (tuỳ chọn) — 4 cột thông tin thêm, chỉ query domain nào THẬT SỰ
  // được cấu hình (definition.*Domain), không ép phải khai đủ cả 4.
  const [pendingSupplierByEntity, pendingTransferByEntity, receivedSupplierByEntity, receivedTransferByEntity] = await Promise.all([
    definition.pendingSupplierDomain ? loadLatestMeasure(pool, definition.pendingSupplierDomain, entityCodes, 'SoLuongChoNhap') : Promise.resolve(new Map()),
    definition.pendingTransferDomain ? loadLatestMeasure(pool, definition.pendingTransferDomain, entityCodes, 'SoLuongChoNhap') : Promise.resolve(new Map()),
    definition.receivedSupplierDomain ? loadSumOnDate(pool, definition.receivedSupplierDomain, entityCodes, 'SoLuongDaNhap', today) : Promise.resolve(new Map()),
    definition.receivedTransferDomain ? loadSumOnDate(pool, definition.receivedTransferDomain, entityCodes, 'SoLuongDaNhap', today) : Promise.resolve(new Map())
  ]);

  // Bước 4 — chỉ giữ thực thể có tồn ƯỚC TÍNH <= ngưỡng. Không có dòng tồn
  // kho "hôm qua" nào (chưa từng đồng bộ) -> KHÔNG đủ căn cứ kết luận hết
  // hàng, loại bỏ thay vì coi như 0.
  const candidates = [];
  for (const row of salesResult.recordset) {
    const yesterdayStock = yesterdayStockByEntity.get(row.EntityCode);
    if (yesterdayStock === undefined || yesterdayStock === null) continue;
    const todaySales = todaySalesByEntity.get(row.EntityCode) || 0;
    const estimatedStock = yesterdayStock - todaySales;
    if (estimatedStock > threshold) continue;
    candidates.push({
      chiNhanh: row.BranchName || row.BranchCode,
      branchCode: row.BranchCode || '',
      maHang: row.SkuCode,
      tenHang: row.ItemName,
      soLuongBan: row.QtySold,
      tonKhoHomQua: yesterdayStock,
      soLuongBanHomNay: todaySales,
      tonKho: estimatedStock,
      ...(definition.pendingSupplierDomain ? { choNhapNCC: pendingSupplierByEntity.get(row.EntityCode) ?? null } : {}),
      ...(definition.pendingTransferDomain ? { choNhapDieuChuyen: pendingTransferByEntity.get(row.EntityCode) ?? null } : {}),
      ...(definition.receivedSupplierDomain ? { daNhapNCC: receivedSupplierByEntity.get(row.EntityCode) ?? null } : {}),
      ...(definition.receivedTransferDomain ? { daNhapDieuChuyen: receivedTransferByEntity.get(row.EntityCode) ?? null } : {})
    });
  }

  // Bước 4b (bản 9.43) — xếp hạng Top N TRONG TỪNG chi nhánh, theo ĐÚNG 3
  // tiêu chí người dùng yêu cầu, ưu tiên từ trên xuống: (1) bán số lượng
  // nhiều hơn xếp trước, (2) tồn kho GẦN 0 HƠN xếp trước (tồn = 0 ưu tiên
  // nhất, rồi tới tồn âm ÍT hơn, tồn âm SÂU hơn xếp sau — vd tồn -2 đứng
  // trước tồn -200) — `tonKho` giảm dần (DESC) xếp đúng thứ tự này vì 0 >
  // -2 > -200.
  const byBranch = new Map();
  for (const row of candidates) {
    if (!byBranch.has(row.branchCode)) byBranch.set(row.branchCode, []);
    byBranch.get(row.branchCode).push(row);
  }
  const rows = [];
  for (const branchRows of byBranch.values()) {
    branchRows.sort((a, b) => (b.soLuongBan - a.soLuongBan) || (b.tonKho - a.tonKho));
    for (const row of branchRows.slice(0, topN)) {
      delete row.branchCode; // field nội bộ, không thuộc describeColumns()
      rows.push(row);
    }
  }

  return { columns: describeColumns(definition), rows };
}

module.exports = { runTopZeroStockReport, resolveDateRange, RANK_WINDOWS };
