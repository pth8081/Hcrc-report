// lib/stockAlertRunner.js — SourceType='stockAlert': báo cáo "Cảnh báo hàng
// tồn" (bản 8.68, theo yêu cầu người dùng) — đối chiếu tồn kho THẬT với
// NGƯỠNG RIÊNG cho từng cặp (Mã hàng, Siêu thị) do admin tự khai/upload
// (etl.StockAlertThresholds, etl-admin → "Cảnh báo hàng tồn") — KHÁC hẳn
// lib/stockThresholdRunner.js (1 ngưỡng CHUNG áp cho mọi mặt hàng, người
// xem tự chọn lúc chạy báo cáo) và lib/coreZeroStockRunner.js (ngưỡng
// chung=0, danh sách Core cố định). Mã hàng/siêu thị nào CHƯA khai ngưỡng ở
// trên thì KHÔNG được theo dõi — không mặc định tính ngưỡng nào.
//
// Vì EntityCode của domain tồn kho (dwh.ReportFacts, xem bc-ton-kho-0.md)
// ghép từ STK_ID + SKU_ID (mã nội bộ), KHÔNG PHẢI STK_ID + MaHang (mã hiển
// thị) — không tự dựng lại EntityCode từ (MaHang, MaDiem) được — PHẢI quét
// toàn bộ domain tồn kho (như lib/coreZeroStockRunner.js) rồi đối chiếu
// NGƯỢC theo (MaChiNhanh, MaHangHienThi).
//
// Công thức tồn kho ước tính hôm nay DÙNG LẠI NGUYÊN VẸN công thức đã chốt
// ở lib/topSellingZeroStockRunner.js — xem lib/reportFactsHelpers.js.
//
// Phạm vi dữ liệu theo siêu thị (bản 8.51, filterValues.__storeScope do
// SERVER tự gắn) — lọc NGAY TỪ DANH SÁCH NGƯỠNG theo MaDiem (khớp đúng cấp
// lưu trong etl.StockAlertThresholds, không cần quy đổi qua STK_ID trước
// như lib/stockThresholdRunner.js).
//
// DefinitionJson bắt buộc: { stockDomain, salesDomain }. Tuỳ chọn:
// dataSourceId.
// filterValues: { branches: [STK_ID,...] (rỗng = tất cả) }.
const { getPool } = require('../db');
const { getPoolForDataSource } = require('./dataSourcePool');
const {
  todayUTC, loadLatestMeasureBefore, loadSumOnDate, loadLatestDimensionsForDomain
} = require('./reportFactsHelpers');
const { loadDiemStkMapping } = require('./diemStkMapping');
const { loadStockAlertThresholds } = require('./stockAlertThresholds');

async function resolvePool(definition) {
  if (definition.dataSourceId) return getPoolForDataSource(definition.dataSourceId);
  return getPool('DWH');
}

function describeColumns() {
  return [
    { key: 'maKho', label: 'Mã kho', width: 0.8 },
    { key: 'tenKho', label: 'Tên kho', width: 1.6 },
    { key: 'maDiem', label: 'Siêu thị (Mã điểm)', width: 0.9 },
    { key: 'maHang', label: 'Mã hàng', width: 0.8 },
    { key: 'tenHang', label: 'Tên hàng', width: 1.6 },
    { key: 'nhaCungCap', label: 'Nhà cung cấp', width: 1.2 },
    { key: 'tonKho', label: 'Tồn kho', width: 0.8 },
    { key: 'nguongCanhBao', label: 'Ngưỡng cảnh báo', width: 0.9 }
  ];
}

async function runStockAlertReport(definition, filterValues = {}) {
  if (!definition.stockDomain || !definition.salesDomain) {
    throw new Error('Báo cáo thiếu cấu hình stockDomain/salesDomain (stockAlert)');
  }
  const storeScope = filterValues.__storeScope;
  const branchFilter = Array.isArray(filterValues.branches) ? filterValues.branches.filter(Boolean).map(String) : [];

  // Bước 1 — nạp ngưỡng đã khai, lọc theo phạm vi siêu thị NGAY Ở CẤP MaDiem
  // (trước khi quy đổi STK_ID, khác stockThresholdRunner).
  let thresholdRows = await loadStockAlertThresholds();
  if (storeScope) {
    const scopeSet = new Set(storeScope);
    thresholdRows = thresholdRows.filter(r => scopeSet.has(r.maDiem));
  }
  if (!thresholdRows.length) return { columns: describeColumns(), rows: [] };

  // Bước 2 — quy đổi MaDiem -> (các) STK_ID thật, dựng lookup
  // "STK_ID|MaHang" -> dòng ngưỡng (1 MaDiem có thể khớp NHIỀU STK_ID nếu
  // siêu thị đó gộp nhiều kho ảo — hiếm nhưng không loại trừ, xem
  // lib/diemStkMapping.js).
  const diemMapping = await loadDiemStkMapping();
  const thresholdByStkAndHang = new Map();
  const maDiemByStk = new Map();
  for (const t of thresholdRows) {
    const info = diemMapping.get(t.maDiem);
    if (!info) continue; // MaDiem chưa khai ở "Ánh xạ Điểm - STK_ID" -> bỏ qua, không phải lỗi
    for (const stk of info.maStkMoi) {
      if (branchFilter.length && !branchFilter.includes(stk)) continue;
      thresholdByStkAndHang.set(`${stk}|${t.maHang}`, t);
      maDiemByStk.set(stk, t.maDiem);
    }
  }
  if (!thresholdByStkAndHang.size) return { columns: describeColumns(), rows: [] };

  // Bước 3 — quét toàn bộ domain tồn kho, giữ lại đúng cặp (kho, mã hàng)
  // CÓ khai ngưỡng ở bước 2.
  const pool = await resolvePool(definition);
  const stockDims = await loadLatestDimensionsForDomain(pool, definition.stockDomain, ['MaChiNhanh', 'TenChiNhanh', 'MaHangHienThi', 'TenHang']);
  const candidates = [];
  for (const [entityCode, info] of stockDims) {
    const d = info.dimensions;
    if (!d.MaChiNhanh || !d.MaHangHienThi) continue;
    const threshold = thresholdByStkAndHang.get(`${d.MaChiNhanh}|${d.MaHangHienThi}`);
    if (!threshold) continue;
    candidates.push({ entityCode, ...d, threshold });
  }
  if (!candidates.length) return { columns: describeColumns(), rows: [] };
  const entityCodes = candidates.map(c => c.entityCode);

  // Bước 4 — Y HỆT công thức đã chốt ở topSellingZeroStockRunner.js.
  const today = todayUTC();
  const [yesterdayStockByEntity, todaySalesByEntity] = await Promise.all([
    loadLatestMeasureBefore(pool, definition.stockDomain, entityCodes, 'SoLuongTon', today),
    loadSumOnDate(pool, definition.salesDomain, entityCodes, 'SoLuongBan', today)
  ]);

  const rows = [];
  for (const c of candidates) {
    const yesterdayStock = yesterdayStockByEntity.get(c.entityCode);
    if (yesterdayStock === undefined || yesterdayStock === null) continue;
    const todaySales = todaySalesByEntity.get(c.entityCode) || 0;
    const tonKho = yesterdayStock - todaySales;
    if (!(tonKho < c.threshold.nguongCanhBao)) continue;

    rows.push({
      maKho: c.MaChiNhanh,
      tenKho: c.TenChiNhanh || c.MaChiNhanh,
      maDiem: maDiemByStk.get(c.MaChiNhanh) || c.threshold.maDiem,
      maHang: c.MaHangHienThi,
      tenHang: c.threshold.tenHang || c.TenHang,
      nhaCungCap: c.threshold.nhaCungCap,
      tonKho,
      nguongCanhBao: c.threshold.nguongCanhBao
    });
  }

  return { columns: describeColumns(), rows };
}

module.exports = { runStockAlertReport };
