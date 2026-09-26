// lib/coreZeroStockRunner.js — SourceType='coreZeroStock': báo cáo "Core
// stock = 0" — KHÁC lib/topSellingZeroStockRunner.js ('topZeroStock') ở
// bước CHỌN thực thể: không tự xếp hạng theo doanh số, mà dùng ĐÚNG danh
// sách mặt hàng "Core" (etl.CoreItemList, xem lib/coreItemList.js) do admin
// tự khai/upload — áp dụng CHUNG cho MỌI kho cùng LoaiDiem (MART/MINIMART),
// không khai riêng theo từng kho (xác nhận người dùng). Công thức tính tồn
// kho ước tính hôm nay DÙNG LẠI NGUYÊN VẸN công thức đã chốt ở
// topSellingZeroStockRunner.js (qua lib/reportFactsHelpers.js dùng chung):
//   Tồn ước tính hôm nay = Tồn cuối kỳ NGÀY HÔM QUA (dòng gần nhất TRƯỚC
//   hôm nay trong stockDomain) − Số lượng bán HÔM NAY, KHÔNG cộng lại hàng
//   nhập trong ngày.
//
// Các bước:
//   1. Nạp tập MaHang thuộc Core của đúng definition.loaiDiem.
//   2. Xác định STK_ID nào thuộc đúng loaiDiem — dùng LẠI dimension "chain"
//      (MART/MINIMART) đã có sẵn ở domain doanh thu chi nhánh
//      (definition.chainDomain, mặc định 'doanhthu_chinhanh'), KHÔNG cần
//      job/VIEW mới (xem hướng_dẫn_báo_cáo.md mục 1 — Dimensions "chain").
//   3. Quét toàn bộ (kho, mã hàng) đang có dữ liệu tồn kho
//      (definition.stockDomain), giữ lại đúng cặp có STK_ID thuộc bước 2 VÀ
//      MaHangHienThi thuộc bước 1.
//   4. Với đúng các cặp còn lại, tính tồn ước tính theo công thức trên, chỉ
//      giữ <= threshold (mặc định 0).
//   5. TUỲ CHỌN (cấu hình qua DefinitionJson, không hardcode — cùng
//      nguyên tắc "Chờ nhập"/"Đã nhập" ở topSellingZeroStockRunner.js):
//      - lockAllDomain/lockByStoreDomain (measure 'KhoaAll'/'KhoaTheoKho',
//        giá trị = 1 nghĩa là ĐANG khoá) — loại khỏi kết quả, đúng hành vi
//        cột "Khóa All"/"Khóa theo kho" trong file mẫu người dùng cung cấp.
//      - pendingOrderDomain (measure 'SoLuongDangDat') — hiển thị thêm
//        "SL đang đặt"/"Ngày đặt" (measure + EventDate của dòng gần nhất),
//        THUẦN THAM KHẢO, không ảnh hưởng việc lọc tồn=0.
//
// DefinitionJson bắt buộc: { loaiDiem: 'MART'|'MINIMART', stockDomain,
// salesDomain, chainDomain }. Tuỳ chọn: threshold (mặc định 0), dataSourceId,
// lockAllDomain, lockByStoreDomain, pendingOrderDomain.
//
// filterValues: { branches: [STK_ID,...] (rỗng/bỏ trống = tất cả STK_ID
// thuộc đúng loaiDiem) }.
const { getPool } = require('../db');
const { getPoolForDataSource } = require('./dataSourcePool');
const {
  todayUTC, loadLatestMeasureBefore, loadLatestMeasure, loadLatestMeasureWithDate,
  loadSumOnDate, loadLatestDimensionsForDomain
} = require('./reportFactsHelpers');
const { loadCoreMaHangSet } = require('./coreItemList');

async function resolvePool(definition) {
  if (definition.dataSourceId) return getPoolForDataSource(definition.dataSourceId);
  return getPool('DWH');
}

function describeColumns(definition) {
  const columns = [
    { key: 'chiNhanh', label: 'Chi nhánh', width: 1.6 },
    { key: 'maHang', label: 'Mã hàng', width: 0.8 },
    { key: 'tenHang', label: 'Tên hàng', width: 1.6 },
    { key: 'tonKho', label: 'Tồn kho hiện tại', width: 1 }
  ];
  if (definition.pendingOrderDomain) {
    columns.push({ key: 'slDangDat', label: 'SL đang đặt', width: 0.9 });
    columns.push({ key: 'ngayDat', label: 'Ngày đặt', width: 0.9 });
  }
  return columns;
}

async function runCoreZeroStockReport(definition, filterValues = {}) {
  if (!definition.loaiDiem || !definition.stockDomain || !definition.salesDomain || !definition.chainDomain) {
    throw new Error('Báo cáo thiếu cấu hình loaiDiem/stockDomain/salesDomain/chainDomain (coreZeroStock)');
  }
  const loaiDiem = String(definition.loaiDiem).toUpperCase();
  const pool = await resolvePool(definition);
  const threshold = Number.isFinite(Number(definition.threshold)) ? Number(definition.threshold) : 0;
  const today = todayUTC();
  const branchFilter = Array.isArray(filterValues.branches) ? filterValues.branches.filter(Boolean).map(String) : [];

  // Bước 1.
  const coreMaHangSet = await loadCoreMaHangSet(loaiDiem);
  if (!coreMaHangSet.size) return { columns: describeColumns(definition), rows: [] };

  // Bước 2.
  const chainByEntity = await loadLatestDimensionsForDomain(pool, definition.chainDomain, ['chain']);
  const eligibleStk = new Set();
  for (const [entityCode, info] of chainByEntity) {
    if (String(info.dimensions.chain || '').toUpperCase() === loaiDiem) eligibleStk.add(entityCode);
  }
  const effectiveEligibleStk = branchFilter.length
    ? new Set(branchFilter.filter(stk => eligibleStk.has(stk)))
    : eligibleStk;
  if (!effectiveEligibleStk.size) return { columns: describeColumns(definition), rows: [] };

  // Bước 3.
  const stockDims = await loadLatestDimensionsForDomain(pool, definition.stockDomain, ['MaChiNhanh', 'TenChiNhanh', 'MaHangHienThi', 'TenHang']);
  const candidates = [];
  for (const [entityCode, info] of stockDims) {
    const d = info.dimensions;
    if (!d.MaChiNhanh || !effectiveEligibleStk.has(d.MaChiNhanh)) continue;
    if (!d.MaHangHienThi || !coreMaHangSet.has(d.MaHangHienThi)) continue;
    candidates.push({ entityCode, ...d });
  }
  if (!candidates.length) return { columns: describeColumns(definition), rows: [] };
  const entityCodes = candidates.map(c => c.entityCode);

  // Bước 4 — Y HỆT công thức đã chốt ở topSellingZeroStockRunner.js.
  const [yesterdayStockByEntity, todaySalesByEntity] = await Promise.all([
    loadLatestMeasureBefore(pool, definition.stockDomain, entityCodes, 'SoLuongTon', today),
    loadSumOnDate(pool, definition.salesDomain, entityCodes, 'SoLuongBan', today)
  ]);

  // Bước 5 (tuỳ chọn).
  const [lockAllByEntity, lockByStoreByEntity, pendingOrderByEntity] = await Promise.all([
    definition.lockAllDomain ? loadLatestMeasure(pool, definition.lockAllDomain, entityCodes, 'KhoaAll') : Promise.resolve(new Map()),
    definition.lockByStoreDomain ? loadLatestMeasure(pool, definition.lockByStoreDomain, entityCodes, 'KhoaTheoKho') : Promise.resolve(new Map()),
    definition.pendingOrderDomain ? loadLatestMeasureWithDate(pool, definition.pendingOrderDomain, entityCodes, 'SoLuongDangDat') : Promise.resolve(new Map())
  ]);

  const rows = [];
  for (const c of candidates) {
    const yesterdayStock = yesterdayStockByEntity.get(c.entityCode);
    if (yesterdayStock === undefined || yesterdayStock === null) continue;
    const todaySales = todaySalesByEntity.get(c.entityCode) || 0;
    const estimatedStock = yesterdayStock - todaySales;
    if (estimatedStock > threshold) continue;
    if (lockAllByEntity.get(c.entityCode) === 1) continue;
    if (lockByStoreByEntity.get(c.entityCode) === 1) continue;

    const pendingOrder = pendingOrderByEntity.get(c.entityCode);
    rows.push({
      chiNhanh: c.TenChiNhanh || c.MaChiNhanh,
      maHang: c.MaHangHienThi,
      tenHang: c.TenHang,
      tonKho: estimatedStock,
      ...(definition.pendingOrderDomain ? {
        slDangDat: pendingOrder ? pendingOrder.value : null,
        ngayDat: pendingOrder ? pendingOrder.eventDate : null
      } : {})
    });
  }

  return { columns: describeColumns(definition), rows };
}

module.exports = { runCoreZeroStockReport };
