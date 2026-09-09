// lib/topSellingZeroStockRunner.js — SourceType='topZeroStock': báo cáo
// riêng "Top bán chạy đang tồn kho = 0", KHÔNG phải SELECT phẳng theo
// definition.columns như 'directDb' — bộ máy này TỰ:
//   1. Tính tổng Qty bán mỗi thực thể (EntityCode = "<MaChiNhánh>_<MaHàng>",
//      xem "Mã thực thể" ở hướng_dẫn_báo_cáo.md mục 6) trong khoảng ngày
//      xếp hạng người dùng chọn (filterValues.rankWindow), CHỈ những thực
//      thể có bán > 0 trong kỳ (hàng không nhập/không bán mà tồn = 0 không
//      tính là "hết hàng" — yêu cầu đã chốt với người dùng).
//   2. Xếp hạng TOP N (definition.topN, mặc định 50) theo Qty TRONG TỪNG
//      chi nhánh (không xếp hạng chung toàn hệ thống).
//   3. Với đúng các thực thể lọt top, tính TỒN KHO ƯỚC TÍNH HÔM NAY =
//      Tồn cuối kỳ NGÀY HÔM QUA (dòng gần nhất trước hôm nay trong
//      stockDomain) − Số lượng bán HÔM NAY (không phụ thuộc rankWindow —
//      LUÔN là hôm nay, xem xác nhận người dùng: "hàng ngày tính lại tồn
//      kho và chuyển tồn cuối ngày HN sang đầu ngày hôm sau"), và KHÔNG
//      cộng lại hàng đã nhập trong ngày (dù từ NCC hay điều chuyển) — vì
//      mục đích là phát hiện thực ra đã hết hàng từ tồn cũ, không bị "che"
//      bởi lô hàng vừa về (xem xác nhận người dùng "không phụ thuộc hàng
//      nhập").
//   4. Chỉ giữ lại thực thể có tồn ước tính <= ngưỡng (definition.threshold,
//      mặc định 0 — sửa được sau qua DefinitionJson mà KHÔNG cần đổi code).
//   5. TUỲ CHỌN (định nghĩa qua DefinitionJson, KHÔNG hardcode bảng/điều
//      kiện trạng thái trong code — DBA tự đặt trong VIEW nguồn, xem
//      hướng_dẫn_báo_cáo.md mục 12): thêm 4 cột thông tin "Chờ nhập"/"Đã
//      nhập" (mỗi loại tách NCC/Điều chuyển) — đọc từ 4 domain riêng do
//      người dùng CHỌN LÚC TẠO BÁO CÁO (pendingSupplierDomain/
//      pendingTransferDomain/receivedSupplierDomain/receivedTransferDomain),
//      KHÔNG ảnh hưởng tới việc xác định tồn=0 ở bước 3/4 — chỉ hiển thị
//      thêm thông tin tham khảo.
//
// DefinitionJson bắt buộc: { salesDomain, stockDomain } — xem mục 12 cho
// mẫu VIEW + cấu hình job đầy đủ (2 job "Theo bảng", BẬT "Giữ lịch sử theo
// ngày"). Tuỳ chọn: topN (mặc định 50), threshold (mặc định 0),
// dataSourceId, và 4 domain "Chờ nhập"/"Đã nhập" nói trên (bỏ trống domain
// nào thì cột đó không hiện trong kết quả — không bắt buộc cấu hình đủ cả
// 4).
//
// filterValues: { rankWindow: '1'|'7'|'30'|'daily' (mặc định '1'),
//                 branches: [MaChiNhanh,...] (rỗng/bỏ trống = tất cả) }.
//
// Dimensions domain salesDomain/stockDomain PHẢI có sẵn MaChiNhanh/
// TenChiNhanh/MaHangHienThi/TenHang (tick khi tạo job etl-admin) — dùng để
// hiển thị, không cần tách lại từ EntityCode. 4 domain "Chờ nhập"/"Đã nhập"
// CHỈ cần Measures (không cần Dimensions) — chỉ tra theo EntityCode đã có
// sẵn từ salesDomain/stockDomain.
const { sql, getPool } = require('../db');
const { getPoolForDataSource } = require('./dataSourcePool');

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

function todayUTC() {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}

function describeColumns(definition) {
  const columns = [
    { key: 'chiNhanh', label: 'Chi nhánh' },
    { key: 'maHang', label: 'Mã hàng' },
    { key: 'tenHang', label: 'Tên hàng' },
    { key: 'soLuongBan', label: 'Số lượng bán (trong kỳ)' },
    { key: 'tonKho', label: 'Tồn kho hiện tại' }
  ];
  if (definition.pendingSupplierDomain) columns.push({ key: 'choNhapNCC', label: 'Chờ nhập (NCC)' });
  if (definition.pendingTransferDomain) columns.push({ key: 'choNhapDieuChuyen', label: 'Chờ nhập (Điều chuyển)' });
  if (definition.receivedSupplierDomain) columns.push({ key: 'daNhapNCC', label: 'Đã nhập hôm nay (NCC)' });
  if (definition.receivedTransferDomain) columns.push({ key: 'daNhapDieuChuyen', label: 'Đã nhập hôm nay (Điều chuyển)' });
  return columns;
}

async function resolvePool(definition) {
  if (definition.dataSourceId) return getPoolForDataSource(definition.dataSourceId);
  return getPool('DWH');
}

function buildEntityCodeParams(request, entityCodes, prefix = 'code') {
  return entityCodes.map((code, i) => {
    const p = `${prefix}${i}`;
    request.input(p, sql.NVarChar(200), String(code));
    return `@${p}`;
  });
}

// Dòng GẦN NHẤT TRƯỚC 1 ngày mốc (dùng cho tồn kho "hôm qua" — bước 3) —
// KHÔNG lấy dòng của chính ngày mốc hay sau đó, để luôn là số liệu ĐÃ CHỐT
// SỔ, không lẫn số liệu đang cập nhật dở trong ngày.
async function loadLatestMeasureBefore(pool, domain, entityCodes, measureKey, beforeDate) {
  if (!entityCodes.length) return new Map();
  const request = pool.request();
  request.input('domain', sql.VarChar(50), domain);
  request.input('beforeDate', sql.Date, beforeDate);
  const codeParams = buildEntityCodeParams(request, entityCodes);
  const result = await request.query(`
    SELECT EntityCode, Value FROM (
      SELECT
        EntityCode,
        CAST(JSON_VALUE(Measures, '$.${measureKey}') AS DECIMAL(18,4)) AS Value,
        ROW_NUMBER() OVER (PARTITION BY EntityCode ORDER BY EventDate DESC) AS rn
      FROM dwh.ReportFacts
      WHERE Domain = @domain AND EntityCode IN (${codeParams.join(', ')}) AND EventDate < @beforeDate
    ) latest WHERE rn = 1
  `);
  return new Map(result.recordset.map(r => [r.EntityCode, r.Value]));
}

// Dòng GẦN NHẤT bất kỳ ngày nào (dùng cho "Chờ nhập" — số lượng đang treo
// TẠI THỜI ĐIỂM chạy báo cáo, VIEW nguồn tự tính lại mỗi lần đồng bộ, xem
// hướng_dẫn_báo_cáo.md mục 12) — khác loadLatestMeasureBefore ở chỗ không
// giới hạn "trước 1 ngày mốc", lấy đúng số liệu MỚI NHẤT đã đồng bộ.
async function loadLatestMeasure(pool, domain, entityCodes, measureKey) {
  if (!entityCodes.length) return new Map();
  const request = pool.request();
  request.input('domain', sql.VarChar(50), domain);
  const codeParams = buildEntityCodeParams(request, entityCodes);
  const result = await request.query(`
    SELECT EntityCode, Value FROM (
      SELECT
        EntityCode,
        CAST(JSON_VALUE(Measures, '$.${measureKey}') AS DECIMAL(18,4)) AS Value,
        ROW_NUMBER() OVER (PARTITION BY EntityCode ORDER BY EventDate DESC) AS rn
      FROM dwh.ReportFacts
      WHERE Domain = @domain AND EntityCode IN (${codeParams.join(', ')})
    ) latest WHERE rn = 1
  `);
  return new Map(result.recordset.map(r => [r.EntityCode, r.Value]));
}

// Dòng ĐÚNG 1 ngày cụ thể (dùng cho "Số lượng bán hôm nay" ở bước 3 và "Đã
// nhập hôm nay" — LUÔN đúng nghĩa "hôm nay", không lùi ngày nếu chưa có dữ
// liệu, khác cách tồn kho "hôm qua" ở trên được phép lùi — xem xác nhận
// người dùng "đã nhập ngày HN"). Domain có nhiều dòng cùng ngày (vd nhiều
// chứng từ) thì SUM lại — measureKey đo lường TỪNG dòng, tổng theo ngày.
async function loadSumOnDate(pool, domain, entityCodes, measureKey, onDate) {
  if (!entityCodes.length) return new Map();
  const request = pool.request();
  request.input('domain', sql.VarChar(50), domain);
  request.input('onDate', sql.Date, onDate);
  const codeParams = buildEntityCodeParams(request, entityCodes);
  const result = await request.query(`
    SELECT EntityCode, SUM(CAST(JSON_VALUE(Measures, '$.${measureKey}') AS DECIMAL(18,4))) AS Value
    FROM dwh.ReportFacts
    WHERE Domain = @domain AND EntityCode IN (${codeParams.join(', ')}) AND EventDate = @onDate
    GROUP BY EntityCode
  `);
  return new Map(result.recordset.map(r => [r.EntityCode, r.Value]));
}

async function runTopZeroStockReport(definition, filterValues = {}) {
  if (!definition.salesDomain || !definition.stockDomain) {
    throw new Error('Báo cáo thiếu cấu hình salesDomain/stockDomain (topZeroStock)');
  }
  const pool = await resolvePool(definition);
  const topN = Number(definition.topN) > 0 ? Number(definition.topN) : 50;
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

  // Xếp hạng top N theo Qty TRONG TỪNG chi nhánh.
  const byBranch = new Map();
  for (const row of salesResult.recordset) {
    const branchCode = row.BranchCode || '';
    if (!byBranch.has(branchCode)) byBranch.set(branchCode, []);
    byBranch.get(branchCode).push(row);
  }
  const topRows = [];
  for (const rows of byBranch.values()) {
    rows.sort((a, b) => b.QtySold - a.QtySold);
    topRows.push(...rows.slice(0, topN));
  }
  const entityCodes = topRows.map(r => r.EntityCode);

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
  const rows = [];
  for (const row of topRows) {
    const yesterdayStock = yesterdayStockByEntity.get(row.EntityCode);
    if (yesterdayStock === undefined || yesterdayStock === null) continue;
    const todaySales = todaySalesByEntity.get(row.EntityCode) || 0;
    const estimatedStock = yesterdayStock - todaySales;
    if (estimatedStock > threshold) continue;
    rows.push({
      chiNhanh: row.BranchName || row.BranchCode,
      maHang: row.SkuCode,
      tenHang: row.ItemName,
      soLuongBan: row.QtySold,
      tonKho: estimatedStock,
      ...(definition.pendingSupplierDomain ? { choNhapNCC: pendingSupplierByEntity.get(row.EntityCode) ?? null } : {}),
      ...(definition.pendingTransferDomain ? { choNhapDieuChuyen: pendingTransferByEntity.get(row.EntityCode) ?? null } : {}),
      ...(definition.receivedSupplierDomain ? { daNhapNCC: receivedSupplierByEntity.get(row.EntityCode) ?? null } : {}),
      ...(definition.receivedTransferDomain ? { daNhapDieuChuyen: receivedTransferByEntity.get(row.EntityCode) ?? null } : {})
    });
  }

  return { columns: describeColumns(definition), rows };
}

module.exports = { runTopZeroStockReport, resolveDateRange, RANK_WINDOWS };
