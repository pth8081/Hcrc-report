// lib/doanhThuTongHopHcrcRunner.js — SourceType='doanhThuTongHopHcrc' (bản
// 10.82, theo yêu cầu người dùng — "Báo cáo tổng hợp doanh thu siêu thị
// hàng ngày", dựa trên file mẫu thật đội vận hành đang tự tổng hợp tay).
//
// MỖI DÒNG = 1 mã Điểm, với 3 KHỐI SỐ LIỆU tính SONG SONG cho CÙNG 1 ngày
// được chọn: Ngày (đúng ngày đó), Tháng (từ đầu tháng tới ngày đó), Năm
// (từ đầu năm tới ngày đó) — KHÁC các báo cáo composite khác (chỉ 1 khối
// "khoảng ngày" người dùng tự chọn) — đây là lý do viết RUNNER RIÊNG thay
// vì dùng lib/compositeReportRunner.js (definition không có khái niệm "3
// khối cùng lúc, mỗi khối 1 khoảng ngày khác nhau tính từ 1 ngày neo").
//
// BẢN 10.86 — BỎ VIEW MỚI `vw_DoanhThuTongHopHCRC`/domain
// `doanhthu_tonghop_hcrc` (bản 10.82), TÁI DÙNG domain `doanhthu_nganhhang`
// ĐÃ CÓ SẴN + ĐANG CHẠY THẬT (theo đề xuất người dùng — domain đó ĐÃ tách
// sẵn Bán buôn/Bán lẻ cho báo cáo "Doanh thu theo ngành hàng" đang hiển thị
// đúng số) thay vì chờ tạo VIEW/job đồng bộ MỚI. `doanhthu_nganhhang` gộp
// theo (STK_ID, DEPT_ID, ngày) — mỗi siêu thị có NHIỀU dòng (1 dòng/ngành
// hàng) — CỘNG DỒN thêm 1 bước theo STK_ID (bỏ DEPT_ID) ở
// `fetchNganhHangRevenueByMaDiem()` dưới đây để ra đúng 1 dòng/siêu thị.
// LƯU Ý: cột "Địa điểm" (STOCK.PLACE) KHÔNG có trong bất kỳ domain đã có
// nào — TẠM ĐỂ TRỐNG (null) ở bản này, chưa lấy ra được — xem
// "bc-doanh-thu-tong-hop-hcrc.md" mục ghi chú bản 10.86.
//
// TÁI DÙNG tối đa hạ tầng đã có (không viết lại):
//   - fetchAllReportRows/aggregateDailyRowsByEntity (compositeReportRunner.js)
//     — gọi domain qua lib/reportEngine.js, cộng dồn nhiều ngày về 1 dòng.
//   - remapRowsToDiem (lib/diemStkMapping.js) — dịch STK_ID -> mã Điểm,
//     CỘNG DỒN đúng theo danh sách MaStkMoi của từng mã Điểm.
//   - buildBuIdLookup (lib/diemStkMapping.js) — dịch BU_ID -> mã Điểm cho
//     domain `giaodich_chinhanh` (khác hẳn STK, chỉ 1-1 không phải danh
//     sách, nên dịch tay ở allocateByBuId() dưới đây, không qua
//     remapRowsToDiem — hàm đó CHỈ xử lý đúng kiểu danh sách STK).
//   - runSalesTargetsBlockRange (lib/salesTargetsReader.js) — Chỉ tiêu,
//     DÙNG CHUNG domain `sales-targets-hcrc` đã có cho "Doanh thu cuối
//     ngày" (theo yêu cầu người dùng, KHÔNG tạo Chỉ tiêu riêng).
//
// Số nhân sự: đếm SỐ TÀI KHOẢN được gán quyền xem đúng mã Điểm đó
// (app.UserStoreAccess, CSDL RP — theo yêu cầu người dùng "lấy từ phân
// quyền đã có nhân viên thuộc siêu thị nào là chuẩn nhất") — KHÔNG phải dữ
// liệu DSMART16, đọc THẲNG bằng SQL riêng (không qua domain/dwh.ReportFacts).
//
// "Kế hoạch DT"/"Kế hoạch Bill" hiện trong khối NGÀY thực ra là kế hoạch
// CỦA CẢ THÁNG (đã xác nhận với người dùng, khớp đúng số liệu mẫu — kế
// hoạch ngày không có ý nghĩa tách rời theo từng ngày trong hệ Chỉ tiêu
// hiện có) — dùng CHUNG đúng số đã tính cho khối Tháng, không tính lại.
//
// "Dự kiến hoàn thành kế hoạch" (bản dự báo, theo yêu cầu người dùng) =
// (Doanh thu luỹ kế tháng / số ngày đã qua trong tháng) × tổng số ngày
// trong tháng, so với Kế hoạch DT (cả tháng).
const { sql, getPool } = require('../db');
const { fetchAllReportRows, aggregateDailyRowsByEntity } = require('./compositeReportRunner');
const { runSalesTargetsBlockRange } = require('./salesTargetsReader');
const { loadDiemStkMapping, remapRowsToDiem, buildBuIdLookup } = require('./diemStkMapping');
const { describeColumns } = require('./reportEngine');
const { assignSttIfPresent } = require('./reportCellFormat');

// Bản 10.86 — 2 domain ĐÃ CÓ SẴN, KHÔNG dùng domain mới doanhthu_tonghop_hcrc.
const AREA_DOMAIN = 'doanhthu_chinhanh'; // chỉ lấy dienTich/chain (dimensions, camelCase)
const NGANHHANG_DOMAIN = 'doanhthu_nganhhang'; // DoanhThu/DoanhThuBanLe/DoanhThuBanBuon/LaiGop (PascalCase), gộp theo (STK_ID, DEPT_ID, ngày)
const TRANSACTION_DOMAIN = 'giaodich_chinhanh';
const TARGET_DOMAIN = 'sales-targets-hcrc';
const NGANHHANG_MEASURE_KEYS = ['DoanhThu', 'DoanhThuBanLe', 'DoanhThuBanBuon', 'LaiGop'];

// vietnamTodayISO/firstOfMonth — COPY nguyên từ compositeReportRunner.js
// (hàm đó KHÔNG export, xem chú thích bản 8.26 ở file gốc giải thích lý do
// PHẢI cố định múi giờ Việt Nam, không phụ thuộc múi giờ máy chủ).
function vietnamTodayISO() {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Ho_Chi_Minh' }).format(new Date());
}
function firstOfMonth(dateStr) { return `${dateStr.slice(0, 7)}-01`; }
function firstOfYear(dateStr) { return `${dateStr.slice(0, 4)}-01-01`; }
function daysInMonth(dateStr) {
  const [y, m] = dateStr.split('-').map(Number);
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
}
function dayOfMonth(dateStr) { return Number(dateStr.slice(8, 10)); }

function divOrNull(numerator, denominator) {
  if (!denominator) return null;
  return numerator / denominator;
}
function pctOrNull(numerator, denominator) {
  const v = divOrNull(numerator, denominator);
  return v === null ? null : v * 100;
}

// Diện tích/Nhóm chuỗi — domain `doanhthu_chinhanh` khoá STK_ID trực tiếp
// (1 dòng/siêu thị/ngày) nên remapRowsToDiem dùng được NGUYÊN, không cần
// cộng dồn thêm bước nào.
async function fetchAreaByMaDiem(pool, diemMapping, from, to) {
  const definition = { domain: AREA_DOMAIN, filters: [{ field: 'eventDate', type: 'dateRange' }] };
  const rawRows = await fetchAllReportRows(pool, definition, { eventDate: { from, to } });
  const aggregated = aggregateDailyRowsByEntity(rawRows, to);
  const diemRows = remapRowsToDiem(aggregated, diemMapping, false);
  const byMaDiem = new Map();
  for (const row of diemRows) byMaDiem.set(row.entityCode, row);
  return byMaDiem;
}

// Doanh thu Bán buôn/Bán lẻ/Lãi gộp — domain `doanhthu_nganhhang` khoá
// MaThucThe (1 dòng/siêu thị/NGÀNH HÀNG/ngày, KHÔNG phải 1 dòng/siêu thị)
// — aggregateDailyRowsByEntity cộng dồn theo entityCode (= MaThucThe) nên
// CHỈ gộp được nhiều NGÀY về 1 dòng/(STK_ID,DEPT_ID), còn phải cộng dồn
// THÊM 1 bước theo STK_ID (bỏ DEPT_ID) ở đây mới ra đúng 1 dòng/siêu thị.
async function fetchNganhHangRevenueByMaDiem(pool, diemMapping, from, to) {
  const definition = { domain: NGANHHANG_DOMAIN, filters: [{ field: 'eventDate', type: 'dateRange' }] };
  const rawRows = await fetchAllReportRows(pool, definition, { eventDate: { from, to } });
  const aggregated = aggregateDailyRowsByEntity(rawRows, to); // 1 dòng / (STK_ID, DEPT_ID)

  const byStkId = new Map();
  for (const row of aggregated) {
    // Bản 10.89 — SỬA LỖI THẬT: cột STK_ID trong `Dimensions` của VIEW
    // nguồn `V_HCRC_DOANHTHU_NGANHHANG` KHÔNG RTRIM (lưu nguyên dạng
    // CHAR có đệm khoảng trắng, vd "12171       ") — khác hẳn STK_ID dùng
    // làm entityCode của domain `doanhthu_chinhanh` (đã gọn sẵn qua ETL).
    // KHÔNG trim ở đây khiến remapRowsToDiem() không khớp được BẤT KỲ mã
    // kho nào với danh sách ở "Ánh xạ Điểm - STK_ID" (đã gọn), khiến toàn
    // bộ DT bán buôn/bán lẻ/Lãi gộp ra 0 dù VIEW nguồn có đủ dữ liệu thật
    // (đã xác nhận bằng SQL thật 18/11/2026 — Dimensions JSON thấy rõ
    // "STK_ID":"12171       " có khoảng trắng thừa).
    const stkId = row.dimensions && row.dimensions.STK_ID && row.dimensions.STK_ID.trim();
    if (!stkId) continue;
    let acc = byStkId.get(stkId);
    if (!acc) { acc = { entityCode: stkId, dimensions: {}, measures: {} }; byStkId.set(stkId, acc); }
    const m = row.measures || {};
    for (const key of NGANHHANG_MEASURE_KEYS) {
      acc.measures[key] = (acc.measures[key] || 0) + (m[key] || 0);
    }
  }

  const diemRows = remapRowsToDiem([...byStkId.values()], diemMapping, false);
  const byMaDiem = new Map();
  for (const row of diemRows) byMaDiem.set(row.entityCode, row);
  return byMaDiem;
}

// giaodich_chinhanh khoá BU_ID (1 mã Điểm = ĐÚNG 1 BU_ID, khác STK_ID có
// thể nhiều mã/mã Điểm) — dịch tay, KHÔNG qua remapRowsToDiem (hàm đó chỉ
// hiểu đúng kiểu danh sách STK cũ/mới).
async function fetchTransactionsByMaDiem(pool, buIdLookup, from, to) {
  const definition = { domain: TRANSACTION_DOMAIN, filters: [{ field: 'eventDate', type: 'dateRange' }] };
  const rawRows = await fetchAllReportRows(pool, definition, { eventDate: { from, to } });
  const aggregated = aggregateDailyRowsByEntity(rawRows, to);
  const byMaDiem = new Map();
  for (const row of aggregated) {
    const maDiem = buIdLookup.get(row.entityCode);
    if (!maDiem) continue;
    byMaDiem.set(maDiem, row.measures || {});
  }
  return byMaDiem;
}

async function fetchTargetsByMaDiem(pool, fromPeriod, toPeriod) {
  const rows = await runSalesTargetsBlockRange(pool, TARGET_DOMAIN, fromPeriod, toPeriod);
  const byMaDiem = new Map();
  for (const row of rows) byMaDiem.set(row.entityCode, row);
  return byMaDiem;
}

async function fetchStaffCountByMaDiem() {
  const rpPool = await getPool('RP');
  const result = await rpPool.request().query(`
    SELECT MaDiem, COUNT(DISTINCT UserId) AS SoLuong FROM app.UserStoreAccess GROUP BY MaDiem
  `);
  const byMaDiem = new Map();
  for (const r of result.recordset) byMaDiem.set(r.MaDiem, r.SoLuong);
  return byMaDiem;
}

function buildColumns(labels) {
  return [
    { key: 'stt', label: 'TT' },
    { key: 'maQLKV', label: 'Mã QLKV' },
    { key: 'maDiem', label: 'Mã điểm' },
    { key: 'stkId', label: 'Mã ST/CH' },
    { key: 'tenSieuThi', label: 'Tên siêu thị/cửa hàng' },
    { key: 'chain', label: 'Nhóm chuỗi' },
    { key: 'dienTich', label: 'Diện tích (m2)' },
    { key: 'diaDiem', label: 'Địa điểm' },
    { key: 'nhanSu', label: 'Số lượng nhân sự' },

    { key: 'soBillDay', label: 'Số Bill' },
    { key: 'dtBanBuonDay', label: 'DT bán buôn' },
    { key: 'dtBanLeDay', label: 'DT bán lẻ' },
    { key: 'tongCongDay', label: 'Tổng cộng' },
    { key: 'laiGopDay', label: 'Lãi gộp' },
    { key: 'tyLeLaiGopDay', label: 'Tỉ lệ lãi gộp/DT', format: 'percent' },
    { key: 'dtBqBillDay', label: 'DT bán lẻ BQ/Bill' },
    { key: 'dtBqM2Day', label: 'DT bán lẻ BQ/m2' },
    { key: 'khDoanhThuThang', label: 'Kế hoạch DT (tháng)' },
    { key: 'khBillThang', label: 'Kế hoạch Bill (tháng)' },
    { key: 'khTbGioHangThang', label: 'Kế hoạch TB giỏ hàng (tháng)' },
    { key: 'hoanThanhDTLuyKeThang', label: 'Hoàn thành DT luỹ kế (tháng)', format: 'percent' },
    { key: 'duKienHoanThanh', label: 'Dự kiến hoàn thành kế hoạch (tháng)', format: 'percent' },

    { key: 'soBillMonth', label: 'Số Bill' },
    { key: 'dtBanBuonMonth', label: 'DT bán buôn' },
    { key: 'dtBanLeMonth', label: 'DT bán lẻ' },
    { key: 'tongCongMonth', label: 'Tổng cộng' },
    { key: 'laiGopMonth', label: 'Lãi gộp' },
    { key: 'tyLeLaiGopMonth', label: 'Tỉ lệ lãi gộp/DT', format: 'percent' },
    { key: 'dtBqBillMonth', label: 'DT bán lẻ BQ/Bill' },
    { key: 'dtBqM2Month', label: 'DT bán lẻ BQ/m2' },

    { key: 'soBillYear', label: 'Số Bill' },
    { key: 'dtBanBuonYear', label: 'DT bán buôn' },
    { key: 'dtBanLeYear', label: 'DT bán lẻ' },
    { key: 'tongCongYear', label: 'Tổng cộng' },
    { key: 'dtBqBillYear', label: 'DT bán lẻ BQ/Bill' },
    { key: 'dtBqM2Year', label: 'DT bán lẻ BQ/m2' },

    { key: 'khDoanhThuNam', label: 'KH doanh thu' },
    { key: 'tyLeHoanThanhNam', label: '% hoàn thành', format: 'percent' }
  ];
}

function buildColumnGroups(labels) {
  return [
    {
      label: `Ngày ${labels.day}`, color: 'green',
      keys: ['soBillDay', 'dtBanBuonDay', 'dtBanLeDay', 'tongCongDay', 'laiGopDay', 'tyLeLaiGopDay', 'dtBqBillDay', 'dtBqM2Day',
        'khDoanhThuThang', 'khBillThang', 'khTbGioHangThang', 'hoanThanhDTLuyKeThang', 'duKienHoanThanh']
    },
    {
      label: `Tháng ${labels.month}`, color: 'blue',
      keys: ['soBillMonth', 'dtBanBuonMonth', 'dtBanLeMonth', 'tongCongMonth', 'laiGopMonth', 'tyLeLaiGopMonth', 'dtBqBillMonth', 'dtBqM2Month']
    },
    {
      label: `Năm ${labels.year}`, color: 'orange',
      keys: ['soBillYear', 'dtBanBuonYear', 'dtBanLeYear', 'tongCongYear', 'dtBqBillYear', 'dtBqM2Year']
    },
    { label: 'KH luỹ kế năm', color: 'red', keys: ['khDoanhThuNam', 'tyLeHoanThanhNam'] }
  ];
}

async function runDoanhThuTongHopHcrcReport(definition, filterValues) {
  const today = (filterValues && filterValues.eventDate) || vietnamTodayISO();

  const dayFrom = today, dayTo = today;
  const monthFrom = firstOfMonth(today), monthTo = today;
  const yearFrom = firstOfYear(today), yearTo = today;

  const dwhPool = await getPool('DWH');
  const diemMapping = await loadDiemStkMapping();
  const buIdLookup = buildBuIdLookup(diemMapping);

  // Diện tích/Nhóm chuỗi là thông tin TĨNH (không đổi theo ngày) — chỉ cần
  // lấy 1 lần, dùng khoảng rộng nhất (cả năm) để tối đa khả năng có dữ liệu.
  const areaInfo = await fetchAreaByMaDiem(dwhPool, diemMapping, yearFrom, yearTo);
  const [dayRev, monthRev, yearRev] = await Promise.all([
    fetchNganhHangRevenueByMaDiem(dwhPool, diemMapping, dayFrom, dayTo),
    fetchNganhHangRevenueByMaDiem(dwhPool, diemMapping, monthFrom, monthTo),
    fetchNganhHangRevenueByMaDiem(dwhPool, diemMapping, yearFrom, yearTo)
  ]);
  const [dayTx, monthTx, yearTx] = await Promise.all([
    fetchTransactionsByMaDiem(dwhPool, buIdLookup, dayFrom, dayTo),
    fetchTransactionsByMaDiem(dwhPool, buIdLookup, monthFrom, monthTo),
    fetchTransactionsByMaDiem(dwhPool, buIdLookup, yearFrom, yearTo)
  ]);
  // Kế hoạch DT/Bill hiện ở khối Ngày = kế hoạch CẢ THÁNG (đã xác nhận với
  // người dùng) -> CHỈ cần 2 khối: tháng (dùng chung cho cả "Ngày" lẫn
  // "Tháng") và năm (KH luỹ kế năm).
  const [monthTarget, yearTarget] = await Promise.all([
    fetchTargetsByMaDiem(dwhPool, firstOfMonth(today), firstOfMonth(today)),
    fetchTargetsByMaDiem(dwhPool, firstOfYear(today), firstOfYear(today))
  ]);
  const staffCount = await fetchStaffCountByMaDiem();

  // __storeScope (bản 8.51, app.UserStoreAccess — mảng MaDiem, hoặc null =
  // "Toàn bộ") — SERVER tự gắn theo người đang gọi (xem routes/reports.js),
  // GHI ĐÈ bất kỳ giá trị client gửi lên — mirror ĐÚNG cách
  // lib/compositeReportRunner.js áp dụng, báo cáo này đọc entityCode =
  // ĐÚNG mã Điểm (không qua BU_ID/STK_ID thô) nên áp thẳng không cần dò
  // kiểu entity như compositeReportRunner.js phải làm (báo cáo đó dùng
  // chung code cho nhiều domain có entityCode khác kiểu).
  const storeScope = Array.isArray(filterValues && filterValues.__storeScope) ? new Set(filterValues.__storeScope) : null;

  const rows = [];
  for (const [maDiem, info] of diemMapping) {
    if (storeScope && !storeScope.has(maDiem)) continue;
    const dR = dayRev.get(maDiem) || { dimensions: {}, measures: {} };
    const mR = monthRev.get(maDiem) || { dimensions: {}, measures: {} };
    const yR = yearRev.get(maDiem) || { dimensions: {}, measures: {} };
    const aR = areaInfo.get(maDiem) || { dimensions: {} };
    const dT = dayTx.get(maDiem) || {};
    const mT = monthTx.get(maDiem) || {};
    const yT = yearTx.get(maDiem) || {};
    const mTarget = monthTarget.get(maDiem) || {};
    const yTarget = yearTarget.get(maDiem) || {};

    // Casing của measures/dimensions PHẢI khớp CHÍNH XÁC đúng chuỗi trong
    // measureColumns/dimensionColumns lúc tạo job đồng bộ — domain
    // `doanhthu_chinhanh` dùng camelCase ('dienTich'/'chain', xem
    // etl/scripts/seedLdtdHcrcSync.js), domain `doanhthu_nganhhang` dùng
    // PascalCase ('DoanhThu'/'DoanhThuBanLe'/..., xem
    // etl/scripts/seedNganhHangSync.js) — 2 domain KHÁC NHAU, KHÔNG tự ý
    // đổi casing cho giống nhau.
    const dienTich = aR.dimensions.dienTich || null;
    // Bản 10.86 — "Địa điểm" CHƯA có domain nào cung cấp (bỏ VIEW mới
    // doanhthu_tonghop_hcrc), TẠM để trống — xem ghi chú đầu file.
    const diaDiem = null;
    const chain = info.loaiChuoi || aR.dimensions.chain || null;

    const dtBanLeDay = dR.measures.DoanhThuBanLe || 0;
    const dtBanBuonDay = dR.measures.DoanhThuBanBuon || 0;
    const tongCongDay = dR.measures.DoanhThu || 0;
    const laiGopDay = dR.measures.LaiGop || 0;
    const soBillDay = dT.SoGiaoDich || 0;

    const dtBanLeMonth = mR.measures.DoanhThuBanLe || 0;
    const dtBanBuonMonth = mR.measures.DoanhThuBanBuon || 0;
    const tongCongMonth = mR.measures.DoanhThu || 0;
    const laiGopMonth = mR.measures.LaiGop || 0;
    const soBillMonth = mT.SoGiaoDich || 0;

    const dtBanLeYear = yR.measures.DoanhThuBanLe || 0;
    const dtBanBuonYear = yR.measures.DoanhThuBanBuon || 0;
    const tongCongYear = yR.measures.DoanhThu || 0;
    const soBillYear = yT.SoGiaoDich || 0;

    const khDoanhThuThang = typeof mTarget.ChiTieuDoanhThu === 'number' ? mTarget.ChiTieuDoanhThu : null;
    const khBillThang = typeof mTarget.ChiTieuGiaoDich === 'number' ? mTarget.ChiTieuGiaoDich : null;
    const khDoanhThuNam = typeof yTarget.ChiTieuDoanhThu === 'number' ? yTarget.ChiTieuDoanhThu : null;

    const elapsedDays = dayOfMonth(today);
    const totalDaysInMonth = daysInMonth(today);
    const projectedMonthRevenue = elapsedDays > 0 ? (tongCongMonth / elapsedDays) * totalDaysInMonth : null;

    rows.push({
      maQLKV: info.maQLKV || null,
      maDiem,
      stkId: (info.maStkMoi || []).join(', ') || null,
      tenSieuThi: info.tenSieuThi || null,
      chain,
      dienTich,
      diaDiem,
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

  const labels = { day: today, month: today.slice(0, 7), year: today.slice(0, 4) };
  const columns = describeColumns(buildColumns(labels));
  assignSttIfPresent(rows, columns);

  return {
    columns,
    rows,
    columnGroups: buildColumnGroups(labels),
    columnSuperGroups: null
  };
}

// Xuất lại các hằng số/hàm phụ trợ (bản 10.87) — dùng CHUNG ở
// lib/doanhThuTongHopHcrcMonthlyExport.js (xuất Excel 1 sheet/ngày cho cả
// tháng) để KHÔNG chép lại logic domain/công thức tính (dễ lệch số nếu
// sửa 1 nơi quên sửa nơi kia).
module.exports = {
  runDoanhThuTongHopHcrcReport,
  AREA_DOMAIN, NGANHHANG_DOMAIN, TRANSACTION_DOMAIN, TARGET_DOMAIN, NGANHHANG_MEASURE_KEYS,
  vietnamTodayISO, firstOfMonth, firstOfYear, daysInMonth, dayOfMonth, divOrNull, pctOrNull,
  buildColumns, buildColumnGroups,
  fetchTargetsByMaDiem, fetchStaffCountByMaDiem
};
