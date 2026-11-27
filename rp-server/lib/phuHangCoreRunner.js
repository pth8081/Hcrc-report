// lib/phuHangCoreRunner.js — SourceType='phuHangCoreChiTiet'/'phuHangCoreRecap':
// "Báo cáo phủ hàng Core" (4/4 báo cáo "Báo cáo vận hành" mới, theo yêu
// cầu người dùng). Theo xác nhận người dùng (26/11/2026, kèm ảnh 2 tab
// Excel gốc): **CHỈ làm đúng 2 sheet "Chi tiết"/"Recap ST"** — KHÔNG làm
// sheet "So sánh" (biểu đồ xu hướng 7 tuần), "Sheet1" (danh mục lý do lỗi
// đặt hàng), "Nguyên tắc tính tỷ lệ phủ" (text) — xem
// bc-phu-hang-core.md + phuong-an-4-bao-cao-van-hanh.md mục 1. CŨNG CHƯA
// làm quy trình xét duyệt ngoại lệ tuần (ST đề xuất lý do thiếu hàng → MH
// duyệt "mã không tính phủ") — % phủ ở bản này tính THẲNG trên số liệu
// thật, KHÔNG trừ ngoại lệ nào (đúng tinh thần B1 ở phương án gốc).
//
// CHỈ MART (đúng tên file mẫu gốc "BÁO CÁO PHỦ HÀNG CORE MAR") — Minimart
// làm sau theo CÙNG mẫu nếu cần (giống 2 báo cáo "Core stock=0"
// Mart/Minimart đã tách sẵn, xem lib/coreZeroStockRunner.js).
//
// NGUỒN DỮ LIỆU — TÁI DÙNG HOÀN TOÀN, KHÔNG VIEW/ETL mới:
//   - Danh mục Core THEO TỪNG SIÊU THỊ — etl.CoreItemList
//     (lib/coreItemList.js:loadCoreItemListByKho('MART')) — phát hiện khi
//     điều tra lỗi "SELECT permission denied" 26/11: bảng này ĐÃ hỗ trợ
//     sẵn Core theo TỪNG MÃ KHO cụ thể từ bản 9.46 (không chỉ theo loại
//     hình MART/MINIMART chung như phương án gốc từng đoán) — ĐÚNG khớp
//     yêu cầu "Core do MH+VH thống nhất theo từng siêu thị", không cần sửa
//     schema.
//   - SL bán/Doanh số theo (kho, mã hàng), CỘNG DỒN theo khoảng ngày W/W-1
//     — domain ĐÃ CÓ `doanhthu_sku_nganhhang` (bản 10.41, "Doanh thu theo
//     ngành hàng - theo mã hàng") qua `reportFactsHelpers.js:loadSumOverRange()`
//     (hàm MỚI, bản 11.34, generalize loadSumOnDate() cho 1 khoảng ngày +
//     nhiều measure cùng lúc).
//   - SL tồn hiện tại — domain ĐÃ CÓ `tonkho_sku`/`banhang_sku` (dùng
//     CHUNG 3 báo cáo "hết hàng"/"Core stock=0") — công thức tồn ƯỚC TÍNH
//     DÙNG LẠI NGUYÊN VẸN công thức đã chốt ở
//     lib/topSellingZeroStockRunner.js (Tồn hôm qua − Bán hôm nay) — KHÁC
//     rule gốc "đo tồn 14h thứ 6" (không có cách lấy ĐÚNG mốc giờ đó từ dữ
//     liệu đã đồng bộ, dùng tồn ước tính TẠI THỜI ĐIỂM chạy báo cáo thay
//     thế, đủ dùng cho mục đích xem phủ hàng tuần).
//   - "Doanh số toàn ST" (mẫu số tỷ trọng, LOẠI ngành Ultra Fresh theo
//     đúng "Nguyên tắc tính tỷ lệ phủ" trong file mẫu) — domain ĐÃ CÓ
//     `doanhthu_nganhhang` (NHỎ HƠN NHIỀU `doanhthu_sku_nganhhang` — đã
//     gộp sẵn theo ngành hàng, tránh quét domain SKU rất lớn cho số này).
//
// "W"/"W-1" — ĐÚNG định nghĩa đã dùng ở lib/kinhDoanhTuanRunner.js: W = 7
// ngày LIÊN TIẾP kết thúc đúng ngày neo (filterValues.eventDate, mặc định
// hôm nay, giờ Việt Nam) — [neo-6, neo]; W-1 = [neo-13, neo-7] — KHÔNG
// phải tuần dương lịch Thứ Hai → Chủ Nhật.
//
// ⚠️ GIẢ ĐỊNH CHƯA CHỐT (bản đầu — "khung", bổ sung sau nếu cần):
//   - Ngưỡng "có hàng" HARDCODE = 5 (đúng text "Nguyên tắc tính tỷ lệ phủ"
//     cho MART — chưa làm UI khai báo được).
//   - "Doanh số Core"/"Tỷ trọng" ở Recap ST dùng kỳ W-1 (đúng rule "doanh
//     thu lấy kỳ W-1" ghi trong file mẫu — có vẻ chủ ý tránh số liệu tuần
//     hiện tại CHƯA chốt đủ 7 ngày khi chạy báo cáo giữa tuần).
//   - Mã 232 (không rõ kênh bán buôn/lẻ) vẫn gộp trong SoLuongBan/DoanhThu
//     Total của domain `doanhthu_sku_nganhhang` — ĐÚNG hành vi domain gốc,
//     không xử lý riêng.
const { getPool } = require('../db');
const {
  todayUTC, daysAgoUTC, loadLatestMeasureBefore, loadSumOnDate, loadSumOverRange, loadLatestDimensionsForDomainByCode
} = require('./reportFactsHelpers');
const { fetchAllReportRows, aggregateDailyRowsByEntity } = require('./compositeReportRunner');
const { loadCoreItemListByKho, getLastLoadError } = require('./coreItemList');
const { loadDiemStkMapping, buildStkIdLookup } = require('./diemStkMapping');
const { assignSttIfPresent } = require('./reportCellFormat');

const STOCK_DOMAIN = 'tonkho_sku';
const TODAY_SALES_DOMAIN = 'banhang_sku';
const SALES_DETAIL_DOMAIN = 'doanhthu_sku_nganhhang';
const STORE_REVENUE_DOMAIN = 'doanhthu_nganhhang';
const ULTRA_FRESH_DEPT_ID = '1001';
const STOCK_THRESHOLD_MART = 5;

function pad(n) { return String(n).padStart(2, '0'); }
function parseISO(s) { return new Date(`${s}T00:00:00Z`); }
function toISO(d) { return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`; }
function addDays(s, n) { const d = parseISO(s); d.setUTCDate(d.getUTCDate() + n); return toISO(d); }
function vietnamTodayISO() { return toISO(new Date(Date.now() + 7 * 3600 * 1000)); }
// formatDateVN/buildPeriodLabel (bản 11.35, theo yêu cầu người dùng — "W
// là tuần từ ngày nào đến ngày nào cần có trong báo cáo") — mirror đúng
// lib/kinhDoanhTuanRunner.js.
function formatDateVN(iso) {
  const [y, m, d] = iso.split('-');
  return `${d}/${m}/${y}`;
}
function buildPeriodLabel({ wFrom, wTo, w1From, w1To }) {
  return `Tuần này (W): ${formatDateVN(wFrom)} – ${formatDateVN(wTo)} · Tuần trước (W-1): ${formatDateVN(w1From)} – ${formatDateVN(w1To)}`;
}

function resolveAnchor(filterValues) {
  return (typeof filterValues.eventDate === 'string' && filterValues.eventDate) || vietnamTodayISO();
}

function pctOrNull(numerator, denominator) {
  if (!denominator) return null;
  return Math.round((numerator / denominator) * 1000) / 10;
}

// Bước dùng CHUNG cho cả 2 sheet — quét candidates (kho, mã hàng) khớp
// danh mục Core, tính đủ số liệu thô cho MỖI candidate, rồi 2 hàm
// buildChiTietRows()/buildRecapRows() tự chiếu ra đúng cột của sheet đó.
async function computeCoreData(filterValues) {
  const pool = await getPool('DWH');
  const anchor = resolveAnchor(filterValues);
  const wFrom = addDays(anchor, -6);
  const wTo = anchor;
  const w1From = addDays(anchor, -13);
  const w1To = addDays(anchor, -7);

  const coreByKho = await loadCoreItemListByKho('MART');
  if (!coreByKho.size) {
    const loadErr = getLastLoadError();
    const warning = loadErr
      ? `KHÔNG đọc được danh sách hàng Core (lỗi kết nối CSDL riêng cho báo cáo này — "${loadErr.message}").`
      : 'Chưa có danh sách hàng Core cho MART — vào "Danh sách hàng Core" (etl-admin) để upload.';
    return { candidates: [], warnings: [warning], wFrom, wTo, w1From, w1To };
  }

  // SỬA LỖI HIỆU NĂNG THẬT (bản 11.55, theo báo cáo người dùng — "Phủ hàng
  // Core" tải chậm) — TRƯỚC ĐÂY quét TOÀN BỘ domain tồn kho
  // (loadLatestDimensionsForDomain(), bounded 35 ngày nhưng domain này giữ
  // lịch sử 5-11 TRIỆU dòng — xem daysAgoUTC()) RỒI MỚI lọc theo danh mục
  // Core SAU KHI đã lấy hết về JS — KHÁC "Core stock=0"/"Top bán chạy"
  // (mirror sai theo — 2 báo cáo đó THẬT SỰ không biết trước thực thể nào
  // sẽ hết hàng nên buộc phải quét hết). Ở ĐÂY danh mục Core
  // (etl.CoreItemList) ĐÃ BIẾT TRƯỚC CHÍNH XÁC những mã hàng cần theo dõi
  // — lọc THẲNG theo cột `MaHangHienThi` (đã persisted+index sẵn, dùng
  // CHUNG cho mọi domain, xem dwh/schema.sql bản 11.38) ngay trong SQL
  // (loadLatestDimensionsForDomainByCode(), seek qua index rồi mới
  // PARTITION BY EntityCode trên tập ĐÃ LỌC nhỏ hơn nhiều) thay vì quét
  // nguyên domain. Lấy dư 1 chút (gộp mã hàng của MỌI kho, không tách theo
  // từng kho — IN-list chỉ lọc được 1 cột) — lọc khớp ĐÚNG kho ở vòng
  // for bên dưới như cũ, không đổi kết quả.
  const allCoreCodes = [...new Set([...coreByKho.values()].flatMap(m => [...m.keys()]))];
  const stockDims = await loadLatestDimensionsForDomainByCode(pool, STOCK_DOMAIN, ['MaChiNhanh', 'TenChiNhanh', 'MaHangHienThi', 'TenHang'], 'MaHangHienThi', allCoreCodes, daysAgoUTC(35));
  const candidates = [];
  for (const [entityCode, info] of stockDims) {
    const d = info.dimensions;
    if (!d.MaChiNhanh) continue;
    const coreMapForKho = coreByKho.get(d.MaChiNhanh);
    if (!coreMapForKho || !d.MaHangHienThi || !coreMapForKho.has(d.MaHangHienThi)) continue;
    candidates.push({ entityCode, ...d, coreRef: coreMapForKho.get(d.MaHangHienThi) });
  }
  if (!candidates.length) {
    return {
      candidates: [], coreByKho,
      warnings: [`Danh mục Core (MART) có ${[...coreByKho.values()].reduce((s, m) => s + m.size, 0)} mã hàng, nhưng KHÔNG mã nào khớp dữ liệu tồn kho đã đồng bộ (domain "${STOCK_DOMAIN}") — kiểm tra lại mã kho/mã hàng trong "Danh sách hàng Core" có khớp CHÍNH XÁC với dữ liệu DSMART đã đồng bộ không.`],
      wFrom, wTo, w1From, w1To
    };
  }
  const entityCodes = candidates.map(c => c.entityCode);
  const today = todayUTC();

  const [yesterdayStockByEntity, todaySalesByEntity, wSums, w1Sums, diemMapping] = await Promise.all([
    loadLatestMeasureBefore(pool, STOCK_DOMAIN, entityCodes, 'SoLuongTon', today),
    loadSumOnDate(pool, TODAY_SALES_DOMAIN, entityCodes, 'SoLuongBan', today),
    loadSumOverRange(pool, SALES_DETAIL_DOMAIN, entityCodes, ['SoLuongBan', 'DoanhThu'], wFrom, wTo),
    loadSumOverRange(pool, SALES_DETAIL_DOMAIN, entityCodes, ['SoLuongBan', 'DoanhThu'], w1From, w1To),
    loadDiemStkMapping()
  ]);
  const stkLookup = buildStkIdLookup(diemMapping);

  const rows = candidates.map(c => {
    const yesterdayStock = yesterdayStockByEntity.get(c.entityCode);
    const todaySales = todaySalesByEntity.get(c.entityCode) || 0;
    const tonKho = (yesterdayStock === undefined || yesterdayStock === null) ? null : (yesterdayStock - todaySales);
    const w = wSums.get(c.entityCode) || {};
    const w1 = w1Sums.get(c.entityCode) || {};
    const diemInfo = stkLookup.get(c.MaChiNhanh);
    return {
      maDiem: c.coreRef.maDiem || (diemInfo ? diemInfo.maDiem : null),
      maKho: c.MaChiNhanh,
      tenKho: (diemInfo && diemInfo.tenSieuThi) || c.TenChiNhanh || c.MaChiNhanh,
      maHang: c.MaHangHienThi,
      tenHang: c.TenHang,
      dvt: c.coreRef.dvt || null,
      maNganh: c.coreRef.maNganh || null,
      tenNganh: c.coreRef.tenNganh || null,
      slBanW1: w1.SoLuongBan || 0,
      slBanW: w.SoLuongBan || 0,
      doanhSoW1: w1.DoanhThu || 0,
      doanhSoW: w.DoanhThu || 0,
      tonKho,
      coHang: tonKho !== null && tonKho >= STOCK_THRESHOLD_MART ? 1 : 0
    };
  });

  return { candidates: rows, coreByKho, warnings: [], anchor, wFrom, wTo, w1From, w1To };
}

function describeChiTietColumns() {
  return [
    { key: 'stt', label: 'TT', width: 0.5 },
    { key: 'maDiem', label: 'Mã điểm', width: 0.8 },
    { key: 'maKho', label: 'Mã kho', width: 0.8 },
    { key: 'tenKho', label: 'Tên kho', width: 1.6 },
    { key: 'maHang', label: 'Mã hàng', width: 0.8 },
    { key: 'tenHang', label: 'Tên hàng', width: 1.6 },
    { key: 'dvt', label: 'Đvt', width: 0.6 },
    { key: 'maNganh', label: 'Mã ngành', width: 0.8 },
    { key: 'tenNganh', label: 'Tên ngành', width: 1.4 },
    { key: 'slBanW1', label: 'SL bán W-1', width: 0.9 },
    { key: 'slBanW', label: 'SL bán W', width: 0.9 },
    { key: 'doanhSoW1', label: 'Doanh số W-1', width: 1.2 },
    { key: 'doanhSoW', label: 'Doanh số W', width: 1.2 },
    { key: 'tonKho', label: 'SL tồn', width: 0.9 },
    { key: 'coHang', label: 'Có hàng (≥5)', width: 1 }
  ];
}

function describeRecapColumns() {
  return [
    { key: 'stt', label: 'TT', width: 0.5 },
    { key: 'maDiem', label: 'Mã điểm', width: 0.8 },
    { key: 'maKho', label: 'Mã kho', width: 0.8 },
    { key: 'tenKho', label: 'Tên kho', width: 1.6 },
    { key: 'soMaQuyHoach', label: 'Số mã Core quy hoạch', width: 1.3 },
    { key: 'soMaCoHang', label: 'Số mã có hàng', width: 1.1 },
    { key: 'tyLePhu', label: '% phủ', width: 0.9, format: 'percent' },
    { key: 'doanhSoCoreW1', label: 'Doanh số Core (W-1)', width: 1.3 },
    { key: 'doanhSoToanStW1', label: 'Doanh số toàn ST (W-1, trừ Ultra Fresh)', width: 1.6 },
    { key: 'tyTrong', label: 'Tỷ trọng Core/toàn ST', width: 1.2, format: 'percent' },
    { key: 'tangTruongW', label: 'Tăng trưởng Doanh số Core W/W-1', width: 1.3, format: 'percent' }
  ];
}

async function runPhuHangCoreChiTietReport(definition, filterValues = {}) {
  const data = await computeCoreData(filterValues);
  const { candidates, warnings } = data;
  const rows = candidates
    .slice()
    .sort((a, b) => (a.tenKho || '').localeCompare(b.tenKho || '', 'vi') || (a.maHang || '').localeCompare(b.maHang || '', 'vi'));
  const columns = describeChiTietColumns();
  assignSttIfPresent(rows, columns);
  return { columns, rows, warnings, columnGroups: null, standaloneColumnColors: null, periodLabel: buildPeriodLabel(data) };
}

async function runPhuHangCoreRecapReport(definition, filterValues = {}) {
  // SỬA HIỆU NĂNG (bản 11.55) — TRƯỚC ĐÂY gọi computeCoreData() (chuỗi
  // dài, quét 35 ngày domain tonkho_sku + 2 lượt loadSumOverRange 7 ngày)
  // XONG MỚI bắt đầu quét storeRevenueRaw (domain doanhthu_nganhhang, 7
  // ngày) — 2 việc này ĐỘC LẬP HOÀN TOÀN (storeRevenueRaw chỉ cần
  // w1From/w1To, tính được NGAY từ filterValues, không cần đợi
  // computeCoreData() xong) — chạy SONG SONG thay vì nối tiếp, giảm tổng
  // thời gian chờ đúng bằng thời gian của lượt NGẮN HƠN trong 2 lượt.
  const anchorForRevenue = resolveAnchor(filterValues);
  const w1FromEarly = addDays(anchorForRevenue, -13);
  const w1ToEarly = addDays(anchorForRevenue, -7);
  const pool = await getPool('DWH');
  const [data, storeRevenueRaw] = await Promise.all([
    computeCoreData(filterValues),
    fetchAllReportRows(
      pool,
      { domain: STORE_REVENUE_DOMAIN, filters: [{ field: 'eventDate', type: 'dateRange' }] },
      { eventDate: { from: w1FromEarly, to: w1ToEarly } }
    )
  ]);
  const { candidates, coreByKho, warnings, w1From, w1To } = data;
  if (!candidates.length) {
    return { columns: describeRecapColumns(), rows: [], warnings, columnGroups: null, standaloneColumnColors: null, periodLabel: buildPeriodLabel(data) };
  }

  const byKho = new Map();
  for (const r of candidates) {
    if (!byKho.has(r.maKho)) byKho.set(r.maKho, { maDiem: r.maDiem, maKho: r.maKho, tenKho: r.tenKho, items: [] });
    byKho.get(r.maKho).items.push(r);
  }

  // "Doanh số toàn ST" (mẫu số tỷ trọng, kỳ W-1, LOẠI ngành Ultra Fresh) —
  // domain `doanhthu_nganhhang` NHỎ (đã gộp theo ngành hàng/ngày), quét
  // qua fetchAllReportRows() + aggregateDailyRowsByEntity() (mirror đúng
  // cách lib/nganhHangBrgRunner.js dùng domain này), rồi CỘNG DỒN theo
  // STK_ID (bỏ DEPT_ID) ở tầng JS — entityCode của domain này là
  // "<STK_ID>_<DEPT_ID>", KHÔNG gộp sẵn theo STK_ID. (Đã quét SONG SONG ở
  // trên — w1From/w1To ở đây PHẢI khớp ĐÚNG w1FromEarly/w1ToEarly, cùng 1
  // anchor/công thức addDays(), không tính lại khác đi.)
  // SỬA LỖI THẬT (bản 11.55, CÙNG lớp lỗi đã sửa ở lib/dioNganhHangRunner.js
  // — xem chú thích đầy đủ ở đó) — TRƯỚC ĐÂY tách STK_ID bằng
  // `entityCode.lastIndexOf('_')` (parse NGƯỢC từ EntityCode =
  // "<STK_ID>_<DEPT_ID>") — VIEW nguồn `V_HCRC_DOANHTHU_NGANHHANG` build
  // EntityCode bằng STK_ID CHƯA RTRIM (cột CHAR cố định độ dài) → `stkId`
  // lấy ra CÒN NGUYÊN khoảng trắng đệm, KHÔNG BAO GIỜ khớp `maKho` sạch
  // (từ domain `tonkho_sku` KHÁC, đã trim sẵn) → "Doanh số toàn ST (W-1)"/
  // "Tỷ trọng Core/toàn ST" ÂM THẦM ra 0% MỌI siêu thị dù có doanh thu
  // thật. Đọc THẲNG `row.dimensions.STK_ID`/`DEPT_ID` (tự `.trim()`) thay
  // vì parse lại từ entityCode.
  const storeRevenueByStk = new Map();
  for (const row of aggregateDailyRowsByEntity(storeRevenueRaw)) {
    const stkIdRaw = row.dimensions && row.dimensions.STK_ID;
    const stkId = typeof stkIdRaw === 'string' ? stkIdRaw.trim() : stkIdRaw;
    if (!stkId) continue;
    const deptId = row.dimensions && row.dimensions.DEPT_ID;
    if (deptId === ULTRA_FRESH_DEPT_ID) continue; // loại Ultra Fresh khỏi mẫu số, đúng "Nguyên tắc tính tỷ lệ phủ".
    const doanhThu = Number(row.measures.DoanhThu) || 0;
    storeRevenueByStk.set(stkId, (storeRevenueByStk.get(stkId) || 0) + doanhThu);
  }

  const rows = [];
  for (const [maKho, group] of byKho) {
    const soMaQuyHoach = coreByKho.get(maKho) ? coreByKho.get(maKho).size : group.items.length;
    const soMaCoHang = group.items.filter(i => i.coHang === 1).length;
    const doanhSoCoreW1 = group.items.reduce((s, i) => s + i.doanhSoW1, 0);
    const doanhSoCoreW = group.items.reduce((s, i) => s + i.doanhSoW, 0);
    const doanhSoToanStW1 = storeRevenueByStk.get(maKho) || 0;
    rows.push({
      maDiem: group.maDiem,
      maKho,
      tenKho: group.tenKho,
      soMaQuyHoach,
      soMaCoHang,
      tyLePhu: pctOrNull(soMaCoHang, soMaQuyHoach),
      doanhSoCoreW1: Math.round(doanhSoCoreW1),
      doanhSoToanStW1: Math.round(doanhSoToanStW1),
      tyTrong: pctOrNull(doanhSoCoreW1, doanhSoToanStW1),
      tangTruongW: pctOrNull(doanhSoCoreW - doanhSoCoreW1, doanhSoCoreW1)
    });
  }

  rows.sort((a, b) => (a.tenKho || '').localeCompare(b.tenKho || '', 'vi'));
  const columns = describeRecapColumns();
  assignSttIfPresent(rows, columns);
  return { columns, rows, warnings, columnGroups: null, standaloneColumnColors: null, periodLabel: buildPeriodLabel(data) };
}

module.exports = { runPhuHangCoreChiTietReport, runPhuHangCoreRecapReport, describeChiTietColumns, describeRecapColumns };
