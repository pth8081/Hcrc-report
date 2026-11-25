// lib/kinhDoanhTuanRunner.js — SourceType='kinhDoanhTuan' (bản 11.24, theo
// yêu cầu đội MKT, dựa trên file mẫu thật "FORM BÁO CÁO - BC KD T3
// 2026.xlsx") — "Báo cáo kinh doanh theo tuần": MỖI DÒNG = 1 mã Điểm, so
// sánh Tuần này (W)/Tuần trước (W-1)/Tỷ lệ W/W-1 VÀ Tháng này luỹ kế đến
// hết tuần (MTD)/Cùng kỳ năm trước (MTD-1)/Tỷ lệ MTD/MTD-1, cho 6 chỉ số:
// Doanh số TOTAL, Số Bill TOTAL, AOV TOTAL, Doanh số QUA THẺ, Số Bill QUA
// THẺ, AOV QUA THẺ.
//
// Nguồn domain MỚI `doanhthu_the_chinhanh` (xem "deploy/VIEW DSMART16
// (trung tâm)/Thiết lập VIEW Doanh thu theo Thẻ chi nhánh..."). "TOTAL" ở
// đây nghĩa là BÁN LẺ (TRANS_CODE 221 trừ 222) — ĐÃ LOẠI HẲN bán buôn
// (211/212/232), ĐÚNG như ghi chú trong file mẫu MKT thật: "Đã loại trừ
// giao dịch bán buôn trong bán lẻ" — KHÁC domain `doanhthu_chinhanh` (Doanh
// thu cuối ngày, GỘP CHUNG bán buôn+bán lẻ).
//
// "W" (tuần) = 7 NGÀY LIÊN TIẾP, KẾT THÚC ĐÚNG ngày neo (filterValues.eventDate,
// mặc định hôm nay) — [neo-6, neo] — KHÔNG phải tuần dương lịch Thứ Hai ->
// Chủ Nhật (đã đối chiếu dữ liệu THẬT trong file mẫu MKT: "W: 11/6/2026 -
// 17/6/2026" — 17/6/2026 là THỨ TƯ, không phải Chủ Nhật — xác nhận đây là
// cửa sổ trượt 7 ngày tính NGƯỢC từ ngày lấy báo cáo, không neo theo thứ
// trong tuần). "W-1" = 7 ngày liền trước đó [neo-13, neo-7]. "MTD" = đầu
// tháng (của tháng chứa ngày neo) -> ngày neo. "MTD-1" = cùng khoảng
// ngày/tháng đó NHƯNG lùi đúng 1 năm dương lịch (mirror ĐÚNG cách
// lib/anomalyAlertRunner.js:resolveComparisonRange() mode
// 'samePeriodLastYear' tính — setFullYear(y-1), KHÔNG cộng/trừ số ngày).
//
// Row-identity: MĐ (mã Điểm)/MK (mã kho hiển thị, = MaStkMoi)/Tên siêu
// thị/Loại (Mart/Mini Mart/Kho, từ LoaiChuoi)/Miền/Vùng QL — 2 cột Miền/
// Vùng QL MỚI thêm vào etl.DiemStkMapping (bản 11.24, admin tự khai ở
// trang "Ánh xạ Điểm - STK_ID", xem etl-db/schema.sql) — KHÔNG có nguồn
// DSMART16 nào cung cấp khái niệm này.
//
// Nhóm "I. CHUỖI MART"/"II. CHUỖI MINIMART" + dòng "TỔNG <nhóm>"/"Tổng
// cộng" — TÁI DÙNG nguyên tinh thần groupRowsByChain/buildSubtotalRow của
// lib/doanhThuTongHopHcrcRunner.js (không import lại — bộ cột đo lường
// khác hẳn, viết RIÊNG ở đây cho đúng 16 trường thô của báo cáo này), và
// khớp ĐÚNG với file mẫu Report 2 ("Form báo cáo hàng tuần thứ 6.xlsx")
// cũng có dòng "Tổng Mart"/"Tổng Mini Mart" ở cuối.
//
// Tỷ lệ tăng/giảm (vd "Tỷ lệ W/W-1") = (kỳ này - kỳ trước) / kỳ trước, quy
// về PHẦN TRĂM (nhân 100, ĐÚNG quy ước pctOrNull/divOrNull đã dùng khắp
// repo) — kỳ trước = 0 (hoặc KHÔNG có dữ liệu) -> trả null (để trống trên
// báo cáo), KHÔNG trả 0 giả — khác hành vi 1 vài ô trong file Excel mẫu
// (có vẻ do IFERROR(...,0) phía công thức Excel gốc) — đã CHỌN theo đúng
// quy ước thống nhất của hệ thống, báo lại nếu người dùng muốn đổi lại
// thành 0.
const { getPool } = require('../db');
const { loadDiemStkMapping, remapRowsToDiem } = require('./diemStkMapping');
const { fetchRawRows, bucketByDay, rowsInRange, vietnamTodayISO, divOrNull } = require('./doanhThuTongHopHcrcRunner');
const { describeColumns } = require('./reportEngine');
const { assignSttIfPresent } = require('./reportCellFormat');

const DOMAIN = 'doanhthu_the_chinhanh';
const MEASURE_KEYS = ['SoBillTotal', 'SoBillThe', 'DoanhSoTotal', 'DoanhSoThe'];

function pad(n) { return String(n).padStart(2, '0'); }
function parseISO(s) { return new Date(`${s}T00:00:00Z`); }
function toISO(d) { return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`; }
function addDays(s, n) { const d = parseISO(s); d.setUTCDate(d.getUTCDate() + n); return toISO(d); }
// Số ngày TÍNH CẢ 2 đầu mút (vd 1/11 -> 20/11 = 20 ngày) — dùng để suy ra
// "W-1" có CÙNG ĐỘ DÀI khi người dùng chọn khoảng "Từ ngày - Đến ngày" tuỳ
// ý (bản 11.25, theo yêu cầu người dùng — xem runKinhDoanhTuanReport()).
function daysBetween(fromISO, toISO) { return Math.round((parseISO(toISO) - parseISO(fromISO)) / 86400000) + 1; }
function firstOfMonth(s) { return `${s.slice(0, 7)}-01`; }
// Lùi ĐÚNG 1 năm dương lịch — mirror lib/anomalyAlertRunner.js:resolveComparisonRange()
// mode 'samePeriodLastYear' (setFullYear, KHÔNG phải trừ 365 ngày).
function yearAgo(s) { const d = parseISO(s); d.setUTCFullYear(d.getUTCFullYear() - 1); return toISO(d); }

function ratePct(cur, prior) {
  if (!prior) return null;
  return ((cur - prior) / prior) * 100;
}

function sumByStk(rows) {
  const byStk = new Map();
  for (const row of rows) {
    const stkId = row.entityCode;
    if (!stkId) continue;
    let acc = byStk.get(stkId);
    if (!acc) { acc = {}; byStk.set(stkId, acc); }
    const m = row.measures || {};
    for (const k of MEASURE_KEYS) acc[k] = (acc[k] || 0) + (m[k] || 0);
  }
  return byStk;
}

// useCu=true (MTD-1, "cùng kỳ năm trước") CHỈ hợp lệ khi MaStkCu/MaStkMoi
// là CÙNG 1 tập hợp (kho không đổi qua thời gian) — mirror ĐÚNG cách
// lib/compositeReportRunner.js gọi remapRowsToDiem(rows, diemMapping,
// years < 0) cho mọi khối "cùng kỳ năm trước" khác trong hệ thống.
function remapToMaDiem(byStk, diemMapping, useCu) {
  const rowsForRemap = [...byStk.entries()].map(([stkId, measures]) => ({ entityCode: stkId, dimensions: {}, measures }));
  const diemRows = remapRowsToDiem(rowsForRemap, diemMapping, useCu);
  const out = new Map();
  for (const r of diemRows) out.set(r.entityCode, r.measures || {});
  return out;
}

// Gộp 16 trường thô (4 measure x 4 kỳ: W/W-1/MTD/MTD-1) thành field phẳng
// dùng xuyên suốt cho cả dòng dữ liệu LẪN dòng "TỔNG <nhóm>" (subtotal cộng
// dồn đúng các trường thô này rồi tính lại derived — KHÔNG cộng trung bình
// cộng các tỉ lệ/AOV đã tính sẵn của từng dòng, tránh sai số học).
function buildRaw(w, w1, mtd, mtd1) {
  return {
    dsTotalW: w.DoanhSoTotal || 0, billTotalW: w.SoBillTotal || 0,
    dsTheW: w.DoanhSoThe || 0, billTheW: w.SoBillThe || 0,
    dsTotalW1: w1.DoanhSoTotal || 0, billTotalW1: w1.SoBillTotal || 0,
    dsTheW1: w1.DoanhSoThe || 0, billTheW1: w1.SoBillThe || 0,
    dsTotalMtd: mtd.DoanhSoTotal || 0, billTotalMtd: mtd.SoBillTotal || 0,
    dsTheMtd: mtd.DoanhSoThe || 0, billTheMtd: mtd.SoBillThe || 0,
    dsTotalMtd1: mtd1.DoanhSoTotal || 0, billTotalMtd1: mtd1.SoBillTotal || 0,
    dsTheMtd1: mtd1.DoanhSoThe || 0, billTheMtd1: mtd1.SoBillThe || 0
  };
}

const RAW_KEYS = [
  'dsTotalW', 'billTotalW', 'dsTheW', 'billTheW',
  'dsTotalW1', 'billTotalW1', 'dsTheW1', 'billTheW1',
  'dsTotalMtd', 'billTotalMtd', 'dsTheMtd', 'billTheMtd',
  'dsTotalMtd1', 'billTotalMtd1', 'dsTheMtd1', 'billTheMtd1'
];

function sumRaw(rows) {
  const s = {};
  for (const k of RAW_KEYS) s[k] = rows.reduce((sum, r) => sum + (r[k] || 0), 0);
  return s;
}

// Tính AOV + các "Tỷ lệ" từ ĐÚNG 16 trường thô — dùng CHUNG cho dòng dữ
// liệu lẫn dòng subtotal (xem buildRaw() ở trên).
function computeDerived(raw) {
  const aovTotalW = divOrNull(raw.dsTotalW, raw.billTotalW);
  const aovTotalW1 = divOrNull(raw.dsTotalW1, raw.billTotalW1);
  const aovTotalMtd = divOrNull(raw.dsTotalMtd, raw.billTotalMtd);
  const aovTotalMtd1 = divOrNull(raw.dsTotalMtd1, raw.billTotalMtd1);
  const aovTheW = divOrNull(raw.dsTheW, raw.billTheW);
  const aovTheW1 = divOrNull(raw.dsTheW1, raw.billTheW1);
  const aovTheMtd = divOrNull(raw.dsTheMtd, raw.billTheMtd);
  const aovTheMtd1 = divOrNull(raw.dsTheMtd1, raw.billTheMtd1);

  return {
    ...raw,
    aovTotalW, aovTotalW1, aovTotalMtd, aovTotalMtd1,
    aovTheW, aovTheW1, aovTheMtd, aovTheMtd1,

    dsTotalRateW: ratePct(raw.dsTotalW, raw.dsTotalW1),
    dsTotalRateMtd: ratePct(raw.dsTotalMtd, raw.dsTotalMtd1),
    billTotalRateW: ratePct(raw.billTotalW, raw.billTotalW1),
    billTotalRateMtd: ratePct(raw.billTotalMtd, raw.billTotalMtd1),
    aovTotalRateW: ratePct(aovTotalW, aovTotalW1),
    aovTotalRateMtd: ratePct(aovTotalMtd, aovTotalMtd1),

    dsTheRateW: ratePct(raw.dsTheW, raw.dsTheW1),
    dsTheRateMtd: ratePct(raw.dsTheMtd, raw.dsTheMtd1),
    billTheRateW: ratePct(raw.billTheW, raw.billTheW1),
    billTheRateMtd: ratePct(raw.billTheMtd, raw.billTheMtd1),
    aovTheRateW: ratePct(aovTheW, aovTheW1),
    aovTheRateMtd: ratePct(aovTheMtd, aovTheMtd1)
  };
}

const LOAI_LABEL = { MART: 'Mart', MINIMART: 'Mini Mart', KHO: 'Kho' };
const GROUP_ORDER = ['MART', 'MINIMART', 'KHO'];
const ROMAN = ['I', 'II', 'III'];

// format: 'percent' là giá trị DUY NHẤT reportCellFormat.js/formatCell.js/
// exportExcel.js thực sự nhận biết (nhân sẵn 100, thêm "%") — các cột tiền/
// số lượng KHÔNG khai `format` gì cả, rơi về định dạng số mặc định
// (`#,##0`, xem exportExcel.js) — KHÔNG có format 'currency' nào trong hệ
// thống, không tự đặt ra giá trị mới ở đây.
function buildColumns() {
  const metricCols = (prefix) => [
    { key: `${prefix}W`, label: 'W' },
    { key: `${prefix}W1`, label: 'W-1' },
    { key: `${prefix}RateW`, label: 'Tỷ lệ W/W-1', format: 'percent' },
    { key: `${prefix}Mtd`, label: 'MTD' },
    { key: `${prefix}Mtd1`, label: 'MTD-1' },
    { key: `${prefix}RateMtd`, label: 'Tỷ lệ MTD/MTD-1', format: 'percent' }
  ];
  return [
    { key: 'stt', label: 'TT' },
    { key: 'maDiem', label: 'MĐ' },
    { key: 'mk', label: 'MK' },
    { key: 'tenSieuThi', label: 'Tên siêu thị' },
    { key: 'loai', label: 'Loại' },
    { key: 'mien', label: 'Miền' },
    { key: 'vungQL', label: 'Vùng QL' },
    ...metricCols('dsTotal'),
    ...metricCols('billTotal'),
    ...metricCols('aovTotal'),
    ...metricCols('dsThe'),
    ...metricCols('billThe'),
    ...metricCols('aovThe')
  ];
}

function buildColumnGroups() {
  const keysFor = (prefix) => [`${prefix}W`, `${prefix}W1`, `${prefix}RateW`, `${prefix}Mtd`, `${prefix}Mtd1`, `${prefix}RateMtd`];
  return [
    { label: 'DOANH SỐ TOTAL', color: 'green', keys: keysFor('dsTotal') },
    { label: 'SỐ BILL TOTAL', color: 'blue', keys: keysFor('billTotal') },
    { label: 'AOV TOTAL', color: 'orange', keys: keysFor('aovTotal') },
    { label: 'DOANH SỐ QUA THẺ', color: 'red', keys: keysFor('dsThe') },
    { label: 'SỐ BILL QUA THẺ', color: 'purple', keys: keysFor('billThe') },
    { label: 'AOV QUA THẺ', color: 'yellow', keys: keysFor('aovThe') }
  ];
}

function groupRowsByChain(rows) {
  const groups = new Map();
  for (const row of rows) {
    const key = row.__loaiChuoi && GROUP_ORDER.includes(row.__loaiChuoi) ? row.__loaiChuoi : '__other';
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(row);
  }
  const orderedKeys = [...GROUP_ORDER.filter(k => groups.has(k)), ...(groups.has('__other') ? ['__other'] : [])];
  return orderedKeys.map(key => ({ key, rows: groups.get(key) }));
}

function buildSubtotalRow(groupRows, label, isGrandTotal) {
  const raw = sumRaw(groupRows);
  const derived = computeDerived(raw);
  return { tenSieuThi: label, ...derived, __isSubtotal: true, __isGrandTotal: !!isGrandTotal };
}

function buildGroupedRows(storeRows, grandTotalLabel) {
  const groups = groupRowsByChain(storeRows);
  const out = [];
  groups.forEach((g, idx) => {
    const roman = ROMAN[idx] || String(idx + 1);
    const isOther = g.key === '__other';
    out.push({
      __isSectionHeader: true,
      __sectionLabel: `${roman}. ${isOther ? 'CHƯA PHÂN NHÓM' : `CHUỖI ${g.key}`}`
    });
    out.push(...g.rows);
    out.push(buildSubtotalRow(g.rows, `TỔNG ${isOther ? 'KHÁC' : LOAI_LABEL[g.key] || g.key}`, false));
  });
  out.push(buildSubtotalRow(storeRows, grandTotalLabel || 'Tổng cộng', true));
  return out;
}

async function runKinhDoanhTuanReport(definition, filterValues) {
  // "Từ ngày - Đến ngày" (bản 11.25, theo yêu cầu người dùng) — khi NGƯỜI
  // DÙNG điền ĐỦ CẢ 2 ô này (và Từ ngày <= Đến ngày), "W" KHÔNG còn là cửa
  // sổ trượt 7 ngày cố định nữa mà là TỔNG CỘNG DỒN của ĐÚNG khoảng đã
  // chọn; "W-1" = khoảng liền trước đó, CÙNG SỐ NGÀY (để vẫn so sánh %
  // được) — xem daysBetween() ở trên. KHÔNG điền (hoặc điền thiếu 1 ô) ->
  // hành vi CŨ giữ nguyên (cửa sổ 7 ngày quanh "Ngày trong tuần muốn
  // xem"). "MTD"/"MTD-1" KHÔNG đổi theo khoảng tuỳ chỉnh này — vẫn luỹ kế
  // đúng THÁNG chứa ngày neo (neo = Đến ngày khi dùng khoảng tuỳ chỉnh,
  // ngược lại là eventDate) như trước giờ.
  const customRange = (filterValues && filterValues.customRange) || {};
  const fromFilter = customRange.from, toFilter = customRange.to;
  const useCustomRange = !!(fromFilter && toFilter && fromFilter <= toFilter);

  const anchor = (useCustomRange ? toFilter : (filterValues && filterValues.eventDate)) || vietnamTodayISO();

  let wFrom, wTo, w1From, w1To;
  if (useCustomRange) {
    wFrom = fromFilter; wTo = toFilter;
    const rangeLen = daysBetween(wFrom, wTo);
    w1To = addDays(wFrom, -1);
    w1From = addDays(w1To, -(rangeLen - 1));
  } else {
    wTo = anchor; wFrom = addDays(wTo, -6);
    w1To = addDays(wFrom, -1); w1From = addDays(w1To, -6);
  }
  const mtdFrom = firstOfMonth(anchor), mtdTo = anchor;
  const mtd1To = yearAgo(wTo), mtd1From = firstOfMonth(mtd1To);

  const dwhPool = await getPool('DWH');
  const diemMapping = await loadDiemStkMapping();

  // 1 lượt fetch cho khoảng NĂM NAY rộng nhất (phủ cả W-1/W/MTD), 1 lượt
  // RIÊNG cho khoảng NĂM TRƯỚC (MTD-1) — 2 khoảng này ở 2 năm khác nhau,
  // KHÔNG gộp chung bucket được (mirror cách doanhThuTongHopHcrcRunner.js
  // xử lý "fetch 1 lần rồi cắt lại trong bộ nhớ" cho PHẦN NĂM NAY, nhưng
  // cần fetch RIÊNG cho năm trước).
  const currentFrom = w1From < mtdFrom ? w1From : mtdFrom;
  const [currentRawRows, priorYearRawRows] = await Promise.all([
    fetchRawRows(dwhPool, DOMAIN, currentFrom, wTo),
    fetchRawRows(dwhPool, DOMAIN, mtd1From, mtd1To)
  ]);
  const currentByDay = bucketByDay(currentRawRows);
  const priorByDay = bucketByDay(priorYearRawRows);

  const wByMaDiem = remapToMaDiem(sumByStk(rowsInRange(currentByDay, wFrom, wTo)), diemMapping, false);
  const w1ByMaDiem = remapToMaDiem(sumByStk(rowsInRange(currentByDay, w1From, w1To)), diemMapping, false);
  const mtdByMaDiem = remapToMaDiem(sumByStk(rowsInRange(currentByDay, mtdFrom, mtdTo)), diemMapping, false);
  const mtd1ByMaDiem = remapToMaDiem(sumByStk(rowsInRange(priorByDay, mtd1From, mtd1To)), diemMapping, true);

  // __storeScope (bản 8.51) — mirror ĐÚNG cách lib/doanhThuTongHopHcrcRunner.js
  // áp dụng (entityCode = mã Điểm chuẩn, không qua BU_ID/STK_ID thô).
  const storeScope = Array.isArray(filterValues && filterValues.__storeScope) ? new Set(filterValues.__storeScope) : null;

  const storeRows = [];
  for (const [maDiem, info] of diemMapping) {
    if (storeScope && !storeScope.has(maDiem)) continue;
    const w = wByMaDiem.get(maDiem) || {};
    const w1 = w1ByMaDiem.get(maDiem) || {};
    const mtd = mtdByMaDiem.get(maDiem) || {};
    const mtd1 = mtd1ByMaDiem.get(maDiem) || {};
    const raw = buildRaw(w, w1, mtd, mtd1);
    const derived = computeDerived(raw);

    storeRows.push({
      maDiem,
      mk: (info.maStkMoi || []).join(', ') || null,
      tenSieuThi: info.tenSieuThi || null,
      loai: LOAI_LABEL[info.loaiChuoi] || info.loaiChuoi || null,
      mien: info.mien || null,
      vungQL: info.vungQL || null,
      __loaiChuoi: info.loaiChuoi || null,
      ...derived
    });
  }

  const columns = describeColumns(buildColumns());
  const groupedRows = buildGroupedRows(storeRows);
  assignSttIfPresent(groupedRows, columns);

  return {
    columns,
    rows: groupedRows,
    columnGroups: buildColumnGroups(),
    columnSuperGroups: null
  };
}

module.exports = {
  runKinhDoanhTuanReport, DOMAIN, MEASURE_KEYS,
  firstOfMonth, yearAgo, addDays, daysBetween, ratePct,
  sumByStk, remapToMaDiem, buildRaw, computeDerived, buildColumns, buildColumnGroups,
  groupRowsByChain, buildSubtotalRow, buildGroupedRows
};
