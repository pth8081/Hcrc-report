// lib/khachHangTuanRunner.js — SourceType='khachHangTuan' (bản 11.24, theo
// yêu cầu đội MKT, dựa trên file mẫu thật "Form báo cáo hàng tuần thứ
// 6.xlsx") — "Báo cáo khách hàng theo tuần": MỖI DÒNG = 1 mã Điểm, so sánh
// Tuần này (W)/Tuần trước (W-1)/LFL ("Trung bình tuần cùng kỳ năm trước")
// + Tỷ lệ W/W-1 + Tỷ lệ W/LFL, cho 6 chỉ số: Bill tổng, Bill qua thẻ
// Elite, AOV tổng, AOV qua thẻ Elite, Doanh số tổng, Doanh số qua thẻ.
//
// DÙNG CHUNG domain `doanhthu_the_chinhanh`/VIEW `V_HCRC_DOANHTHU_THE_CHINHANH`
// với "Báo cáo kinh doanh theo tuần" (lib/kinhDoanhTuanRunner.js) — xem
// file đó + "bc-kinh-doanh-theo-tuan.md" cho đầy đủ giải thích domain/VIEW/
// công thức Doanh số/Số Bill/"qua thẻ"/"TOTAL = bán lẻ, loại hẳn bán
// buôn" — KHÔNG chép lại ở đây, chỉ nêu điểm KHÁC của báo cáo này.
//
// ĐIỂM KHÁC DUY NHẤT so với "Báo cáo kinh doanh theo tuần":
//   - KHÔNG có MTD/MTD-1 — thay bằng "LFL" ("Trung bình tuần cùng kỳ năm
//     trước") = SUM(Bill/Doanh số trong CẢ THÁNG DƯƠNG LỊCH chứa ngày
//     neo, LÙI ĐÚNG 1 NĂM) / (số ngày trong tháng đó / 7) — quy về "trung
//     bình 1 tuần" của tháng đó năm trước, KHÔNG phải tổng cả tháng. Đã
//     xác nhận công thức này bằng cách dò ngược từ số liệu THẬT trong
//     file mẫu (vd Bill tổng LFL=4947.366667 của 1 siêu thị khớp ĐÚNG
//     21203 Bill thật trong tháng 6/2023 × 7 ÷ 30 ngày).
//   - "Tỷ lệ" có 2 loại: "Tỷ lệ W/W-1" (như báo cáo kia) VÀ "Tỷ lệ W/LFL"
//     (so Tuần này với TRUNG BÌNH TUẦN cùng kỳ năm trước) — KHÔNG có "Tỷ
//     lệ LFL/..." nào khác.
//   - AOV = Doanh số ÷ Số Bill CỦA CÙNG KỲ (W/W-1/LFL) — với LFL, vì cả 2
//     số (Doanh số, Bill) CÙNG chia 1 hệ số "số tuần trong tháng" như
//     nhau, hệ số đó TỰ TRIỆT TIÊU trong phép chia — AOV LFL tính trực
//     tiếp từ 2 giá trị "trung bình tuần" đã chia sẵn, KHÔNG cần chia lại.
//   - Thứ tự cột/nhóm theo ĐÚNG file mẫu: Bill tổng, Bill qua thẻ Elite,
//     AOV tổng, AOV qua thẻ Elite, Doanh số tổng, Doanh số qua thẻ (KHÁC
//     thứ tự Doanh số-trước-Bill của "Báo cáo kinh doanh theo tuần").
//   - Cột định danh dòng theo ĐÚNG file mẫu: TT, Mã CH (= mã kho
//     MaStkMoi), Mã điểm, Hình thức (Mart/Mini Mart/Kho, từ LoaiChuoi),
//     Tên CH — THỨ TỰ Mã CH ĐỨNG TRƯỚC Mã điểm (khác báo cáo kia).
//
// Ghi chú "(không bao gồm 07 Siêu thị chuyển đổi sang FujiMart)" trong
// file mẫu — KHÔNG cần xử lý riêng ở runner: các siêu thị đã chuyển đổi
// nhãn hiệu/ngừng dùng DSMART16 tự nhiên KHÔNG CÒN dữ liệu mới trong VIEW
// nguồn (STRANS), nên tự động "biến mất" khỏi số liệu mà không cần danh
// sách loại trừ riêng — CHỈ cần etl-admin chưa xoá/khoá mã Điểm đó thì
// dòng vẫn hiện với số liệu W/W-1/LFL = 0 (hoặc trống nếu LFL cũng không
// có), KHÔNG coi là lỗi.
const { getPool } = require('../db');
const { loadDiemStkMapping, remapRowsToDiem } = require('./diemStkMapping');
const {
  fetchRawRows, bucketByDay, rowsInRange, vietnamTodayISO, divOrNull, daysInMonth
} = require('./doanhThuTongHopHcrcRunner');
const { describeColumns } = require('./reportEngine');
const { assignSttIfPresent } = require('./reportCellFormat');

const DOMAIN = 'doanhthu_the_chinhanh';
const MEASURE_KEYS = ['SoBillTotal', 'SoBillThe', 'DoanhSoTotal', 'DoanhSoThe'];

function pad(n) { return String(n).padStart(2, '0'); }
function parseISO(s) { return new Date(`${s}T00:00:00Z`); }
function toISO(d) { return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`; }
function addDays(s, n) { const d = parseISO(s); d.setUTCDate(d.getUTCDate() + n); return toISO(d); }
// Mirror ĐÚNG lib/kinhDoanhTuanRunner.js:daysBetween() — bản 11.25.
function daysBetween(fromISO, toISO) { return Math.round((parseISO(toISO) - parseISO(fromISO)) / 86400000) + 1; }
function firstOfMonth(s) { return `${s.slice(0, 7)}-01`; }
function lastOfMonth(s) { return `${s.slice(0, 7)}-${pad(daysInMonth(s))}`; }
// Lùi ĐÚNG 1 năm dương lịch — mirror lib/anomalyAlertRunner.js:resolveComparisonRange()
// mode 'samePeriodLastYear' (setFullYear, KHÔNG phải trừ 365 ngày) — CÙNG
// cách lib/kinhDoanhTuanRunner.js dùng cho MTD-1.
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

function remapToMaDiem(byStk, diemMapping, useCu) {
  const rowsForRemap = [...byStk.entries()].map(([stkId, measures]) => ({ entityCode: stkId, dimensions: {}, measures }));
  const diemRows = remapRowsToDiem(rowsForRemap, diemMapping, useCu);
  const out = new Map();
  for (const r of diemRows) out.set(r.entityCode, r.measures || {});
  return out;
}

// w/w1: measures thô của 7 ngày W/W-1. lflMonthSum: TỔNG CẢ THÁNG (chưa
// chia tuần) của tháng cùng kỳ năm trước. lflDivisor = số ngày tháng đó/7
// — chia NGAY ở đây để ra "trung bình 1 tuần", dùng CHUNG cho mọi phép
// tính derived phía sau (AOV/Tỷ lệ) — không cần nhớ lại hệ số ở đâu khác.
function buildRaw(w, w1, lflMonthSum, lflDivisor) {
  const lflBillTotal = (lflMonthSum.SoBillTotal || 0) / lflDivisor;
  const lflBillThe = (lflMonthSum.SoBillThe || 0) / lflDivisor;
  const lflDsTotal = (lflMonthSum.DoanhSoTotal || 0) / lflDivisor;
  const lflDsThe = (lflMonthSum.DoanhSoThe || 0) / lflDivisor;
  return {
    billTotalW: w.SoBillTotal || 0, billTheW: w.SoBillThe || 0,
    dsTotalW: w.DoanhSoTotal || 0, dsTheW: w.DoanhSoThe || 0,
    billTotalW1: w1.SoBillTotal || 0, billTheW1: w1.SoBillThe || 0,
    dsTotalW1: w1.DoanhSoTotal || 0, dsTheW1: w1.DoanhSoThe || 0,
    billTotalLfl: lflBillTotal, billTheLfl: lflBillThe,
    dsTotalLfl: lflDsTotal, dsTheLfl: lflDsThe
  };
}

const RAW_KEYS = [
  'billTotalW', 'billTheW', 'dsTotalW', 'dsTheW',
  'billTotalW1', 'billTheW1', 'dsTotalW1', 'dsTheW1',
  'billTotalLfl', 'billTheLfl', 'dsTotalLfl', 'dsTheLfl'
];

function sumRaw(rows) {
  const s = {};
  for (const k of RAW_KEYS) s[k] = rows.reduce((sum, r) => sum + (r[k] || 0), 0);
  return s;
}

// "Trung bình tuần" (billTotalLfl/dsTotalLfl/...) là phép CỘNG tuyến tính
// (đã chia đều cho hệ số tháng — hệ số ĐÓ GIỐNG NHAU cho MỌI siêu thị
// trong CÙNG 1 lượt chạy báo cáo, vì chỉ phụ thuộc ngày neo) — CỘNG DỒN
// trực tiếp các giá trị đã chia của từng dòng vẫn ra ĐÚNG "trung bình
// tuần" của CẢ NHÓM, không cần biết lại số ngày trong tháng ở đây.
function computeDerived(raw) {
  const aovTotalW = divOrNull(raw.dsTotalW, raw.billTotalW);
  const aovTotalW1 = divOrNull(raw.dsTotalW1, raw.billTotalW1);
  const aovTotalLfl = divOrNull(raw.dsTotalLfl, raw.billTotalLfl);
  const aovTheW = divOrNull(raw.dsTheW, raw.billTheW);
  const aovTheW1 = divOrNull(raw.dsTheW1, raw.billTheW1);
  const aovTheLfl = divOrNull(raw.dsTheLfl, raw.billTheLfl);

  return {
    ...raw,
    aovTotalW, aovTotalW1, aovTotalLfl, aovTheW, aovTheW1, aovTheLfl,

    billTotalRateW: ratePct(raw.billTotalW, raw.billTotalW1),
    billTotalRateLfl: ratePct(raw.billTotalW, raw.billTotalLfl),
    billTheRateW: ratePct(raw.billTheW, raw.billTheW1),
    billTheRateLfl: ratePct(raw.billTheW, raw.billTheLfl),

    aovTotalRateW: ratePct(aovTotalW, aovTotalW1),
    aovTotalRateLfl: ratePct(aovTotalW, aovTotalLfl),
    aovTheRateW: ratePct(aovTheW, aovTheW1),
    aovTheRateLfl: ratePct(aovTheW, aovTheLfl),

    dsTotalRateW: ratePct(raw.dsTotalW, raw.dsTotalW1),
    dsTotalRateLfl: ratePct(raw.dsTotalW, raw.dsTotalLfl),
    dsTheRateW: ratePct(raw.dsTheW, raw.dsTheW1),
    dsTheRateLfl: ratePct(raw.dsTheW, raw.dsTheLfl)
  };
}

const LOAI_LABEL = { MART: 'Mart', MINIMART: 'Mini Mart', KHO: 'Kho' };
const GROUP_ORDER = ['MART', 'MINIMART', 'KHO'];
const ROMAN = ['I', 'II', 'III'];

// Thứ tự nhóm/cột ĐÚNG file mẫu: Bill tổng, Bill qua thẻ Elite, AOV tổng,
// AOV qua thẻ Elite, Doanh số tổng, Doanh số qua thẻ — mỗi nhóm 5 cột con
// W/W-1/LFL/Tỷ lệ W-W-1/Tỷ lệ W-LFL (rate đứng SAU 3 cột thô, KHÁC thứ tự
// "Báo cáo kinh doanh theo tuần").
const METRIC_GROUPS = [
  { prefix: 'billTotal', label: 'Bill tổng', color: 'blue' },
  { prefix: 'billThe', label: 'Bill qua thẻ Elite', color: 'purple' },
  { prefix: 'aovTotal', label: 'AOV tổng', color: 'orange' },
  { prefix: 'aovThe', label: 'AOV qua thẻ Elite', color: 'yellow' },
  { prefix: 'dsTotal', label: 'Doanh số tổng', color: 'green' },
  { prefix: 'dsThe', label: 'Doanh số qua thẻ', color: 'red' }
];

// format: 'percent' là giá trị DUY NHẤT reportCellFormat.js/formatCell.js/
// exportExcel.js thực sự nhận biết — các cột tiền/số lượng KHÔNG khai
// `format` gì cả (rơi về định dạng số mặc định `#,##0`).
function buildColumns() {
  const cols = [
    { key: 'stt', label: 'TT' },
    { key: 'maCH', label: 'Mã CH' },
    { key: 'maDiem', label: 'Mã điểm' },
    { key: 'hinhThuc', label: 'Hình thức' },
    { key: 'tenCH', label: 'Tên CH' }
  ];
  for (const g of METRIC_GROUPS) {
    cols.push(
      { key: `${g.prefix}W`, label: 'W' },
      { key: `${g.prefix}W1`, label: 'W-1' },
      { key: `${g.prefix}Lfl`, label: 'LFL' },
      { key: `${g.prefix}RateW`, label: 'Tỷ lệ W/W-1', format: 'percent' },
      { key: `${g.prefix}RateLfl`, label: 'Tỷ lệ W/LFL', format: 'percent' }
    );
  }
  return cols;
}

function buildColumnGroups() {
  return METRIC_GROUPS.map(g => ({
    label: g.label, color: g.color,
    keys: [`${g.prefix}W`, `${g.prefix}W1`, `${g.prefix}Lfl`, `${g.prefix}RateW`, `${g.prefix}RateLfl`]
  }));
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

function buildSubtotalRow(groupRows, label, isGrandTotal, chainKey) {
  const raw = sumRaw(groupRows);
  const derived = computeDerived(raw);
  return { tenCH: label, ...derived, __isSubtotal: true, __isGrandTotal: !!isGrandTotal, __chainKey: chainKey || null };
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
    out.push(buildSubtotalRow(g.rows, `TỔNG ${isOther ? 'KHÁC' : LOAI_LABEL[g.key] || g.key}`, false, g.key));
  });
  out.push(buildSubtotalRow(storeRows, grandTotalLabel || 'Tổng cộng', true));
  return out;
}

// buildChartImages (bản 11.26, theo yêu cầu người dùng — file mẫu gốc
// "Form báo cáo hàng tuần thứ 6.xlsx" có 1 sheet "Biểu đồ" RIÊNG, 3 biểu đồ
// cột: Tổng số Bill (Mart/Mini Mart), AOV Mart, AOV Mini Mart — đối chiếu
// Model (LFL)/Tuần trước/Tuần này) — CHỈ dùng ĐÚNG số đã có sẵn ở 2 dòng
// "TỔNG Mart"/"TỔNG Mini Mart" (tìm qua __chainKey gắn ở buildSubtotalRow,
// KHÔNG so khớp chuỗi nhãn hiển thị — an toàn nếu sau này đổi nhãn). Biểu
// đồ thứ 4 của file mẫu ("Thực trạng sử dụng thẻ") KHÔNG làm — dữ liệu đến
// từ 1 file Excel khác nhóm MKT tự tổng hợp tay, không có trong hệ thống
// (xác nhận với người dùng, xem hội thoại) — trả về tối đa 3 phần tử, bỏ
// qua phần nào thiếu dòng subtotal tương ứng (vd lọc chỉ còn 1 chuỗi).
function buildChartImages(rows) {
  const { renderGroupedBarChart, SERIES_COLORS } = require('./chartImage');
  const martRow = rows.find(r => r.__isSubtotal && !r.__isGrandTotal && r.__chainKey === 'MART');
  const miniRow = rows.find(r => r.__isSubtotal && !r.__isGrandTotal && r.__chainKey === 'MINIMART');

  const seriesDef = [
    { key: 'lfl', label: 'Trung bình cùng kỳ năm trước (LFL)', color: SERIES_COLORS.lfl },
    { key: 'w1', label: 'Tuần trước', color: SERIES_COLORS.w1 },
    { key: 'w', label: 'Tuần này', color: SERIES_COLORS.w }
  ];

  const images = [];
  if (martRow || miniRow) {
    const categories = [];
    if (martRow) categories.push({ label: 'Mart', values: { lfl: martRow.billTotalLfl, w1: martRow.billTotalW1, w: martRow.billTotalW } });
    if (miniRow) categories.push({ label: 'Mini Mart', values: { lfl: miniRow.billTotalLfl, w1: miniRow.billTotalW1, w: miniRow.billTotalW } });
    images.push({
      name: 'Tổng số Bill',
      buffer: renderGroupedBarChart({ title: 'Biểu đồ tổng số Bill', categories, series: seriesDef })
    });
  }
  if (martRow) {
    images.push({
      name: 'AOV Mart',
      buffer: renderGroupedBarChart({
        title: 'Biểu đồ AOV — Chuỗi Mart',
        categories: [
          { label: 'AOV tổng', values: { lfl: martRow.aovTotalLfl, w1: martRow.aovTotalW1, w: martRow.aovTotalW } },
          { label: 'AOV qua thẻ', values: { lfl: martRow.aovTheLfl, w1: martRow.aovTheW1, w: martRow.aovTheW } }
        ],
        series: seriesDef
      })
    });
  }
  if (miniRow) {
    images.push({
      name: 'AOV Mini Mart',
      buffer: renderGroupedBarChart({
        title: 'Biểu đồ AOV — Chuỗi Mini Mart',
        categories: [
          { label: 'AOV tổng', values: { lfl: miniRow.aovTotalLfl, w1: miniRow.aovTotalW1, w: miniRow.aovTotalW } },
          { label: 'AOV qua thẻ', values: { lfl: miniRow.aovTheLfl, w1: miniRow.aovTheW1, w: miniRow.aovTheW } }
        ],
        series: seriesDef
      })
    });
  }
  return images;
}

async function runKhachHangTuanReport(definition, filterValues) {
  // "Từ ngày - Đến ngày" (bản 11.25, theo yêu cầu người dùng) — mirror ĐÚNG
  // lib/kinhDoanhTuanRunner.js:runKinhDoanhTuanReport() — xem chú thích đầy
  // đủ ở đó. Điền đủ cả 2 ô -> "W" = tổng cộng dồn ĐÚNG khoảng đã chọn,
  // "W-1" = khoảng liền trước, CÙNG SỐ NGÀY. "LFL" KHÔNG đổi theo khoảng
  // tuỳ chỉnh — vẫn tính theo THÁNG chứa ngày neo (neo = Đến ngày khi dùng
  // khoảng tuỳ chỉnh).
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
  const lflAnchor = yearAgo(wTo);
  const lflFrom = firstOfMonth(lflAnchor), lflTo = lastOfMonth(lflAnchor);
  const lflDivisor = daysInMonth(lflFrom) / 7;

  const dwhPool = await getPool('DWH');
  const diemMapping = await loadDiemStkMapping();

  const [currentRawRows, priorYearRawRows] = await Promise.all([
    fetchRawRows(dwhPool, DOMAIN, w1From, wTo),
    fetchRawRows(dwhPool, DOMAIN, lflFrom, lflTo)
  ]);
  const currentByDay = bucketByDay(currentRawRows);
  const priorByDay = bucketByDay(priorYearRawRows);

  const wByMaDiem = remapToMaDiem(sumByStk(rowsInRange(currentByDay, wFrom, wTo)), diemMapping, false);
  const w1ByMaDiem = remapToMaDiem(sumByStk(rowsInRange(currentByDay, w1From, w1To)), diemMapping, false);
  const lflByMaDiem = remapToMaDiem(sumByStk(rowsInRange(priorByDay, lflFrom, lflTo)), diemMapping, true);

  const storeScope = Array.isArray(filterValues && filterValues.__storeScope) ? new Set(filterValues.__storeScope) : null;

  const storeRows = [];
  for (const [maDiem, info] of diemMapping) {
    if (storeScope && !storeScope.has(maDiem)) continue;
    const w = wByMaDiem.get(maDiem) || {};
    const w1 = w1ByMaDiem.get(maDiem) || {};
    const lflMonthSum = lflByMaDiem.get(maDiem) || {};
    const raw = buildRaw(w, w1, lflMonthSum, lflDivisor);
    const derived = computeDerived(raw);

    storeRows.push({
      maCH: (info.maStkMoi || []).join(', ') || null,
      maDiem,
      hinhThuc: LOAI_LABEL[info.loaiChuoi] || info.loaiChuoi || null,
      tenCH: info.tenSieuThi || null,
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
  runKhachHangTuanReport, DOMAIN, MEASURE_KEYS,
  firstOfMonth, lastOfMonth, yearAgo, addDays, daysBetween, ratePct,
  sumByStk, remapToMaDiem, buildRaw, computeDerived, buildColumns, buildColumnGroups,
  groupRowsByChain, buildSubtotalRow, buildGroupedRows, buildChartImages
};
