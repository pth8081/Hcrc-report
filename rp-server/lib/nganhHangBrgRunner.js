// lib/nganhHangBrgRunner.js — SourceType='nganhHangBrg': báo cáo "Doanh
// thu, lãi gộp theo ngành hàng" theo ĐÚNG mẫu Excel BRGMART người dùng gửi
// (bản 9.63, theo yêu cầu người dùng). RIÊNG so với báo cáo gốc "Doanh thu
// theo ngành hàng" (SourceType='composite', seedNganhHangReports.js) vì
// CHIA 3 KHỐI LẶP LẠI "Toàn hệ thống BRG" / "LFL" / "NSO" từ CÙNG 1 lần đọc
// domain — composite chỉ ghép ĐÚNG 1 dòng/entityCode, không tự nhân bản
// theo nhóm siêu thị, nên viết runner RIÊNG (mirror
// lib/purchaseOrderRunner.js: dedicated runner cho báo cáo có hình dạng
// đặc thù, TÁI DÙNG các hàm đọc/gộp dữ liệu đã có ở
// lib/compositeReportRunner.js, KHÔNG viết lại logic đọc dwh.ReportFacts).
//
// 3 KHỐI:
//   - "Toàn hệ thống BRG" — CỘNG DỒN MỌI siêu thị (không lọc gì).
//   - "LFL" ("Like For Like", siêu thị ỔN ĐỊNH) — siêu thị KHÔNG có trong
//     danh sách "Siêu thị NSO" (etl.NsoStores, xem lib/nsoStores.js).
//   - "NSO" ("New Store Opening", siêu thị MỚI MỞ) — siêu thị CÓ trong
//     danh sách đó.
// Phân loại qua STK_ID (dimension của domain doanh thu) -> mã Điểm (qua
// "Ánh xạ Điểm - STK_ID", lib/diemStkMapping.js:buildStkIdLookup()) -> đối
// chiếu danh sách NSO. STK_ID KHÔNG tra được mã Điểm (chưa khai ánh xạ) MẶC
// ĐỊNH rơi vào khối LFL (an toàn hơn loại hẳn khỏi cả 2 khối con, dù vẫn
// luôn có trong khối "Toàn hệ thống BRG").
//
// "Giá trị hàng hỏng hủy"/"Doanh thu cuối" CHỈ hiện ở khối "Toàn hệ thống
// BRG" (theo xác nhận của người dùng) — nguồn `hanghonghuy_nganhhang`
// (xem etl/scripts/seedHangHongHuySync.js) KHÔNG có cột kho/siêu thị nào,
// không tách được riêng cho khối LFL/NSO.
//
// "Khối" là 1 CỘT THƯỜNG (không phải dòng tiêu đề colSpan riêng) — hệ
// thống hiện CHƯA có cơ chế dòng tiêu đề nhóm (colSpan) trong phần thân
// bảng (DataTable.jsx/exportExcel.js/exportPdf.js CHỈ hỗ trợ colSpan ở
// HEADER qua columnGroups, xem chú thích đầu lib/compositeReportRunner.js)
// — dùng cột "Khối" + dòng "Tổng cộng" riêng từng khối (đánh dấu
// __isSubtotal, cột TT tự đếm lại từ 1 sau mỗi dòng đó — xem
// lib/reportCellFormat.js:computeSttValues()) để KHÔNG phải sửa 3 file
// hiển thị/xuất dùng chung cho nhiều báo cáo khác.
//
// Bán lẻ/Bán buôn (Total/Bán lẻ/Bán buôn theo mẫu gốc) TẠM CHƯA LÀM — nguồn
// dữ liệu DSMART chưa xác nhận cột/cờ phân biệt 2 kênh này (theo người
// dùng). Thêm sau chỉ cần sửa CHÍNH FILE NÀY (tách measures theo kênh),
// KHÔNG cần đổi hạ tầng columnGroups (v1 chỉ cần 2 tầng tiêu đề, cơ chế đã
// có sẵn — xem lib/reportCellFormat.js/DataTable.jsx).
const { getPool } = require('../db');
const {
  fetchAllReportRows, remapEntityCode, aggregateDailyRowsByEntity, resolveRequestedRange
} = require('./compositeReportRunner');
const { runSalesTargetsBlockRange } = require('./salesTargetsReader');
const { loadDiemStkMapping, buildStkIdLookup } = require('./diemStkMapping');
const { loadNsoMaDiemSet } = require('./nsoStores');
const { describeColumns } = require('./reportEngine');
const { assignSttIfPresent } = require('./reportCellFormat');

const DOANHTHU_DOMAIN = 'doanhthu_nganhhang';
const HONGHUY_DOMAIN = 'hanghonghuy_nganhhang';
const TARGET_DOMAIN = 'sales-targets-nganhhang-dt-brgmart';

// Danh mục 12 ngành hàng CỐ ĐỊNH, ĐÚNG thứ tự mã tăng dần — khớp mẫu Excel
// BRGMART người dùng gửi. Hiện ĐỦ cả 12 dòng mỗi khối dù ngành hàng đó
// KHÔNG phát sinh dữ liệu trong kỳ (Thực đạt = 0), không ẩn dòng — đúng bố
// cục mẫu gốc (danh mục ngành hàng cố định của công ty, không tự xếp theo
// dữ liệu như đa số báo cáo khác trong hệ thống).
const NGANH_HANG_LIST = [
  { code: '1001', name: 'UltraFresh' },
  { code: '1002', name: 'Fresh' },
  { code: '2001', name: 'Bánh kẹo sữa thạch' },
  { code: '2002', name: 'Đồ uống, thuốc lá' },
  { code: '2003', name: 'Thực phẩm công nghệ' },
  { code: '2004', name: 'Nông sản, bột các loại' },
  { code: '2005', name: 'Mỹ phẩm (Cosmetic)' },
  { code: '2006', name: 'Hóa phẩm (Chemical)' },
  { code: '2007', name: 'Giấy và bông (Tissue and diaper)' },
  { code: '3001', name: 'Quần áo, giày dép, bông vải sợi' },
  { code: '3002', name: 'Gia dụng, VPP, đồ chơi' },
  { code: '3003', name: 'Other Nonfood' }
];

const COLUMNS = [
  { key: 'stt', label: 'TT' },
  { key: 'khoi', label: 'Khối' },
  { key: 'maNganhHang', label: 'Mã ngành hàng' },
  { key: 'tenNganhHang', label: 'Ngành hàng', width: 2 },
  { key: 'chiTieu', label: 'Chỉ tiêu', width: 1.2 },
  { key: 'thucDat', label: 'Thực đạt', width: 1.2 },
  { key: 'tyLeDat', label: '% so chỉ tiêu', format: 'percent', width: 0.9 },
  { key: 'cungKyPct', label: '% so cùng kỳ năm trước', format: 'percent', width: 0.9 },
  { key: 'giaTriHongHuy', label: 'Giá trị hàng hỏng hủy', width: 1.2 },
  { key: 'doanhThuCuoi', label: 'Doanh thu cuối', width: 1.2 },
  { key: 'tyLeLaiGop', label: 'Tỷ lệ', format: 'percent', width: 0.9 },
  { key: 'giaTriLaiGop', label: 'Giá trị', width: 1.2 },
  { key: 'tyLeLaiGopSoChiTieu', label: '% so chỉ tiêu', format: 'percent', width: 0.9 },
  { key: 'laiGopCungKyPct', label: '% so cùng kỳ năm trước', format: 'percent', width: 0.9 }
];

const COLUMN_GROUPS = [
  { label: 'Doanh thu', color: 'green', keys: ['chiTieu', 'thucDat', 'tyLeDat', 'cungKyPct'] },
  { label: 'Lãi gộp', color: 'orange', keys: ['tyLeLaiGop', 'giaTriLaiGop', 'tyLeLaiGopSoChiTieu', 'laiGopCungKyPct'] }
];
// Cột đơn lẻ không thuộc nhóm nào (tô màu riêng, cùng cơ chế "Trung bình
// GD"/"Doanh thu/m2" ở báo cáo doanh thu cuối ngày) — xem
// lib/reportCellFormat.js:resolveStandaloneColumnColor().
const STANDALONE_COLUMN_COLORS = { giaTriHongHuy: 'red', doanhThuCuoi: 'blue' };

function round1(n) {
  return Math.round(n * 10) / 10;
}

// Dịch (dateStr ISO yyyy-mm-dd, năm) -> cùng ngày/tháng năm TRƯỚC (29/02 ->
// 28/02 nếu năm đích không nhuận) — bản rút gọn CHỈ cho offset = -1, mirror
// ĐÚNG ý nghĩa shiftYears() ở lib/compositeReportRunner.js (không export
// hàm đó, viết lại y hệt logic cho 1 trường hợp dùng ở đây).
function shiftYearMinus1(dateStr) {
  const [y, m, d] = dateStr.split('-').map(Number);
  const targetYear = y - 1;
  const isLeap = (yr) => (yr % 4 === 0 && yr % 100 !== 0) || yr % 400 === 0;
  const day = (m === 2 && d === 29 && !isLeap(targetYear)) ? 28 : d;
  return `${targetYear}-${String(m).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

function firstOfMonth(dateStr) {
  return `${dateStr.slice(0, 7)}-01`;
}

// Gộp mảng rows (đã qua aggregateDailyRowsByEntity) theo DEPT_ID, LỌC
// TRƯỚC theo tập STK_ID cho đúng khối (null = không lọc, "Toàn hệ thống
// BRG") — trả về Map<DEPT_ID, {dimensions, measures}>.
function groupByDeptId(rows, stkIdFilterSet) {
  const filtered = stkIdFilterSet
    ? rows.filter(r => stkIdFilterSet.has(String(r.dimensions?.STK_ID)))
    : rows;
  const grouped = remapEntityCode(filtered, { field: 'DEPT_ID' }, {});
  return new Map(grouped.map(r => [r.entityCode, r]));
}

function buildSegmentRows(khoi, currentMap, lastYearMap, targetMap, hongHuyByName, includeHongHuy) {
  const rows = [];
  const totals = {
    chiTieu: 0, thucDat: 0, giaTriHongHuy: 0, doanhThuCuoi: 0, giaTriLaiGop: 0,
    hasChiTieu: false, lastYearThucDat: 0, hasLastYear: false, chiTieuLaiGop: 0, hasChiTieuLaiGop: false,
    lastYearLaiGop: 0, hasLastYearLaiGop: false
  };

  for (const item of NGANH_HANG_LIST) {
    const current = currentMap.get(item.code);
    const lastYear = lastYearMap.get(item.code);
    const target = targetMap.get(item.code);

    const thucDat = current?.measures?.DoanhThu || 0;
    const giaTriLaiGop = current?.measures?.LaiGop || 0;
    const chiTieu = target?.ChiTieuDoanhThu;
    const chiTieuLaiGop = target?.ChiTieuLaiGop;
    const lastYearThucDat = lastYear?.measures?.DoanhThu;
    const lastYearLaiGop = lastYear?.measures?.LaiGop;

    const giaTriHongHuy = includeHongHuy ? (hongHuyByName.get(item.name.trim()) || 0) : null;
    const doanhThuCuoi = includeHongHuy ? (thucDat - (giaTriHongHuy || 0)) : null;
    // "Tỷ lệ" lãi gộp PHẢI tính trên DOANH THU CUỐI (= Thực đạt - Giá trị
    // hàng hỏng hủy), KHÔNG tính trên Thực đạt thô (theo yêu cầu người
    // dùng, bản 9.64 — sửa lại bản 9.63 ban đầu tính nhầm theo Thực đạt).
    // Khối "LFL"/"NSO" KHÔNG có khái niệm "Doanh thu cuối" riêng (hàng
    // hỏng hủy không tách được theo siêu thị, xem đầu file) — coi như
    // hàng hỏng hủy = 0 ở 2 khối đó, dùng LẠI Thực đạt làm mẫu số (đúng
    // bằng "Doanh thu cuối" nếu hàng hỏng hủy = 0).
    const laiGopBase = includeHongHuy ? doanhThuCuoi : thucDat;

    const tyLeDat = (chiTieu != null && chiTieu !== 0) ? round1(thucDat / chiTieu * 100) : null;
    const cungKyPct = (lastYearThucDat != null && lastYearThucDat !== 0) ? round1(thucDat / lastYearThucDat * 100) : null;
    const tyLeLaiGop = laiGopBase ? round1(giaTriLaiGop / laiGopBase * 100) : null;
    const tyLeLaiGopSoChiTieu = (chiTieuLaiGop != null && chiTieuLaiGop !== 0) ? round1(giaTriLaiGop / chiTieuLaiGop * 100) : null;
    const laiGopCungKyPct = (lastYearLaiGop != null && lastYearLaiGop !== 0) ? round1(giaTriLaiGop / lastYearLaiGop * 100) : null;

    rows.push({
      khoi, maNganhHang: item.code,
      tenNganhHang: current?.dimensions?.TenNganhHang || lastYear?.dimensions?.TenNganhHang || item.name,
      chiTieu: chiTieu ?? null, thucDat, tyLeDat, cungKyPct,
      giaTriHongHuy, doanhThuCuoi,
      tyLeLaiGop, giaTriLaiGop, tyLeLaiGopSoChiTieu, laiGopCungKyPct
    });

    totals.thucDat += thucDat;
    totals.giaTriLaiGop += giaTriLaiGop;
    if (chiTieu != null) { totals.chiTieu += chiTieu; totals.hasChiTieu = true; }
    if (chiTieuLaiGop != null) { totals.chiTieuLaiGop += chiTieuLaiGop; totals.hasChiTieuLaiGop = true; }
    if (lastYearThucDat != null) { totals.lastYearThucDat += lastYearThucDat; totals.hasLastYear = true; }
    if (lastYearLaiGop != null) { totals.lastYearLaiGop += lastYearLaiGop; totals.hasLastYearLaiGop = true; }
    if (includeHongHuy) {
      totals.giaTriHongHuy += giaTriHongHuy || 0;
      totals.doanhThuCuoi += doanhThuCuoi || 0;
    }
  }

  const totalLaiGopBase = includeHongHuy ? totals.doanhThuCuoi : totals.thucDat;
  rows.push({
    khoi, maNganhHang: null, tenNganhHang: `Tổng cộng ${khoi}`,
    chiTieu: totals.hasChiTieu ? totals.chiTieu : null,
    thucDat: totals.thucDat,
    tyLeDat: (totals.hasChiTieu && totals.chiTieu) ? round1(totals.thucDat / totals.chiTieu * 100) : null,
    cungKyPct: (totals.hasLastYear && totals.lastYearThucDat) ? round1(totals.thucDat / totals.lastYearThucDat * 100) : null,
    giaTriHongHuy: includeHongHuy ? totals.giaTriHongHuy : null,
    doanhThuCuoi: includeHongHuy ? totals.doanhThuCuoi : null,
    tyLeLaiGop: totalLaiGopBase ? round1(totals.giaTriLaiGop / totalLaiGopBase * 100) : null,
    giaTriLaiGop: totals.giaTriLaiGop,
    tyLeLaiGopSoChiTieu: (totals.hasChiTieuLaiGop && totals.chiTieuLaiGop) ? round1(totals.giaTriLaiGop / totals.chiTieuLaiGop * 100) : null,
    laiGopCungKyPct: (totals.hasLastYearLaiGop && totals.lastYearLaiGop) ? round1(totals.giaTriLaiGop / totals.lastYearLaiGop * 100) : null,
    __isSubtotal: true,
    __isGrandTotal: khoi === 'Toàn hệ thống BRG'
  });

  return rows;
}

async function runNganhHangBrgReport(definition, filterValues = {}) {
  const dwhPool = await getPool('DWH');
  const range = resolveRequestedRange(filterValues);
  const lastYearRange = { from: shiftYearMinus1(range.from), to: shiftYearMinus1(range.to) };

  const fetchDomain = async (domain, dateRange) => {
    const blockDefinition = { domain, filters: [{ field: 'eventDate', type: 'dateRange' }] };
    const raw = await fetchAllReportRows(dwhPool, blockDefinition, { eventDate: dateRange });
    return aggregateDailyRowsByEntity(raw, dateRange.to);
  };

  const [currentRows, lastYearRows, hongHuyRows] = await Promise.all([
    fetchDomain(DOANHTHU_DOMAIN, range),
    fetchDomain(DOANHTHU_DOMAIN, lastYearRange),
    fetchDomain(HONGHUY_DOMAIN, range)
  ]);

  const hongHuyByName = new Map(hongHuyRows.map(r => [String(r.entityCode).trim(), r.measures?.GiaTriHongHuy || 0]));

  const fromPeriod = firstOfMonth(range.from);
  const toPeriod = firstOfMonth(range.to);
  const targetRows = await runSalesTargetsBlockRange(dwhPool, TARGET_DOMAIN, fromPeriod, toPeriod);
  const targetMap = new Map(targetRows.map(t => [t.entityCode, t]));

  const diemMapping = await loadDiemStkMapping();
  const stkLookup = buildStkIdLookup(diemMapping);
  const nsoSet = await loadNsoMaDiemSet();
  const isNsoStk = (stkId) => {
    const info = stkLookup.get(String(stkId));
    return !!(info && nsoSet.has(info.maDiem));
  };

  const allStkIds = null; // không lọc — "Toàn hệ thống BRG"
  const lflStkIds = new Set();
  const nsoStkIds = new Set();
  for (const r of [...currentRows, ...lastYearRows]) {
    const stk = String(r.dimensions?.STK_ID ?? '');
    if (!stk) continue;
    if (isNsoStk(stk)) nsoStkIds.add(stk); else lflStkIds.add(stk);
  }

  const brgCurrentMap = groupByDeptId(currentRows, allStkIds);
  const brgLastYearMap = groupByDeptId(lastYearRows, allStkIds);
  const lflCurrentMap = groupByDeptId(currentRows, lflStkIds);
  const lflLastYearMap = groupByDeptId(lastYearRows, lflStkIds);
  const nsoCurrentMap = groupByDeptId(currentRows, nsoStkIds);
  const nsoLastYearMap = groupByDeptId(lastYearRows, nsoStkIds);

  let rows = [
    ...buildSegmentRows('Toàn hệ thống BRG', brgCurrentMap, brgLastYearMap, targetMap, hongHuyByName, true),
    ...buildSegmentRows('LFL', lflCurrentMap, lflLastYearMap, targetMap, hongHuyByName, false),
    ...buildSegmentRows('NSO', nsoCurrentMap, nsoLastYearMap, targetMap, hongHuyByName, false)
  ];

  const columns = describeColumns(COLUMNS);
  assignSttIfPresent(rows, columns);

  return {
    columns,
    rows,
    columnGroups: COLUMN_GROUPS,
    standaloneColumnColors: STANDALONE_COLUMN_COLORS
  };
}

module.exports = { runNganhHangBrgReport };
