// lib/coreZeroStockRunner.js — SourceType='coreZeroStock': báo cáo "Core
// stock = 0" — KHÁC lib/topSellingZeroStockRunner.js ('topZeroStock') ở
// bước CHỌN thực thể: không tự xếp hạng theo doanh số, mà dùng ĐÚNG danh
// sách mặt hàng "Core" cố định (etl.CoreItemList, xem lib/coreItemList.js)
// do admin tự khai/upload — áp dụng CHUNG cho MỌI kho cùng LoaiĐiểm
// (MART/MINIMART), không khai riêng theo từng kho (xác nhận người dùng).
// Công thức tính tồn kho ước tính hôm nay DÙNG LẠI NGUYÊN VẸN công thức đã
// chốt ở topSellingZeroStockRunner.js (qua lib/reportFactsHelpers.js dùng
// chung):
//   Tồn ước tính hôm nay = Tồn cuối kỳ NGÀY HÔM QUA (dòng gần nhất TRƯỚC
//   hôm nay trong stockDomain) − Số lượng bán HÔM NAY, KHÔNG cộng lại hàng
//   nhập trong ngày.
//
// Cột hiển thị KHỚP ĐÚNG khuôn file mẫu "Stock_Core_....xlsx" khách hàng
// đang dùng (Mã điểm/Mã kho/Tên kho/Mã hàng/Tên hàng/Đvt/Mã ngành/Tên
// ngành/Tồn Kho/Ngày bán cuối/Ngày nhập cuối/SL đang đặt/Ngày đặt/Mã đang
// đặt) — xem bc-core-ton-kho-0.md mục "So khớp với file mẫu Excel".
//
// Các bước:
//   1. Nạp bản đầy đủ danh sách Core (MaHang + mh/tenHang/dvt/maNganh/
//      tenNganh tham khảo) của đúng definition.loaiDiem.
//   2. Xác định STK_ID nào thuộc đúng loaiDiem — dùng LẠI dimension "chain"
//      (MART/MINIMART) đã có sẵn ở domain doanh thu chi nhánh
//      (definition.chainDomain, mặc định 'doanhthu_chinhanh'), KHÔNG cần
//      job/VIEW mới (xem bc-core-ton-kho-0.md).
//   3. Quét toàn bộ (kho, mã hàng) đang có dữ liệu tồn kho
//      (definition.stockDomain), giữ lại đúng cặp có STK_ID thuộc bước 2 VÀ
//      MaHangHienThi thuộc bước 1.
//   4. Với đúng các cặp còn lại, tính tồn ước tính theo công thức trên, chỉ
//      giữ <= threshold (mặc định 0).
//   5. TUỲ CHỌN (cấu hình qua DefinitionJson, không hardcode — cùng
//      nguyên tắc "Chờ nhập"/"Đã nhập" ở topSellingZeroStockRunner.js):
//      - lockAllDomain/lockByStoreDomain (measure 'KhoaAll'/'KhoaTheoKho',
//        giá trị = 1 nghĩa là ĐANG khoá) — loại khỏi kết quả, đúng hành vi
//        cột "Khóa All"/"Khóa theo kho" trong file mẫu (export đã pre-filter
//        "Bỏ khóa", nên báo cáo cũng LOẠI HẲN thay vì hiển thị cột 0/1).
//      - pendingOrderDomain (measure 'SoLuongDangDat') — hiển thị thêm
//        "SL đang đặt"/"Ngày đặt" (measure + EventDate của dòng gần nhất)
//        VÀ "Mã đang đặt" (0/1, tự suy ra từ SL đang đặt > 0) — THUẦN THAM
//        KHẢO, không ảnh hưởng việc lọc tồn=0.
//      - lastReceivedDomain (measure 'SoLuongDaNhap') — hiển thị thêm
//        "Ngày nhập cuối" (EventDate của dòng gần nhất, KHÔNG giới hạn
//        "hôm nay" — khác 4 domain "Đã nhập hôm nay" ở topZeroStock).
//   6. "Ngày bán cuối" LUÔN hiển thị (không tuỳ chọn, đọc từ
//      definition.salesDomain đã bắt buộc cấu hình) — ngày gần nhất mặt
//      hàng đó CÓ bán tại đúng kho, không giới hạn khoảng thời gian.
//   7. "Mã điểm" (BU_ID dùng trong file chỉ tiêu, KHÁC "Mã kho"/STK_ID) —
//      TUỲ CHỌN, tự tra ngược qua "Ánh xạ Điểm - STK_ID" đã có sẵn
//      (lib/diemStkMapping.js, dùng lại NGUYÊN VẸN, không cần job/cấu hình
//      thêm) — STK_ID nào CHƯA khai ánh xạ thì để trống, không phải lỗi.
//
// DefinitionJson bắt buộc: { loaiDiem: 'MART'|'MINIMART', stockDomain,
// salesDomain, chainDomain }. Tuỳ chọn: threshold (mặc định 0), dataSourceId,
// lockAllDomain, lockByStoreDomain, pendingOrderDomain, lastReceivedDomain.
//
// filterValues: { branches: [STK_ID,...] (rỗng/bỏ trống = tất cả STK_ID
// thuộc đúng loaiDiem) }.
const { getPool } = require('../db');
const { getPoolForDataSource } = require('./dataSourcePool');
const {
  todayUTC, loadLatestMeasureBefore, loadLatestMeasure, loadLatestMeasureWithDate,
  loadSumOnDate, loadLatestDimensionsForDomain
} = require('./reportFactsHelpers');
const { loadCoreItemListMap } = require('./coreItemList');
const { loadDiemStkMapping } = require('./diemStkMapping');

async function resolvePool(definition) {
  if (definition.dataSourceId) return getPoolForDataSource(definition.dataSourceId);
  return getPool('DWH');
}

function describeColumns(definition) {
  const columns = [
    { key: 'maDiem', label: 'Mã điểm', width: 0.8 },
    { key: 'maKho', label: 'Mã kho', width: 0.8 },
    { key: 'tenKho', label: 'Tên kho', width: 1.6 },
    { key: 'maHang', label: 'Mã hàng', width: 0.8 },
    { key: 'tenHang', label: 'Tên hàng', width: 1.6 },
    { key: 'dvt', label: 'Đvt', width: 0.6 },
    { key: 'maNganh', label: 'Mã ngành', width: 0.8 },
    { key: 'tenNganh', label: 'Tên ngành', width: 1.4 },
    { key: 'tonKho', label: 'Tồn Kho', width: 0.8 },
    { key: 'ngayBanCuoi', label: 'Ngày bán cuối', width: 1 }
  ];
  if (definition.lastReceivedDomain) columns.push({ key: 'ngayNhapCuoi', label: 'Ngày nhập cuối', width: 1 });
  if (definition.pendingOrderDomain) {
    columns.push({ key: 'slDangDat', label: 'SL đang đặt', width: 0.8 });
    columns.push({ key: 'ngayDat', label: 'Ngày đặt', width: 0.9 });
    columns.push({ key: 'maDangDat', label: 'Mã đang đặt', width: 0.7 });
  }
  return columns;
}

// "Ngày ..." chỉ mang ý nghĩa NGÀY (không có giờ) — EventDate từ SQL Server
// trả về kèm giờ 00:00:00, để nguyên object Date thì Excel/PDF in ra cả
// "Thu Sep 24 2026 00:00:00" (xem lib/exportPdf.js — không tự định dạng lại
// Date), ở đây format sẵn thành "YYYY-MM-DD" cho dễ đọc.
function formatDateOnly(value) {
  if (!(value instanceof Date) || Number.isNaN(value.getTime())) return value;
  return value.toISOString().slice(0, 10);
}

// STK_ID (Mã kho) -> Mã điểm (BU_ID) — tra NGƯỢC "Ánh xạ Điểm - STK_ID" đã
// có sẵn (ưu tiên maStkMoi — kho ĐANG dùng hiện tại). Không tìm thấy -> để
// trống, KHÔNG coi là lỗi (không phải kho nào cũng cần khai ánh xạ này nếu
// không dùng báo cáo LDTD/HCRC).
async function buildStkToDiemMap() {
  const diemMapping = await loadDiemStkMapping();
  const stkToDiem = new Map();
  for (const [maDiem, info] of diemMapping) {
    for (const stk of info.maStkMoi) stkToDiem.set(stk, maDiem);
  }
  return stkToDiem;
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
  const coreMap = await loadCoreItemListMap(loaiDiem);
  if (!coreMap.size) return { columns: describeColumns(definition), rows: [] };

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
    if (!d.MaHangHienThi || !coreMap.has(d.MaHangHienThi)) continue;
    candidates.push({ entityCode, ...d, coreRef: coreMap.get(d.MaHangHienThi) });
  }
  if (!candidates.length) return { columns: describeColumns(definition), rows: [] };
  const entityCodes = candidates.map(c => c.entityCode);

  // Bước 7 — tra ngược Mã điểm, độc lập với các bước còn lại (không phụ
  // thuộc entityCodes, quét theo STK_ID).
  const stkToDiem = await buildStkToDiemMap();

  // Bước 4 — Y HỆT công thức đã chốt ở topSellingZeroStockRunner.js.
  const [yesterdayStockByEntity, todaySalesByEntity] = await Promise.all([
    loadLatestMeasureBefore(pool, definition.stockDomain, entityCodes, 'SoLuongTon', today),
    loadSumOnDate(pool, definition.salesDomain, entityCodes, 'SoLuongBan', today)
  ]);

  // Bước 5+6 (tuỳ chọn).
  const [lockAllByEntity, lockByStoreByEntity, pendingOrderByEntity, lastReceivedByEntity, lastSaleByEntity] = await Promise.all([
    definition.lockAllDomain ? loadLatestMeasure(pool, definition.lockAllDomain, entityCodes, 'KhoaAll') : Promise.resolve(new Map()),
    definition.lockByStoreDomain ? loadLatestMeasure(pool, definition.lockByStoreDomain, entityCodes, 'KhoaTheoKho') : Promise.resolve(new Map()),
    definition.pendingOrderDomain ? loadLatestMeasureWithDate(pool, definition.pendingOrderDomain, entityCodes, 'SoLuongDangDat') : Promise.resolve(new Map()),
    definition.lastReceivedDomain ? loadLatestMeasureWithDate(pool, definition.lastReceivedDomain, entityCodes, 'SoLuongDaNhap') : Promise.resolve(new Map()),
    loadLatestMeasureWithDate(pool, definition.salesDomain, entityCodes, 'SoLuongBan')
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
    const lastReceived = lastReceivedByEntity.get(c.entityCode);
    const lastSale = lastSaleByEntity.get(c.entityCode);
    rows.push({
      maDiem: stkToDiem.get(c.MaChiNhanh) || null,
      maKho: c.MaChiNhanh,
      tenKho: c.TenChiNhanh || c.MaChiNhanh,
      maHang: c.MaHangHienThi,
      tenHang: c.TenHang,
      dvt: c.coreRef.dvt || null,
      maNganh: c.coreRef.maNganh || null,
      tenNganh: c.coreRef.tenNganh || null,
      tonKho: estimatedStock,
      ngayBanCuoi: lastSale ? formatDateOnly(lastSale.eventDate) : null,
      ...(definition.lastReceivedDomain ? {
        ngayNhapCuoi: lastReceived ? formatDateOnly(lastReceived.eventDate) : null
      } : {}),
      ...(definition.pendingOrderDomain ? {
        slDangDat: pendingOrder ? pendingOrder.value : null,
        ngayDat: pendingOrder ? formatDateOnly(pendingOrder.eventDate) : null,
        maDangDat: pendingOrder && pendingOrder.value > 0 ? 1 : 0
      } : {})
    });
  }

  return { columns: describeColumns(definition), rows };
}

module.exports = { runCoreZeroStockReport };
