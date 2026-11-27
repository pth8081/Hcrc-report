// lib/doanhThuMtdKeHoachRunner.js — SourceType='doanhThuMtdKeHoach': báo
// cáo "Theo dõi doanh thu MTD theo kế hoạch" — GỘP 3 ReportId cũ (Toàn
// chuỗi/LFL/NSO) THÀNH 1 (bản 11.52, theo yêu cầu người dùng — đối chiếu
// file mẫu thật "0_Thực đạt MTD..." đơn vị gửi) — xem
// bc-doanhthu-mtd-ke-hoach.md. 3 dòng tổng hợp (Tổng toàn chuỗi/NSO/LFL)
// LUÔN hiện Ở ĐẦU bảng CÙNG 1 báo cáo, đúng bố cục file mẫu — KHÔNG còn cần
// chọn riêng từng ReportId theo loaiSieuThi như trước (2 ReportId cũ
// `bc-doanhthu-mtd-lfl`/`bc-doanhthu-mtd-nso` đã chuyển IsActive=0, xem
// scripts/seedDoanhThuMtdKeHoachReports.js).
//
// NGUỒN DỮ LIỆU — PHẦN TỰ ĐỘNG (không cần nhập tay gì thêm):
//   - "Thực đạt" TỔNG — domain ĐÃ CÓ `doanhthu_chinhanh` (dùng CHUNG 4 báo
//     cáo "Doanh thu cuối ngày" LDTD/HCRC) — xem CHÚ THÍCH CŨ bên dưới cho
//     lý do CỘNG DỒN/remap qua lib/diemStkMapping.js.
//   - "Thực đạt" TÁCH Bán lẻ/B2B — domain ĐÃ CÓ `doanhthu_nganhhang`
//     (1 dòng/siêu thị/NGÀNH HÀNG/ngày, có sẵn 2 measure DoanhThuBanLe/
//     DoanhThuBanBuon — xem VIEW "Doanh thu tổng hợp theo siêu thị HCRC") —
//     CỘNG DỒN theo STK_ID (bỏ DEPT_ID) rồi remap về mã Điểm, ĐÚNG mẫu
//     lib/doanhThuTongHopHcrcRunner.js:sumNganhHangByStk()/
//     remapStkMeasuresToMaDiem() (viết lại ở đây thay vì import — mỗi
//     runner tự chứa logic riêng, ĐÚNG quy ước đang dùng khắp
//     rp-server/lib/*.js, xem brgWeeklyPostCore.js/khachHangTuanRunner.js).
//     ⚠️ LƯU Ý: "Thực đạt TỔNG" (cột I) LUÔN lấy từ `doanhthu_chinhanh`
//     (nguồn ĐÃ qua kiểm chứng từ 4 báo cáo Doanh thu cuối ngày) làm SỐ
//     GỐC — "Bán lẻ"/"B2B" (cột J/K) lấy từ `doanhthu_nganhhang` CHỈ để
//     HIỂN THỊ chi tiết, có thể lệch vài đồng so với J+K=I do 2 VIEW nguồn
//     khác nhau (làm tròn/thời điểm đồng bộ) — KHÔNG coi J+K phải khớp
//     tuyệt đối I.
//   - "Bill" (số giao dịch) — domain ĐÃ CÓ `giaodich_chinhanh` (khoá BU_ID
//     = mã Điểm gốc, dịch tay qua buildBuIdLookup() — KHÔNG qua
//     remapRowsToDiem(), đúng mẫu doanhThuTongHopHcrcRunner.js:
//     sumTransactionsByBuId()/remapBuToMaDiem()).
//   - So tháng trước (M-1)/So cùng kỳ năm trước (N-1) — CÙNG domain
//     `doanhthu_chinhanh`, dịch khoảng ngày lùi 1 tháng/1 năm.
//   - LFL/NSO — `etl.NsoStores` (lib/nsoStores.js:loadNsoMaDiemSet(), ĐÃ CÓ
//     SẴN, dùng CHUNG với 2 báo cáo "Doanh thu theo ngành hàng").
//
// NGUỒN DỮ LIỆU — PHẦN NHẬP TAY (bản 11.52, theo xác nhận người dùng — up
// file Excel mỗi kỳ, KHÔNG có ở DSMART16): TÁI DÙNG NGUYÊN domain/cơ chế
// `sales-targets-doanhthu-mtd` đã có (dwh.SalesTargets, định dạng "generic"
// — xem etl/lib/salesTargetsImport.js:parseGenericShape(), 2 cột bắt buộc
// "MaSieuThi"+"Thang", CÁC CỘT SAU TUỲ Ý — KHÔNG cần sửa code import, chỉ
// cần thêm cột vào file Excel upload) — các cột MỚI (TUỲ CHỌN, để trống
// vẫn chạy được, hiện "—"):
//   - ChiTieuBanLe/ChiTieuB2B — tách Chỉ tiêu Bán lẻ/B2B (ChiTieuDoanhThu
//     cũ vẫn là Chỉ tiêu TỔNG, giữ nguyên bắt buộc như trước).
//   - CTTV/Horeca/KhachBuon — 3 THÀNH PHẦN của B2B thực đạt (KHÔNG có
//     nguồn DSMART16 nào tách được — xác nhận qua đối chiếu file mẫu thật,
//     xem VERSION.md bản 11.52).
//   - UocThucHienBanLe/UocThucHienBanBuon — "Ước thực hiện cuối tháng" do
//     QLKV tự ước tính mỗi kỳ (KHÔNG tính tự động được — số liệu NHẬN ĐỊNH
//     kinh doanh, không phải số liệu phát sinh trên DSMART16).
//
// ⚠️ CHƯA LÀM (phạm vi v1, theo đúng những gì đã xác nhận có nguồn/ cơ chế
// nhập — xem VERSION.md bản 11.52 cho lý do): "Ước thực hiện theo trend"
// (khác "Ước thực hiện cuối tháng" ở trên — trend tính theo trung bình
// ngày thực hiện x30, cần thêm "Buôn trong lẻ" + số ngày thực hiện thực
// tế), "Buôn trong lẻ", "Sữa 3A đợt 1" (theo dõi RIÊNG 1 đợt khuyến mãi cụ
// thể, không phải khái niệm chung của báo cáo MTD) — báo lại nếu cần làm
// thêm.
const { getPool } = require('../db');
const { fetchAllReportRows, aggregateDailyRowsByEntity, resolveRequestedRange } = require('./compositeReportRunner');
const { runSalesTargetsBlockRange } = require('./salesTargetsReader');
const { loadDiemStkMapping, remapRowsToDiem, buildBuIdLookup } = require('./diemStkMapping');
const { loadNsoMaDiemSet } = require('./nsoStores');
const { assignSttIfPresent } = require('./reportCellFormat');

const ACTUAL_DOMAIN = 'doanhthu_chinhanh';
const NGANHHANG_DOMAIN = 'doanhthu_nganhhang';
const TRANSACTION_DOMAIN = 'giaodich_chinhanh';
const TARGET_DOMAIN = 'sales-targets-doanhthu-mtd';
const NGANHHANG_MEASURE_KEYS = ['DoanhThuBanLe', 'DoanhThuBanBuon'];

function firstOfMonth(dateStr) {
  return `${dateStr.slice(0, 7)}-01`;
}

// Giờ Việt Nam (UTC+7) — mirror compositeReportRunner.js:vietnamTodayISO()
// (hàm đó KHÔNG được export, viết lại y hệt — đủ đơn giản để không cần sửa
// file dùng chung chỉ để lộ thêm 1 hàm ngày tháng).
function vietnamTodayISO() {
  const now = new Date(Date.now() + 7 * 60 * 60 * 1000);
  return now.toISOString().slice(0, 10);
}

function shiftYearISO(dateStr, years) {
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Date(Date.UTC(y + years, m - 1, d)).toISOString().slice(0, 10);
}

// shiftMonthISO (bản 11.52) — ĐÚNG tinh thần shiftYearISO() ở trên, lùi
// theo THÁNG thay vì NĂM — dùng Date.UTC() để JS tự chuẩn hoá (vd 31/3 lùi
// 1 tháng -> "31/2" không tồn tại -> tự đẩy thành 2-3/3), CHẤP NHẬN rủi ro
// biên này ở ngày cuối tháng dài hơn tháng trước (y hệt rủi ro 29/2 năm
// nhuận ĐÃ CHẤP NHẬN ở shiftYearISO() từ trước, không xử lý riêng).
function shiftMonthISO(dateStr, months) {
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1 + months, d)).toISOString().slice(0, 10);
}

// formatDateVN (bản 11.35, theo yêu cầu người dùng — rà soát hiển thị
// khoảng ngày đang xem) — cơ chế token "{ngayBaoCao}" (lib/reportTitleDate.js)
// KHÔNG áp dụng đúng được ở đây vì mặc định khi KHÔNG chọn bộ lọc là MTD
// (đầu tháng → hôm nay, xem resolveMtdRange()), KHÁC mặc định "hôm nay" 1
// ngày của resolveRequestedRange() dùng cho token đó.
function formatDateVN(iso) {
  const [y, m, d] = iso.split('-');
  return `${d}/${m}/${y}`;
}

function resolveMtdRange(filterValues) {
  if (filterValues.eventDate && (filterValues.eventDate.from || filterValues.eventDate.to)) {
    return resolveRequestedRange(filterValues);
  }
  const today = vietnamTodayISO();
  return { from: firstOfMonth(today), to: today };
}

function pctOrNull(numerator, denominator) {
  if (!denominator) return null;
  return Math.round((numerator / denominator) * 1000) / 10;
}

function num(v) {
  return typeof v === 'number' && Number.isFinite(v) ? v : null;
}

// sumNganhHangByStk/remapStkMeasuresToMaDiem (bản 11.52) — ĐÚNG mẫu
// lib/doanhThuTongHopHcrcRunner.js (viết lại ở đây, không import — xem chú
// thích đầu file). domain `doanhthu_nganhhang` khoá (STK_ID, DEPT_ID, ngày)
// — PHẢI cộng dồn bỏ DEPT_ID mới ra đúng 1 dòng/siêu thị.
function sumNganhHangByStk(rows) {
  const byStk = new Map();
  for (const row of rows) {
    const stkId = row.dimensions && row.dimensions.STK_ID && row.dimensions.STK_ID.trim();
    if (!stkId) continue;
    let acc = byStk.get(stkId);
    if (!acc) { acc = {}; byStk.set(stkId, acc); }
    const m = row.measures || {};
    for (const key of NGANHHANG_MEASURE_KEYS) acc[key] = (acc[key] || 0) + (m[key] || 0);
  }
  return byStk;
}
function remapStkMeasuresToMaDiem(byStk, diemMapping) {
  const rowsForRemap = [...byStk.entries()].map(([stkId, measures]) => ({ entityCode: stkId, dimensions: {}, measures }));
  const diemRows = remapRowsToDiem(rowsForRemap, diemMapping, false);
  const out = new Map();
  for (const r of diemRows) out.set(r.entityCode, r.measures || {});
  return out;
}

// sumTransactionsByBuId/remapBuToMaDiem (bản 11.52) — ĐÚNG mẫu
// lib/doanhThuTongHopHcrcRunner.js — domain `giaodich_chinhanh` khoá BU_ID
// (= mã Điểm gốc) THẲNG, không qua remapRowsToDiem().
function sumTransactionsByBuId(rows) {
  const byBu = new Map();
  for (const row of rows) {
    const buId = row.entityCode;
    if (!buId) continue;
    byBu.set(buId, (byBu.get(buId) || 0) + ((row.measures && row.measures.SoGiaoDich) || 0));
  }
  return byBu;
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

async function fetchActualTotalMap(pool, diemMapping, range) {
  const raw = await fetchAllReportRows(pool, { domain: ACTUAL_DOMAIN, filters: [{ field: 'eventDate', type: 'dateRange' }] }, { eventDate: range });
  return new Map(remapRowsToDiem(aggregateDailyRowsByEntity(raw), diemMapping, false).map(r => [r.entityCode, r]));
}

function describeColumns() {
  return [
    { key: 'stt', label: 'TT', width: 0.5 },
    { key: 'maDiem', label: 'Mã điểm', width: 0.8 },
    { key: 'tenDiem', label: 'Tên điểm', width: 1.8 },
    { key: 'chiTieuTong', label: 'Chỉ tiêu — Tổng', width: 1.1 },
    { key: 'chiTieuBanLe', label: 'Chỉ tiêu — Bán lẻ', width: 1.1 },
    { key: 'chiTieuB2B', label: 'Chỉ tiêu — B2B', width: 1.1 },
    { key: 'thucDatTong', label: 'Thực đạt (MTD) — Tổng', width: 1.1 },
    { key: 'thucDatBanLe', label: 'Thực đạt (MTD) — Bán lẻ', width: 1.1 },
    { key: 'thucDatB2B', label: 'Thực đạt (MTD) — B2B', width: 1.1 },
    { key: 'cttv', label: 'Thực đạt (MTD) — CTTV', width: 1.1 },
    { key: 'horeca', label: 'Thực đạt (MTD) — Horeca', width: 1.1 },
    { key: 'khachBuon', label: 'Thực đạt (MTD) — Khách buôn', width: 1.1 },
    { key: 'bill', label: 'Bill', width: 0.8 },
    { key: 'tyLeDat', label: '% hoàn thành', width: 1, format: 'percent' },
    { key: 'gap80', label: 'GAP 80% (Thực đạt − Chỉ tiêu×80%)', width: 1.2 },
    { key: 'uocThucHienBanLe', label: 'Ước thực hiện cuối tháng — Bán lẻ', width: 1.2 },
    { key: 'uocThucHienBanBuon', label: 'Ước thực hiện cuối tháng — Bán buôn', width: 1.2 },
    { key: 'uocThucHienTong', label: 'Ước thực hiện cuối tháng — Tổng', width: 1.2 },
    { key: 'gapVsUth', label: 'GAP vs Ước thực hiện', width: 1.1 },
    { key: 'thucDatThangTruoc', label: '(M-1) Thực hiện', width: 1.1 },
    { key: 'tySoThangTruoc', label: '% +/- (M-1)', width: 1, format: 'percent' },
    { key: 'thucDatCungKyNamTruoc', label: '(N-1) Thực hiện cùng kỳ', width: 1.1 },
    { key: 'tySoCungKyNamTruoc', label: '% +/- (N-1) cùng kỳ', width: 1, format: 'percent' }
  ];
}

// buildGroupRow (bản 11.52) — gộp NHIỀU dòng siêu thị thành 1 dòng tổng
// hợp (Tổng toàn chuỗi/NSO/LFL, xem file mẫu "0_Thực đạt MTD..." sheet
// "Tháng 11.2026" dòng "Grand Total"/"Phố Nối..."/"LFL") — CỘNG DỒN từng
// field số (null coi như 0, ĐÚNG tinh thần Excel SUM() bỏ qua ô trống),
// % TÍNH LẠI từ tử/mẫu đã cộng dồn (KHÔNG lấy trung bình cộng % từng dòng
// — sai về mặt toán học khi các siêu thị có quy mô khác nhau).
function buildGroupRow(label, rows) {
  const sum = (key) => rows.reduce((acc, r) => acc + (num(r[key]) || 0), 0);
  const anyNonNull = (key) => rows.some(r => r[key] !== null && r[key] !== undefined);
  const chiTieuTong = anyNonNull('chiTieuTong') ? sum('chiTieuTong') : null;
  const thucDatTong = anyNonNull('thucDatTong') ? sum('thucDatTong') : null;
  const uocThucHienTong = anyNonNull('uocThucHienTong') ? sum('uocThucHienTong') : null;
  const thucDatThangTruoc = anyNonNull('thucDatThangTruoc') ? sum('thucDatThangTruoc') : null;
  const thucDatCungKyNamTruoc = anyNonNull('thucDatCungKyNamTruoc') ? sum('thucDatCungKyNamTruoc') : null;
  return {
    maDiem: '',
    tenDiem: label,
    chiTieuTong,
    chiTieuBanLe: anyNonNull('chiTieuBanLe') ? sum('chiTieuBanLe') : null,
    chiTieuB2B: anyNonNull('chiTieuB2B') ? sum('chiTieuB2B') : null,
    thucDatTong,
    thucDatBanLe: anyNonNull('thucDatBanLe') ? sum('thucDatBanLe') : null,
    thucDatB2B: anyNonNull('thucDatB2B') ? sum('thucDatB2B') : null,
    cttv: anyNonNull('cttv') ? sum('cttv') : null,
    horeca: anyNonNull('horeca') ? sum('horeca') : null,
    khachBuon: anyNonNull('khachBuon') ? sum('khachBuon') : null,
    bill: anyNonNull('bill') ? sum('bill') : null,
    tyLeDat: (thucDatTong !== null && chiTieuTong) ? pctOrNull(thucDatTong, chiTieuTong) : null,
    gap80: (thucDatTong !== null && chiTieuTong !== null) ? thucDatTong - chiTieuTong * 0.8 : null,
    uocThucHienBanLe: anyNonNull('uocThucHienBanLe') ? sum('uocThucHienBanLe') : null,
    uocThucHienBanBuon: anyNonNull('uocThucHienBanBuon') ? sum('uocThucHienBanBuon') : null,
    uocThucHienTong,
    gapVsUth: (thucDatTong !== null && uocThucHienTong !== null) ? thucDatTong - uocThucHienTong : null,
    thucDatThangTruoc,
    tySoThangTruoc: (thucDatTong !== null && thucDatThangTruoc) ? pctOrNull(thucDatTong - thucDatThangTruoc, thucDatThangTruoc) : null,
    thucDatCungKyNamTruoc,
    tySoCungKyNamTruoc: (thucDatTong !== null && thucDatCungKyNamTruoc) ? pctOrNull(thucDatTong - thucDatCungKyNamTruoc, thucDatCungKyNamTruoc) : null
  };
}

async function runDoanhThuMtdKeHoachReport(definition, filterValues = {}) {
  const pool = await getPool('DWH');
  const range = resolveMtdRange(filterValues);
  const fromPeriod = firstOfMonth(range.from);
  const toPeriod = firstOfMonth(range.to);
  const lastYearRange = { from: shiftYearISO(range.from, -1), to: shiftYearISO(range.to, -1) };
  const lastMonthRange = { from: shiftMonthISO(range.from, -1), to: shiftMonthISO(range.to, -1) };

  const [diemMapping, nsoSet, nganhHangRaw, giaoDichRaw, targetRows] = await Promise.all([
    loadDiemStkMapping(),
    loadNsoMaDiemSet(),
    fetchAllReportRows(pool, { domain: NGANHHANG_DOMAIN, filters: [{ field: 'eventDate', type: 'dateRange' }] }, { eventDate: range }),
    fetchAllReportRows(pool, { domain: TRANSACTION_DOMAIN, filters: [{ field: 'eventDate', type: 'dateRange' }] }, { eventDate: range }),
    runSalesTargetsBlockRange(pool, TARGET_DOMAIN, fromPeriod, toPeriod)
  ]);

  // diemMapping PHẢI có trước mới remap đúng — 3 khối "Thực đạt" (hiện tại/
  // M-1/N-1) cùng gọi domain `doanhthu_chinhanh`, chỉ khác khoảng ngày.
  const [actualByDiem, lastYearMap, lastMonthMap] = await Promise.all([
    fetchActualTotalMap(pool, diemMapping, range),
    fetchActualTotalMap(pool, diemMapping, lastYearRange),
    fetchActualTotalMap(pool, diemMapping, lastMonthRange)
  ]);

  // aggregateDailyRowsByEntity() trước (bản 11.52, SỬA ĐÚNG mẫu đã dùng
  // cho ACTUAL_DOMAIN ở fetchActualTotalMap()) — khử trùng (entity, ngày)
  // theo syncedAt mới nhất RỒI MỚI cộng dồn cả khoảng ngày; THIẾU bước này
  // sẽ đếm TRÙNG nếu 1 ngày đồng bộ lại nhiều lần (xem
  // lib/compositeReportRunner.js:aggregateDailyRowsByEntity()). entityCode
  // của `doanhthu_nganhhang` là "STK_ID_DEPT_ID" (gộp theo NGÀY xong vẫn
  // còn tách theo NGÀNH HÀNG) — sumNganhHangByStk() cộng dồn TIẾP bỏ
  // DEPT_ID mới ra đúng 1 dòng/siêu thị.
  const buIdLookup = buildBuIdLookup(diemMapping);
  const nganhHangByMaDiem = remapStkMeasuresToMaDiem(sumNganhHangByStk(aggregateDailyRowsByEntity(nganhHangRaw)), diemMapping);
  const billByMaDiem = remapBuToMaDiem(sumTransactionsByBuId(aggregateDailyRowsByEntity(giaoDichRaw)), buIdLookup);
  const targetMap = new Map(targetRows.map(r => [r.entityCode, r]));

  const rows = [];
  for (const actualRow of actualByDiem) {
    const maDiem = actualRow.entityCode;

    const target = targetMap.get(maDiem);
    const lastYear = lastYearMap.get(maDiem);
    const lastMonth = lastMonthMap.get(maDiem);
    const nganhHang = nganhHangByMaDiem.get(maDiem);

    const hasThucDat = Object.prototype.hasOwnProperty.call(actualRow.measures, 'DoanhThu');
    const thucDatTong = hasThucDat ? actualRow.measures.DoanhThu : null;
    const dangDong = !!target && target.TrangThai === 'DaDong';
    const hasChiTieu = !!target && !dangDong && target.ChiTieuDoanhThu !== undefined;
    const chiTieuTong = hasChiTieu ? target.ChiTieuDoanhThu : null;
    const hasLastYear = !!lastYear && Object.prototype.hasOwnProperty.call(lastYear.measures, 'DoanhThu');
    const thucDatCungKyNamTruoc = hasLastYear ? lastYear.measures.DoanhThu : null;
    const hasLastMonth = !!lastMonth && Object.prototype.hasOwnProperty.call(lastMonth.measures, 'DoanhThu');
    const thucDatThangTruoc = hasLastMonth ? lastMonth.measures.DoanhThu : null;

    if (!hasThucDat && !hasChiTieu) continue; // mã Điểm chưa có dữ liệu Thực đạt lẫn Chỉ tiêu trong kỳ này -- bỏ qua, không hiện dòng trống.

    const chiTieuBanLe = target ? num(target.ChiTieuBanLe) : null;
    const chiTieuB2B = target ? num(target.ChiTieuB2B) : null;
    const thucDatBanLe = nganhHang ? num(nganhHang.DoanhThuBanLe) : null;
    const thucDatB2B = nganhHang ? num(nganhHang.DoanhThuBanBuon) : null;
    const cttv = target ? num(target.CTTV) : null;
    const horeca = target ? num(target.Horeca) : null;
    const khachBuon = target ? num(target.KhachBuon) : null;
    const bill = billByMaDiem.has(maDiem) ? billByMaDiem.get(maDiem) : null;
    const uocThucHienBanLe = target ? num(target.UocThucHienBanLe) : null;
    const uocThucHienBanBuon = target ? num(target.UocThucHienBanBuon) : null;
    const uocThucHienTong = (uocThucHienBanLe !== null || uocThucHienBanBuon !== null)
      ? (uocThucHienBanLe || 0) + (uocThucHienBanBuon || 0) : null;

    rows.push({
      maDiem,
      isNso: nsoSet.has(maDiem),
      tenDiem: actualRow.dimensions.tenSieuThi || `${maDiem} (chưa khai tên)`,
      chiTieuTong,
      chiTieuBanLe,
      chiTieuB2B,
      thucDatTong,
      thucDatBanLe,
      thucDatB2B,
      cttv,
      horeca,
      khachBuon,
      bill,
      tyLeDat: (hasThucDat && hasChiTieu) ? pctOrNull(thucDatTong, chiTieuTong) : null,
      gap80: (hasThucDat && hasChiTieu) ? thucDatTong - chiTieuTong * 0.8 : null,
      uocThucHienBanLe,
      uocThucHienBanBuon,
      uocThucHienTong,
      gapVsUth: (hasThucDat && uocThucHienTong !== null) ? thucDatTong - uocThucHienTong : null,
      thucDatThangTruoc,
      tySoThangTruoc: (hasThucDat && hasLastMonth) ? pctOrNull(thucDatTong - thucDatThangTruoc, thucDatThangTruoc) : null,
      thucDatCungKyNamTruoc,
      tySoCungKyNamTruoc: (hasThucDat && hasLastYear) ? pctOrNull(thucDatTong - thucDatCungKyNamTruoc, thucDatCungKyNamTruoc) : null
    });
  }

  rows.sort((a, b) => (a.tenDiem || '').localeCompare(b.tenDiem || '', 'vi'));

  // 3 dòng tổng hợp ĐẦU BẢNG (bản 11.52) — ĐÚNG bố cục file mẫu "Grand
  // Total"/"Phố Nối..." (= NSO)/"LFL" (= Grand Total - NSO). Luôn hiện cả
  // 3, KHÔNG phụ thuộc bộ lọc nào — đây CHÍNH LÀ lý do gộp 3 ReportId cũ
  // (loaiSieuThi='ALL'/'LFL'/'NSO') thành 1: người xem thấy CẢ 3 góc nhìn
  // cùng lúc thay vì phải đổi báo cáo.
  const nsoRows = rows.filter(r => r.isNso);
  const lflRows = rows.filter(r => !r.isNso);
  const summaryRows = [
    buildGroupRow('Tổng toàn chuỗi', rows),
    buildGroupRow('NSO', nsoRows),
    buildGroupRow('LFL', lflRows)
  ];
  for (const r of rows) delete r.isNso; // field nội bộ, không thuộc describeColumns()

  const allRows = [...summaryRows, ...rows];
  const columns = describeColumns();
  assignSttIfPresent(allRows, columns);

  const periodLabel = `MTD: ${formatDateVN(range.from)} – ${formatDateVN(range.to)}`
    + ` · So tháng trước: ${formatDateVN(lastMonthRange.from)} – ${formatDateVN(lastMonthRange.to)}`
    + ` · So cùng kỳ năm trước: ${formatDateVN(lastYearRange.from)} – ${formatDateVN(lastYearRange.to)}`;
  return { columns, rows: allRows, columnGroups: null, standaloneColumnColors: null, periodLabel };
}

module.exports = { runDoanhThuMtdKeHoachReport, describeColumns };
