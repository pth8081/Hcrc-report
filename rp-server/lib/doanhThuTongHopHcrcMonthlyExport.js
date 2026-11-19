// lib/doanhThuTongHopHcrcMonthlyExport.js — Xuất Excel 1 SHEET/NGÀY cho CẢ
// THÁNG của báo cáo "Báo cáo tổng hợp doanh thu siêu thị hàng ngày" (Phase
// 2, bản 10.87, theo yêu cầu người dùng — đúng layout mẫu gốc
// "Bao_cao_ban_Doanh_thu_hang_ngay_he_thong_HCRC_T11.2026.xlsx": mỗi sheet
// tên "DD.MM", nhóm "I. CHUỖI MART"/"II. CHUỖI MINIMART" + dòng "TỔNG
// MART"/"TỔNG MINIMART"/"TỔNG HCRC").
//
// SỐ SHEET = đúng số ngày ĐÃ QUA trong tháng tính tới "ngày neo"
// (anchorDate, CÙNG field `eventDate` Phase 1 đang dùng) — vd neo 17/11 ->
// 17 sheet (01.11 tới 17.11); neo = ngày CUỐI tháng -> đủ số ngày thật của
// tháng đó (28/29/30/31). THEO ĐÚNG yêu cầu người dùng — KHÔNG cố định 31
// sheet như file mẫu gốc (file mẫu có sheet "31.11" dù tháng 11 chỉ 30
// ngày — số 0 toàn bộ, là phần DƯ của file mẫu người dùng tự giữ lại khi
// copy từ tháng 31 ngày trước đó, không phải dữ liệu thật).
//
// KHÔNG lặp lại hàng chục lượt gọi DWH riêng (1 lượt/ngày) — fetchAllReportRows()
// domain Doanh thu ngành hàng/Giao dịch CHỈ 1 LẦN (khoảng rộng nhất: đầu
// năm -> ngày neo), rồi GOM NHÓM THEO NGÀY trong bộ nhớ (bucketByDay), mỗi
// ngày trong vòng lặp CHỈ lọc lại mảng đã có sẵn.
//
// 3 dòng "KHO INTIMEX"/"KHO ĐTT"/"TỔNG KHO" ở file mẫu gốc LUÔN =0 ở bản
// 10.87 (file mẫu người dùng gửi lúc đó CHƯA khai LoaiChuoi='KHO' cho 2 mã
// Điểm này, nên rơi vào nhóm "CHƯA PHÂN NHÓM", KHÔNG hiện section "KHO"
// riêng) — ĐÃ XÁC NHẬN LẠI với người dùng (bản 10.99): 2 kho NÀY CÓ Mã
// Điểm/STK_ID thật trong DSMART16 (chỉ chưa khai LoaiChuoi) — sửa
// GROUP_ORDER thêm 'KHO' (xem dưới), tự động có section "CHUỖI KHO" +
// "TỔNG KHO" NGAY KHI admin khai LoaiChuoi='KHO' cho đúng mã Điểm ở
// etl-admin → "Ánh xạ Điểm - STK_ID" — KHÔNG cần đổi gì thêm ở file này.
const { getPool } = require('../db');
const { fetchAllReportRows, aggregateDailyRowsByEntity } = require('./compositeReportRunner');
const { loadDiemStkMapping, remapRowsToDiem, buildBuIdLookup } = require('./diemStkMapping');
const { describeColumns } = require('./reportEngine');
const { assignSttIfPresent } = require('./reportCellFormat');
const { exportMultiSheetExcel } = require('./exportExcel');
const {
  AREA_DOMAIN, NGANHHANG_DOMAIN, TRANSACTION_DOMAIN, NGANHHANG_MEASURE_KEYS,
  vietnamTodayISO, firstOfMonth, firstOfYear, daysInMonth, dayOfMonth,
  divOrNull, pctOrNull, buildColumns, buildColumnGroups,
  fetchTargetsByMaDiem, fetchStaffCountByMaDiem
} = require('./doanhThuTongHopHcrcRunner');

function toISODate(v) {
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  return String(v).slice(0, 10);
}
function pad2(n) { return String(n).padStart(2, '0'); }

async function fetchRawRows(pool, domain, from, to) {
  const definition = { domain, filters: [{ field: 'eventDate', type: 'dateRange' }] };
  return fetchAllReportRows(pool, definition, { eventDate: { from, to } });
}

function bucketByDay(rawRows) {
  const byDay = new Map();
  for (const row of rawRows) {
    const d = toISODate(row.eventDate);
    if (!byDay.has(d)) byDay.set(d, []);
    byDay.get(d).push(row);
  }
  return byDay;
}
function rowsInRange(byDay, from, to) {
  const out = [];
  for (const [d, dayRows] of byDay) {
    if (d >= from && d <= to) out.push(...dayRows);
  }
  return out;
}

function sumNganhHangByStk(rows) {
  const byStk = new Map();
  for (const row of rows) {
    // Bản 10.89 — xem chú thích đầy đủ ở lib/doanhThuTongHopHcrcRunner.js
    // (cùng lỗi, cùng domain `doanhthu_nganhhang`) — STK_ID trong
    // Dimensions KHÔNG RTRIM, phải tự .trim() ở đây mới khớp được với
    // danh sách mã kho ở "Ánh xạ Điểm - STK_ID".
    const stkId = row.dimensions && row.dimensions.STK_ID && row.dimensions.STK_ID.trim();
    if (!stkId) continue;
    let acc = byStk.get(stkId);
    if (!acc) { acc = {}; byStk.set(stkId, acc); }
    const m = row.measures || {};
    for (const key of NGANHHANG_MEASURE_KEYS) acc[key] = (acc[key] || 0) + (m[key] || 0);
  }
  return byStk;
}
function sumTransactionsByBuId(rows) {
  const byBu = new Map();
  for (const row of rows) {
    const buId = row.entityCode;
    if (!buId) continue;
    byBu.set(buId, (byBu.get(buId) || 0) + ((row.measures && row.measures.SoGiaoDich) || 0));
  }
  return byBu;
}
function remapStkMeasuresToMaDiem(byStk, diemMapping) {
  const rowsForRemap = [...byStk.entries()].map(([stkId, measures]) => ({ entityCode: stkId, dimensions: {}, measures }));
  const diemRows = remapRowsToDiem(rowsForRemap, diemMapping, false);
  const out = new Map();
  for (const r of diemRows) out.set(r.entityCode, r.measures || {});
  return out;
}
function remapBuToMaDiem(byBu, buIdLookup) {
  const out = new Map();
  for (const [buId, soGiaoDich] of byBu) {
    const maDiem = buIdLookup.get(buId);
    if (!maDiem) continue;
    out.set(maDiem, (out.get(maDiem) || 0) + soGiaoDich);
  }
  return out;
}

// Nhóm "I. CHUỖI MART"/"II. CHUỖI MINIMART"/"III. CHUỖI KHO" (thứ tự CỐ
// ĐỊNH, khớp file mẫu — KHO thêm bản 10.99) — siêu thị/kho có `chain`
// khác/rỗng dồn vào 1 nhóm cuối "CHƯA PHÂN NHÓM" (hiếm, chỉ khi admin chưa
// khai LoaiChuoi VÀ domain nguồn cũng không có — xem lib/diemStkMapping.js).
const GROUP_ORDER = ['MART', 'MINIMART', 'KHO'];
const SECTION_COLORS = { MART: '174A7C', MINIMART: '2E7D32', KHO: '8A5A00' };
const OTHER_SECTION_COLOR = '6B5B95';
const ROMAN = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII'];

function groupRowsByChain(rows) {
  const groups = new Map();
  for (const row of rows) {
    const key = row.chain && GROUP_ORDER.includes(row.chain) ? row.chain : '__other';
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(row);
  }
  const orderedKeys = [...GROUP_ORDER.filter(k => groups.has(k)), ...(groups.has('__other') ? ['__other'] : [])];
  return orderedKeys.map(key => ({ key, rows: groups.get(key) }));
}

function sumField(rows, key) { return rows.reduce((s, r) => s + (r[key] || 0), 0); }

// Dòng "TỔNG MART"/"TỔNG MINIMART"/"TỔNG HCRC" — CỘNG DỒN đúng các đo
// lường thô của nhóm rồi TÍNH LẠI các tỉ lệ/bình quân từ đúng tổng đó
// (KHÔNG cộng trung bình cộng các tỉ lệ từng dòng — sai số học).
function buildSubtotalRow(groupRows, label, isGrandTotal, elapsedDays, totalDaysInMonth) {
  const keys = [
    'soBillDay', 'dtBanBuonDay', 'dtBanLeDay', 'tongCongDay', 'laiGopDay',
    'khDoanhThuThang', 'khBillThang',
    'soBillMonth', 'dtBanBuonMonth', 'dtBanLeMonth', 'tongCongMonth', 'laiGopMonth',
    'soBillYear', 'dtBanBuonYear', 'dtBanLeYear', 'tongCongYear',
    'khDoanhThuNam', 'dienTich'
  ];
  const s = {};
  for (const k of keys) s[k] = sumField(groupRows, k);
  const projectedMonthRevenue = elapsedDays > 0 ? (s.tongCongMonth / elapsedDays) * totalDaysInMonth : null;

  return {
    tenSieuThi: label,
    dienTich: s.dienTich,
    soBillDay: s.soBillDay, dtBanBuonDay: s.dtBanBuonDay, dtBanLeDay: s.dtBanLeDay,
    tongCongDay: s.tongCongDay, laiGopDay: s.laiGopDay,
    tyLeLaiGopDay: pctOrNull(s.laiGopDay, s.tongCongDay),
    dtBqBillDay: divOrNull(s.dtBanLeDay, s.soBillDay),
    dtBqM2Day: divOrNull(s.dtBanLeDay, s.dienTich),
    khDoanhThuThang: s.khDoanhThuThang, khBillThang: s.khBillThang,
    khTbGioHangThang: divOrNull(s.khDoanhThuThang, s.khBillThang),
    hoanThanhDTLuyKeThang: pctOrNull(s.tongCongMonth, s.khDoanhThuThang),
    duKienHoanThanh: projectedMonthRevenue === null ? null : pctOrNull(projectedMonthRevenue, s.khDoanhThuThang),
    soBillMonth: s.soBillMonth, dtBanBuonMonth: s.dtBanBuonMonth, dtBanLeMonth: s.dtBanLeMonth,
    tongCongMonth: s.tongCongMonth, laiGopMonth: s.laiGopMonth,
    tyLeLaiGopMonth: pctOrNull(s.laiGopMonth, s.tongCongMonth),
    dtBqBillMonth: divOrNull(s.dtBanLeMonth, s.soBillMonth),
    dtBqM2Month: divOrNull(s.dtBanLeMonth, s.dienTich),
    soBillYear: s.soBillYear, dtBanBuonYear: s.dtBanBuonYear, dtBanLeYear: s.dtBanLeYear,
    tongCongYear: s.tongCongYear,
    dtBqBillYear: divOrNull(s.dtBanLeYear, s.soBillYear),
    dtBqM2Year: divOrNull(s.dtBanLeYear, s.dienTich),
    khDoanhThuNam: s.khDoanhThuNam,
    tyLeHoanThanhNam: pctOrNull(s.tongCongYear, s.khDoanhThuNam),
    __isSubtotal: true, __isGrandTotal: !!isGrandTotal
  };
}

// Nhãn NGẮN cho khối "Tổng hợp theo loại hình" cuối sheet (bản 10.100,
// theo yêu cầu người dùng — "làm phần tổng cộng theo hàng ngày mart, mini
// mart, kho, tổng là được", thêm vào CUỐI mỗi sheet đang có, KHÔNG tạo báo
// cáo riêng) — khác chữ "TỔNG MART"/"TỔNG MINIMART"/"TỔNG KHO" đã dùng cho
// dòng tổng NGAY SAU từng nhóm (để phân biệt 2 vị trí, dù CÙNG 1 số liệu).
const RECAP_LABELS = { MART: 'Mart', MINIMART: 'Mini Mart', KHO: 'Kho', __other: 'Khác' };
const RECAP_SECTION_COLOR = '5C5C5C';

function buildGroupedSheetRows(storeRows, elapsedDays, totalDaysInMonth) {
  const groups = groupRowsByChain(storeRows);
  const out = [];
  // recapRows — GIỮ LẠI đúng các dòng tổng đã tính cho từng nhóm (không
  // tính lại) để dựng khối tóm tắt cuối sheet bên dưới.
  const recapRows = [];
  groups.forEach((g, idx) => {
    const roman = ROMAN[idx] || String(idx + 1);
    const isOther = g.key === '__other';
    out.push({
      __isSectionHeader: true,
      __sectionLabel: `${roman}. ${isOther ? 'CHƯA PHÂN NHÓM' : `CHUỖI ${g.key}`}`,
      __sectionColor: isOther ? OTHER_SECTION_COLOR : SECTION_COLORS[g.key]
    });
    out.push(...g.rows);
    const subtotal = buildSubtotalRow(g.rows, `TỔNG ${isOther ? 'KHÁC' : g.key}`, false, elapsedDays, totalDaysInMonth);
    out.push(subtotal);
    recapRows.push({ ...subtotal, tenSieuThi: RECAP_LABELS[g.key] || g.key });
  });
  const grandTotal = buildSubtotalRow(storeRows, 'TỔNG HCRC', true, elapsedDays, totalDaysInMonth);
  out.push(grandTotal);

  // Khối "TỔNG HỢP THEO LOẠI HÌNH" — nhắc lại ĐÚNG các dòng tổng ở trên,
  // gộp liền nhau ở CUỐI sheet (sau toàn bộ danh sách từng siêu thị) để dễ
  // xem nhanh Mart/Mini Mart/Kho/Tổng cộng mà không phải cuộn tìm rải rác
  // theo từng nhóm — KHÔNG tính lại gì (tenSieuThi đổi nhãn, mọi số liệu
  // khác giữ NGUYÊN object đã tính ở trên, tránh lệch số giữa 2 chỗ).
  out.push({
    __isSectionHeader: true,
    __sectionLabel: 'TỔNG HỢP THEO LOẠI HÌNH',
    __sectionColor: RECAP_SECTION_COLOR
  });
  out.push(...recapRows);
  out.push({ ...grandTotal, tenSieuThi: 'Tổng cộng' });

  return out;
}

// anchorDate ('YYYY-MM-DD') — "ngày neo", xác định CẢ tháng xuất (tháng
// chứa anchorDate) LẪN số sheet (= dayOfMonth(anchorDate), xem ghi chú đầu
// file). storeScope — Set<MaDiem> hoặc null (= toàn bộ, admin/không giới
// hạn theo chi nhánh).
// targetDomain (bản 10.90, theo yêu cầu người dùng) — truyền
// 'sales-targets-ldtd' từ route export-month của báo cáo
// bc-doanh-thu-tong-hop-ldtd; không truyền thì mặc định HCRC.
// Bản 10.94 (SỬA bản 10.92, theo yêu cầu người dùng — xem chú thích đầy
// đủ ở doanhThuTongHopHcrcRunner.js) — BỎ domain Chỉ tiêu CẢ NĂM riêng,
// "KH doanh thu" (khối năm) giờ CỘNG DỒN Chỉ tiêu THÁNG đã có (đúng
// targetDomain) từ đầu năm tới ĐÚNG THÁNG của anchorDate (mọi sheet
// trong 1 lần xuất luôn CÙNG 1 tháng, nên chỉ cần tính 1 lần ở đây).
async function buildDoanhThuTongHopHcrcMonthlyWorkbook({ anchorDate, storeScope, targetDomain, titlePrefix }) {
  const reportTitle = (titlePrefix || 'BÁO CÁO TỔNG HỢP DOANH THU SIÊU THỊ HÀNG NGÀY').toUpperCase();
  const anchor = anchorDate || vietnamTodayISO();
  const month = anchor.slice(0, 7);
  const lastDay = dayOfMonth(anchor);
  const monthStart = firstOfMonth(anchor);
  const yearStart = firstOfYear(anchor);

  const dwhPool = await getPool('DWH');
  const diemMapping = await loadDiemStkMapping();
  const buIdLookup = buildBuIdLookup(diemMapping);

  const [areaRaw, nganhHangRaw, giaodichRaw, monthTarget, yearTarget, staffCount] = await Promise.all([
    fetchRawRows(dwhPool, AREA_DOMAIN, yearStart, anchor),
    fetchRawRows(dwhPool, NGANHHANG_DOMAIN, yearStart, anchor),
    fetchRawRows(dwhPool, TRANSACTION_DOMAIN, yearStart, anchor),
    fetchTargetsByMaDiem(dwhPool, monthStart, monthStart, targetDomain),
    fetchTargetsByMaDiem(dwhPool, yearStart, monthStart, targetDomain),
    fetchStaffCountByMaDiem()
  ]);

  // Diện tích/Nhóm chuỗi — thông tin TĨNH, gộp 1 lần cho cả khoảng.
  const areaAggregated = aggregateDailyRowsByEntity(areaRaw, anchor);
  const areaDiemRows = remapRowsToDiem(areaAggregated, diemMapping, false);
  const areaByMaDiem = new Map();
  for (const r of areaDiemRows) areaByMaDiem.set(r.entityCode, r);

  const nganhHangByDay = bucketByDay(nganhHangRaw);
  const giaodichByDay = bucketByDay(giaodichRaw);

  const sheets = [];
  for (let d = 1; d <= lastDay; d++) {
    const dayDate = `${month}-${pad2(d)}`;
    const elapsedDays = d;
    const totalDaysInMonth = daysInMonth(dayDate);

    const dayRevByMaDiem = remapStkMeasuresToMaDiem(sumNganhHangByStk(rowsInRange(nganhHangByDay, dayDate, dayDate)), diemMapping);
    const monthRevByMaDiem = remapStkMeasuresToMaDiem(sumNganhHangByStk(rowsInRange(nganhHangByDay, monthStart, dayDate)), diemMapping);
    const yearRevByMaDiem = remapStkMeasuresToMaDiem(sumNganhHangByStk(rowsInRange(nganhHangByDay, yearStart, dayDate)), diemMapping);
    const dayTxByMaDiem = remapBuToMaDiem(sumTransactionsByBuId(rowsInRange(giaodichByDay, dayDate, dayDate)), buIdLookup);
    const monthTxByMaDiem = remapBuToMaDiem(sumTransactionsByBuId(rowsInRange(giaodichByDay, monthStart, dayDate)), buIdLookup);
    const yearTxByMaDiem = remapBuToMaDiem(sumTransactionsByBuId(rowsInRange(giaodichByDay, yearStart, dayDate)), buIdLookup);

    const storeRows = [];
    for (const [maDiem, info] of diemMapping) {
      if (storeScope && !storeScope.has(maDiem)) continue;
      const aR = areaByMaDiem.get(maDiem) || { dimensions: {} };
      const dienTich = aR.dimensions.dienTich || null;
      const chain = info.loaiChuoi || aR.dimensions.chain || null;

      const dR = dayRevByMaDiem.get(maDiem) || {};
      const mR = monthRevByMaDiem.get(maDiem) || {};
      const yR = yearRevByMaDiem.get(maDiem) || {};
      // Tổng cộng (bản 10.90, theo ảnh mẫu người dùng gửi — công thức
      // "5=3+4") — TÍNH TRỰC TIẾP = DT bán buôn + DT bán lẻ, khớp đúng
      // lib/doanhThuTongHopHcrcRunner.js (Phase 1).
      const dtBanLeDay = dR.DoanhThuBanLe || 0;
      const dtBanBuonDay = dR.DoanhThuBanBuon || 0;
      const tongCongDay = dtBanBuonDay + dtBanLeDay;
      const laiGopDay = dR.LaiGop || 0;
      const soBillDay = dayTxByMaDiem.get(maDiem) || 0;

      const dtBanLeMonth = mR.DoanhThuBanLe || 0;
      const dtBanBuonMonth = mR.DoanhThuBanBuon || 0;
      const tongCongMonth = dtBanBuonMonth + dtBanLeMonth;
      const laiGopMonth = mR.LaiGop || 0;
      const soBillMonth = monthTxByMaDiem.get(maDiem) || 0;

      const dtBanLeYear = yR.DoanhThuBanLe || 0;
      const dtBanBuonYear = yR.DoanhThuBanBuon || 0;
      const tongCongYear = dtBanBuonYear + dtBanLeYear;
      const soBillYear = yearTxByMaDiem.get(maDiem) || 0;

      const mTarget = monthTarget.get(maDiem) || {};
      const yTarget = yearTarget.get(maDiem) || {};
      const khDoanhThuThang = typeof mTarget.ChiTieuDoanhThu === 'number' ? mTarget.ChiTieuDoanhThu : null;
      const khBillThang = typeof mTarget.ChiTieuGiaoDich === 'number' ? mTarget.ChiTieuGiaoDich : null;
      const khDoanhThuNam = typeof yTarget.ChiTieuDoanhThu === 'number' ? yTarget.ChiTieuDoanhThu : null;

      const projectedMonthRevenue = elapsedDays > 0 ? (tongCongMonth / elapsedDays) * totalDaysInMonth : null;

      storeRows.push({
        maQLKV: info.maQLKV || null,
        maDiem,
        stkId: (info.maStkMoi || []).join(', ') || null,
        tenSieuThi: info.tenSieuThi || null,
        chain, dienTich, diaDiem: null,
        nhanSu: staffCount.get(maDiem) || 0,

        soBillDay, dtBanBuonDay, dtBanLeDay, tongCongDay, laiGopDay,
        tyLeLaiGopDay: pctOrNull(laiGopDay, tongCongDay),
        dtBqBillDay: divOrNull(dtBanLeDay, soBillDay),
        dtBqM2Day: divOrNull(dtBanLeDay, dienTich),
        khDoanhThuThang, khBillThang,
        khTbGioHangThang: divOrNull(khDoanhThuThang, khBillThang),
        hoanThanhDTLuyKeThang: pctOrNull(tongCongMonth, khDoanhThuThang),
        duKienHoanThanh: projectedMonthRevenue === null ? null : pctOrNull(projectedMonthRevenue, khDoanhThuThang),

        soBillMonth, dtBanBuonMonth, dtBanLeMonth, tongCongMonth, laiGopMonth,
        tyLeLaiGopMonth: pctOrNull(laiGopMonth, tongCongMonth),
        dtBqBillMonth: divOrNull(dtBanLeMonth, soBillMonth),
        dtBqM2Month: divOrNull(dtBanLeMonth, dienTich),

        soBillYear, dtBanBuonYear, dtBanLeYear, tongCongYear,
        dtBqBillYear: divOrNull(dtBanLeYear, soBillYear),
        dtBqM2Year: divOrNull(dtBanLeYear, dienTich),

        khDoanhThuNam,
        tyLeHoanThanhNam: pctOrNull(tongCongYear, khDoanhThuNam)
      });
    }

    const labels = { day: dayDate, month: dayDate.slice(0, 7), year: dayDate.slice(0, 4) };
    const columns = describeColumns(buildColumns(labels));
    const groupedRows = buildGroupedSheetRows(storeRows, elapsedDays, totalDaysInMonth);
    assignSttIfPresent(groupedRows, columns);

    const [y, m, dd] = dayDate.split('-');
    sheets.push({
      definition: {
        title: `${reportTitle} — ${dd}/${m}/${y}`,
        columns, columnGroups: buildColumnGroups(labels)
      },
      rows: groupedRows,
      sheetName: `${dd}.${m}`
    });
  }

  return exportMultiSheetExcel(sheets);
}

module.exports = { buildDoanhThuTongHopHcrcMonthlyWorkbook };
