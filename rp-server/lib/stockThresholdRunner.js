// lib/stockThresholdRunner.js — SourceType='stockThreshold': báo cáo "Tồn
// kho theo ngưỡng" (bản 8.68, theo yêu cầu người dùng) — KHÁC 2 báo cáo tồn
// kho=0 đã có (lib/topSellingZeroStockRunner.js/lib/coreZeroStockRunner.js,
// ngưỡng CỐ ĐỊNH = 0, không đổi được) — người xem TỰ CHỌN chiều lọc (tồn
// DƯỚI hay TRÊN 1 mức) VÀ tự nhập mức đó ngay trên bộ lọc (filter kind mới
// 'thresholdNumber', xem rp-user/src/components/FilterForm.jsx), không cần
// sửa DefinitionJson/deploy lại mỗi lần đổi mức muốn xem.
//
// Công thức tồn kho ước tính hôm nay DÙNG LẠI NGUYÊN VẸN công thức đã chốt
// ở lib/topSellingZeroStockRunner.js (qua lib/reportFactsHelpers.js):
//   Tồn ước tính hôm nay = Tồn cuối kỳ NGÀY HÔM QUA (dòng gần nhất TRƯỚC
//   hôm nay trong stockDomain) − Số lượng bán HÔM NAY, KHÔNG cộng lại hàng
//   nhập trong ngày.
//
// Phạm vi dữ liệu theo siêu thị (bản 8.51, filterValues.__storeScope do
// SERVER tự gắn — xem routes/reports.js) — null = "Toàn bộ" (HO), mảng
// MaDiem = CHỈ các siêu thị đó — tự lọc TRỰC TIẾP theo MaChiNhanh (STK_ID),
// KHÁC lib/compositeReportRunner.js (báo cáo đó remap theo mã Điểm trước
// khi lọc) vì báo cáo này vẫn hiển thị Ở CẤP KHO (STK_ID), không gộp lên
// cấp Điểm — xem lib/diemStkMapping.js:resolveStoreScopeStkIds().
//
// DefinitionJson bắt buộc: { stockDomain, salesDomain }. Tuỳ chọn:
// dataSourceId.
// filterValues: { threshold: {mode:'below'|'above', value:number} (mặc
// định {mode:'below', value:1} — tương đương "không còn hàng", khớp hành
// vi ngưỡng=0 của 2 báo cáo tồn=0 cũ), branches: [STK_ID,...] (rỗng = tất
// cả, vẫn phải khớp phạm vi __storeScope nếu có) }.
const { getPool } = require('../db');
const { getPoolForDataSource } = require('./dataSourcePool');
const {
  todayUTC, loadLatestMeasureBefore, loadLatestMeasureWithDate, loadSumOnDate, loadLatestDimensionsForDomain
} = require('./reportFactsHelpers');
const { resolveStoreScopeStkIds } = require('./diemStkMapping');

async function resolvePool(definition) {
  if (definition.dataSourceId) return getPoolForDataSource(definition.dataSourceId);
  return getPool('DWH');
}

function describeColumns() {
  return [
    { key: 'maKho', label: 'Mã kho', width: 0.8 },
    { key: 'tenKho', label: 'Tên kho', width: 1.6 },
    { key: 'maHang', label: 'Mã hàng', width: 0.8 },
    { key: 'tenHang', label: 'Tên hàng', width: 1.6 },
    { key: 'tonKho', label: 'Tồn kho', width: 0.8 },
    { key: 'ngayBanCuoi', label: 'Ngày bán cuối', width: 1 }
  ];
}

function formatDateOnly(value) {
  if (!(value instanceof Date) || Number.isNaN(value.getTime())) return value;
  return value.toISOString().slice(0, 10);
}

function resolveThreshold(filterValues) {
  const raw = filterValues.threshold;
  const mode = raw?.mode === 'above' ? 'above' : 'below';
  const value = Number.isFinite(Number(raw?.value)) ? Number(raw.value) : 1;
  return { mode, value };
}

async function runStockThresholdReport(definition, filterValues = {}) {
  if (!definition.stockDomain || !definition.salesDomain) {
    throw new Error('Báo cáo thiếu cấu hình stockDomain/salesDomain (stockThreshold)');
  }
  const pool = await resolvePool(definition);
  const today = todayUTC();
  const threshold = resolveThreshold(filterValues);
  const branchFilter = Array.isArray(filterValues.branches) ? filterValues.branches.filter(Boolean).map(String) : [];
  const scopeStkIds = await resolveStoreScopeStkIds(filterValues.__storeScope);
  if (scopeStkIds && !scopeStkIds.size) return { columns: describeColumns(), rows: [] };

  // Quét toàn bộ (kho, mã hàng) đang có dữ liệu tồn kho, giữ lại đúng dòng
  // khớp phạm vi siêu thị (nếu có) VÀ bộ lọc "Chi nhánh" (nếu có chọn).
  const stockDims = await loadLatestDimensionsForDomain(pool, definition.stockDomain, ['MaChiNhanh', 'TenChiNhanh', 'MaHangHienThi', 'TenHang']);
  const candidates = [];
  for (const [entityCode, info] of stockDims) {
    const d = info.dimensions;
    if (!d.MaChiNhanh) continue;
    if (scopeStkIds && !scopeStkIds.has(d.MaChiNhanh)) continue;
    if (branchFilter.length && !branchFilter.includes(d.MaChiNhanh)) continue;
    candidates.push({ entityCode, ...d });
  }
  if (!candidates.length) return { columns: describeColumns(), rows: [] };
  const entityCodes = candidates.map(c => c.entityCode);

  const [yesterdayStockByEntity, todaySalesByEntity, lastSaleByEntity] = await Promise.all([
    loadLatestMeasureBefore(pool, definition.stockDomain, entityCodes, 'SoLuongTon', today),
    loadSumOnDate(pool, definition.salesDomain, entityCodes, 'SoLuongBan', today),
    loadLatestMeasureWithDate(pool, definition.salesDomain, entityCodes, 'SoLuongBan')
  ]);

  const rows = [];
  for (const c of candidates) {
    const yesterdayStock = yesterdayStockByEntity.get(c.entityCode);
    if (yesterdayStock === undefined || yesterdayStock === null) continue;
    const todaySales = todaySalesByEntity.get(c.entityCode) || 0;
    const tonKho = yesterdayStock - todaySales;
    if (threshold.mode === 'below' && !(tonKho < threshold.value)) continue;
    if (threshold.mode === 'above' && !(tonKho > threshold.value)) continue;

    const lastSale = lastSaleByEntity.get(c.entityCode);
    rows.push({
      maKho: c.MaChiNhanh,
      tenKho: c.TenChiNhanh || c.MaChiNhanh,
      maHang: c.MaHangHienThi,
      tenHang: c.TenHang,
      tonKho,
      ngayBanCuoi: lastSale ? formatDateOnly(lastSale.eventDate) : null
    });
  }

  return { columns: describeColumns(), rows };
}

module.exports = { runStockThresholdReport };
