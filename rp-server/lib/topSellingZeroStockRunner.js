// lib/topSellingZeroStockRunner.js — SourceType='topZeroStock': báo cáo
// riêng "Top bán chạy đang tồn kho = 0", KHÔNG phải SELECT phẳng theo
// definition.columns như 'directDb' — bộ máy này TỰ:
//   1. Tính tổng Qty bán mỗi thực thể (EntityCode = "<MaChiNhanh>_<MaHang>",
//      xem "Mã thực thể" ở hướng_dẫn_báo_cáo.md mục 6) trong khoảng ngày
//      xếp hạng người dùng chọn (filterValues.rankWindow), CHỈ những thực
//      thể có bán > 0 trong kỳ (hàng không nhập/không bán mà tồn = 0 không
//      tính là "hết hàng" — yêu cầu đã chốt với người dùng).
//   2. Xếp hạng TOP N (definition.topN, mặc định 50) theo Qty TRONG TỪNG
//      chi nhánh (không xếp hạng chung toàn hệ thống).
//   3. Với đúng các thực thể lọt top, tra tồn kho ở dòng NGÀY GẦN NHẤT CÓ
//      DỮ LIỆU (không cố định "hôm nay" — nếu etl-admin chưa kịp đồng bộ
//      hôm nay, tự lùi về ngày gần nhất đã có, xem hướng_dẫn_báo_cáo.md mục
//      12 — "Đồng ý lấy ngày gần nhất có dữ liệu").
//   4. Chỉ giữ lại thực thể có tồn kho <= ngưỡng (definition.threshold, mặc
//      định 0 — sửa được sau qua DefinitionJson mà KHÔNG cần đổi code,
//      giống cách dwh.AnomalyAlerts cấu hình ngưỡng).
//
// DefinitionJson bắt buộc: { salesDomain, stockDomain } — 2 domain đã đồng
// bộ sẵn qua etl-admin (job "Theo bảng" đọc từ 2 VIEW nguồn tự gộp
// "<MaChiNhanh>_<MaHang>" làm EntityCode, BẬT "Giữ lịch sử theo ngày" —
// bắt buộc để có đủ nhiều ngày cho khoảng xếp hạng 7/30 ngày VÀ để tìm được
// "ngày gần nhất có dữ liệu" tồn kho, xem hướng_dẫn_báo_cáo.md mục 12 cho
// mẫu VIEW + cấu hình job đầy đủ). Tuỳ chọn: topN (mặc định 50), threshold
// (mặc định 0), dataSourceId (mặc định Data Warehouse .env).
//
// filterValues: { rankWindow: '1'|'7'|'30'|'daily' (mặc định '1'),
//                 branches: [MaChiNhanh,...] (rỗng/bỏ trống = tất cả) }.
//
// Dimensions 2 domain nguồn PHẢI có sẵn MaChiNhanh/TenChiNhanh/MaHangHienThi
// /TenHang (tick khi tạo job etl-admin) — dùng để hiển thị, không cần tách
// lại từ EntityCode.
const { sql, getPool } = require('../db');
const { getPoolForDataSource } = require('./dataSourcePool');

const RANK_WINDOWS = ['1', '7', '30', 'daily'];

// '1'/'7'/'30' tính theo ngày ĐÃ CHỐT SỔ, kết thúc ở HÔM QUA — dữ liệu
// TRONG NGÀY hôm nay thường chưa đồng bộ đủ (job etl chạy theo lịch, xem
// jobs/scheduler.js), xếp hạng theo ngày chưa đủ dữ liệu dễ sai lệch.
// 'daily' là lựa chọn RIÊNG cho người dùng muốn xem trong ngày (chấp nhận
// dữ liệu tạm thời, tự đồng bộ dần trong ngày).
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

function describeColumns() {
  return [
    { key: 'chiNhanh', label: 'Chi nhánh' },
    { key: 'maHang', label: 'Mã hàng' },
    { key: 'tenHang', label: 'Tên hàng' },
    { key: 'soLuongBan', label: 'Số lượng bán (trong kỳ)' },
    { key: 'tonKho', label: 'Tồn kho hiện tại' }
  ];
}

async function resolvePool(definition) {
  if (definition.dataSourceId) return getPoolForDataSource(definition.dataSourceId);
  return getPool('DWH');
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
  const branchFilter = Array.isArray(filterValues.branches) ? filterValues.branches.filter(Boolean).map(String) : [];

  // Bước 1+2 — tổng Qty bán mỗi thực thể trong kỳ, chỉ nơi có bán > 0.
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
  if (!salesResult.recordset.length) return { columns: describeColumns(), rows: [] };

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

  // Bước 3 — tồn kho ở dòng NGÀY GẦN NHẤT CÓ DỮ LIỆU của đúng các thực thể
  // vừa lọt top (ROW_NUMBER theo EventDate DESC, không lọc theo khoảng ngày
  // xếp hạng ở trên — tồn kho luôn lấy mới nhất, độc lập rankWindow).
  const stockRequest = pool.request();
  stockRequest.input('domain', sql.VarChar(50), definition.stockDomain);
  const codeParams = topRows.map((row, i) => {
    const p = `code${i}`;
    stockRequest.input(p, sql.NVarChar(200), String(row.EntityCode));
    return `@${p}`;
  });
  const stockResult = await stockRequest.query(`
    SELECT EntityCode, StockQty FROM (
      SELECT
        EntityCode,
        CAST(JSON_VALUE(Measures, '$.SoLuongTon') AS DECIMAL(18,4)) AS StockQty,
        ROW_NUMBER() OVER (PARTITION BY EntityCode ORDER BY EventDate DESC) AS rn
      FROM dwh.ReportFacts
      WHERE Domain = @domain AND EntityCode IN (${codeParams.join(', ')})
    ) latest
    WHERE rn = 1
  `);
  const stockByEntity = new Map(stockResult.recordset.map(r => [r.EntityCode, r.StockQty]));

  // Bước 4 — chỉ giữ thực thể có tồn kho <= ngưỡng. Không có dòng tồn kho
  // nào (chưa từng đồng bộ) -> KHÔNG đủ căn cứ kết luận hết hàng, loại bỏ
  // thay vì coi như 0 (tránh báo sai "hết hàng" cho SKU chưa có dữ liệu).
  const rows = [];
  for (const row of topRows) {
    const stockQty = stockByEntity.get(row.EntityCode);
    if (stockQty === undefined || stockQty === null) continue;
    if (stockQty > threshold) continue;
    rows.push({
      chiNhanh: row.BranchName || row.BranchCode,
      maHang: row.SkuCode,
      tenHang: row.ItemName,
      soLuongBan: row.QtySold,
      tonKho: stockQty
    });
  }

  return { columns: describeColumns(), rows };
}

module.exports = { runTopZeroStockReport, resolveDateRange, RANK_WINDOWS };
