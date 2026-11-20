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
const { aggregateDailyRowsByEntity } = require('./compositeReportRunner');
const { loadDiemStkMapping, remapRowsToDiem, buildBuIdLookup } = require('./diemStkMapping');
const { describeColumns } = require('./reportEngine');
const { assignSttIfPresent } = require('./reportCellFormat');
const { exportMultiSheetExcel } = require('./exportExcel');
// Bản 11.4 — fetchRawRows/bucketByDay/rowsInRange/sumNganhHangByStk/
// remapStkMeasuresToMaDiem/sumTransactionsByBuId/remapBuToMaDiem/
// GROUP_ORDER/SECTION_COLORS/OTHER_SECTION_COLOR/ROMAN/groupRowsByChain/
// sumField/buildSubtotalRow TRƯỚC ĐÂY định nghĩa RIÊNG ở file này — gộp
// về lib/doanhThuTongHopHcrcRunner.js (nguồn sự thật duy nhất, dùng CHUNG
// cho cả báo cáo web/Xuất Excel/Xuất PDF) — xem chú thích bản 11.4 ở file
// đó, KHÔNG chép lại logic ở đây để tránh lệch số nếu sửa 1 nơi quên sửa
// nơi kia.
const {
  AREA_DOMAIN, NGANHHANG_DOMAIN, TRANSACTION_DOMAIN,
  vietnamTodayISO, firstOfMonth, firstOfYear, daysInMonth, dayOfMonth,
  divOrNull, pctOrNull, buildColumns, buildColumnGroups,
  fetchTargetsByMaDiem, fetchStaffCountByMaDiem,
  fetchRawRows, bucketByDay, rowsInRange,
  sumNganhHangByStk, remapStkMeasuresToMaDiem, sumTransactionsByBuId, remapBuToMaDiem,
  sumLaiGopByStk, remapLaiGopToMaDiem,
  ROMAN, SECTION_COLORS, OTHER_SECTION_COLOR,
  groupRowsByChain, buildSubtotalRow
} = require('./doanhThuTongHopHcrcRunner');

function pad2(n) { return String(n).padStart(2, '0'); }

// Nhãn NGẮN cho khối "Tổng hợp theo loại hình" cuối sheet (bản 11.0,
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

  // Bản 11.8 — SỬA LỖI THẬT (xem chú thích đầy đủ ở
  // doanhThuTongHopHcrcRunner.js): domain Chỉ tiêu lưu THEO TỪNG NGÀY
  // (1 dòng/ngày/siêu thị), KHÔNG phải 1 dòng/tháng — khoảng
  // `monthStart..monthStart`/`yearStart..monthStart` TRƯỚC ĐÂY chỉ khớp
  // ĐÚNG 1 NGÀY (ngày 1 đầu tháng/tháng), bỏ sót toàn bộ các ngày còn lại
  // — đổi thành `..anchor` (cộng dồn tới ĐÚNG ngày neo, khớp "cộng dồn
  // đến thời điểm lấy báo cáo" người dùng yêu cầu).
  const [areaRaw, nganhHangRaw, giaodichRaw, monthTarget, yearTarget, staffCount] = await Promise.all([
    fetchRawRows(dwhPool, AREA_DOMAIN, yearStart, anchor),
    fetchRawRows(dwhPool, NGANHHANG_DOMAIN, yearStart, anchor),
    fetchRawRows(dwhPool, TRANSACTION_DOMAIN, yearStart, anchor),
    fetchTargetsByMaDiem(dwhPool, monthStart, anchor, targetDomain),
    fetchTargetsByMaDiem(dwhPool, yearStart, anchor, targetDomain),
    fetchStaffCountByMaDiem()
  ]);

  // Diện tích/Nhóm chuỗi — thông tin TĨNH, gộp 1 lần cho cả khoảng.
  const areaAggregated = aggregateDailyRowsByEntity(areaRaw, anchor);
  const areaDiemRows = remapRowsToDiem(areaAggregated, diemMapping, false);
  const areaByMaDiem = new Map();
  for (const r of areaDiemRows) areaByMaDiem.set(r.entityCode, r);

  const nganhHangByDay = bucketByDay(nganhHangRaw);
  const giaodichByDay = bucketByDay(giaodichRaw);
  // Bản 11.8 — Lãi gộp đổi sang domain `doanhthu_chinhanh` (ĐÚNG domain
  // "Doanh thu cuối ngày" dùng, xem chú thích đầy đủ ở
  // doanhThuTongHopHcrcRunner.js:sumLaiGopByStk()) — tái dùng NGUYÊN
  // `areaRaw` đã fetch sẵn ở trên (CÙNG domain AREA_DOMAIN), không cần
  // fetch thêm lần nào.
  const chinhanhByDay = bucketByDay(areaRaw);

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
    const dayLaiGopByMaDiem = remapLaiGopToMaDiem(sumLaiGopByStk(rowsInRange(chinhanhByDay, dayDate, dayDate)), diemMapping);
    const monthLaiGopByMaDiem = remapLaiGopToMaDiem(sumLaiGopByStk(rowsInRange(chinhanhByDay, monthStart, dayDate)), diemMapping);

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
      // Bản 11.8 — xem chú thích đầy đủ ở doanhThuTongHopHcrcRunner.js.
      const laiGopDay = dayLaiGopByMaDiem.get(maDiem) || 0;
      const soBillDay = dayTxByMaDiem.get(maDiem) || 0;

      const dtBanLeMonth = mR.DoanhThuBanLe || 0;
      const dtBanBuonMonth = mR.DoanhThuBanBuon || 0;
      const tongCongMonth = dtBanBuonMonth + dtBanLeMonth;
      const laiGopMonth = monthLaiGopByMaDiem.get(maDiem) || 0;
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
