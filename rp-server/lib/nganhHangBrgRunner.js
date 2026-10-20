// lib/nganhHangBrgRunner.js — SourceType='nganhHangBrg': định dạng cho 2
// báo cáo "Doanh thu theo ngành hàng" (`bc-doanh-thu-nganhhang`) và "Doanh
// thu theo ngành hàng (LDTD)" (`bc-doanh-thu-nganhhang-ldtd`).
// `targetDomain` lấy từ `definition.targetDomain` (MỖI báo cáo 1 domain
// Chỉ tiêu RIÊNG — `sales-targets-nganhhang-dt`/
// `sales-targets-nganhhang-dt-ldtd`).
//
// RIÊNG so với định dạng CŨ của báo cáo gốc (SourceType='composite', xem
// lib/compositeReportRunner.js) vì CHIA 3 KHỐI LẶP LẠI "Toàn hệ thống BRG" /
// "LFL" / "NSO" từ CÙNG 1 lần đọc domain — composite chỉ ghép ĐÚNG 1 dòng/
// entityCode, không tự nhân bản theo nhóm siêu thị, nên viết runner RIÊNG
// (mirror lib/purchaseOrderRunner.js: dedicated runner cho báo cáo có hình
// dạng đặc thù, TÁI DÙNG các hàm đọc/gộp dữ liệu đã có ở
// lib/compositeReportRunner.js, KHÔNG viết lại logic đọc dwh.ReportFacts).
// Báo cáo "Nhập hàng theo ngành hàng" (`bc-nhap-hang-nganhhang`) KHÔNG đổi
// — giữ nguyên SourceType='composite' cũ, không có khái niệm Lãi gộp/hàng
// hỏng hủy/Bán lẻ-Bán buôn cho nhập hàng.
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
// BẢN 9.68 (theo yêu cầu người dùng — "trong báo cáo doanh thu có phần bán
// buôn ấy... bạn xử lý tiếp báo cáo doanh thu theo ngành hàng ldtd và hcrc
// đi nhé") — 3 THAY ĐỔI LỚN so với bản 9.63/9.67:
//
// 1. "Khối" KHÔNG còn là 1 CỘT (dòng tiêu đề colSpan riêng đã được thêm —
//    xem `__isSectionHeader` bên dưới + rp-user/src/components/DataTable.jsx/
//    lib/exportExcel.js/lib/exportPdf.js, mục "Dòng tiêu đề nhóm" — tính
//    năng MỚI, opt-in qua cờ này, KHÔNG ảnh hưởng báo cáo khác nào đã có).
//    Theo đúng góp ý người dùng ("Chỗ khối phải quy ngang trên dòng đầu
//    tiên của khối và cover all cột theo kiểu merge lại thành 1 dòng").
// 2. Thêm kênh "Bán lẻ"/"Bán buôn" (TRANS_CODE 221/222 và 211/212 trong
//    VIEW V_HCRC_DOANHTHU_NGANHHANG — xem mục 2 tài liệu) dưới dạng CỘT con
//    của TỪNG chỉ số (Chỉ tiêu/Thực đạt/%CT/%CK của Doanh thu VÀ Lãi gộp) —
//    ĐÚNG cấu trúc file mẫu Excel gốc người dùng gửi (8 chỉ số × 3 cột con
//    Total/Bán lẻ/Bán buôn = 24 cột) — KHÔNG tách DÒNG (bản demo lần đầu
//    làm sai, người dùng phản hồi "Format bc bạn đang làm chưa chính xác
//    vơi file tôi gửi" - đã sửa lại đúng kiểu cột).
//    GIẢ ĐỊNH (đã nêu rõ trong demo, người dùng xác nhận) — TRANS_CODE 232
//    (đã gộp sẵn trong "Total" từ trước) KHÔNG tách được 1 trong 2 kênh,
//    nên CHỈ cộng vào cột "Total", KHÔNG cộng vào "Bán lẻ"/"Bán buôn" (2
//    cột đó CHỈ từ 211/212 và 221/222 — có thể không cộng đúng bằng Total
//    nếu 232 khác 0 trong kỳ).
//    "Chỉ tiêu"/"% so chỉ tiêu" (cả Doanh thu và Lãi gộp) hệ thống CHỈ có 1
//    số THEO TOÀN BỘ (Total) — 2 cột "Bán lẻ"/"Bán buôn" luôn `null` ("—").
// 3. "Giá trị hàng hỏng hủy" (TRANS_CODE 318) GIỜ GỘP VÀO domain
//    `doanhthu_nganhhang` (CÙNG VIEW/STK_ID với doanh thu — KHÔNG CÒN domain
//    `hanghonghuy_nganhhang`/job `seedHangHongHuySync.js` riêng NỮA, đã
//    XOÁ file đó) — vì vậy hiện được ở CẢ 3 khối BRG/LFL/NSO (trước đây
//    CHỈ có ở BRG vì nguồn cũ không có STK_ID). Theo người dùng xác nhận
//    ("bán buôn thường không có hàng hỏng hủy") — TOÀN BỘ giá trị hàng
//    hỏng hủy gán cho kênh "Bán lẻ" (Bán buôn = 0 cố định, KHÔNG đọc từ
//    nguồn nào khác — mã 318 không tự phân biệt kênh trong dữ liệu gốc).
//    "Lãi gộp — Giá trị" cột "Bán lẻ" = margin thô (LaiGopBanLe từ VIEW)
//    TRỪ giá trị hàng hỏng hủy của Bán lẻ; cột "Bán buôn" trừ hàng hỏng hủy
//    Bán buôn (= 0, không đổi số); cột "Total" = Bán lẻ (đã trừ) + Bán buôn
//    (đã trừ) — ĐẢM BẢO khớp tổng (theo yêu cầu người dùng, bản 9.68).
//    "Tỷ lệ" Lãi gộp ở Total dùng **Doanh thu cuối** (= Thực đạt Total −
//    Giá trị hàng hỏng hủy) làm mẫu số, ở ĐỦ CẢ 3 khối (bản 9.64 trước đây
//    CHỈ áp dụng ở khối BRG vì hàng hỏng hủy khi đó CHỈ có ở khối đó — giờ
//    có ở mọi khối nên áp dụng ĐỒNG NHẤT, không cần nhánh includeHongHuy
//    riêng nữa); "Bán lẻ"/"Bán buôn" chia theo đúng Thực đạt của kênh đó
//    (không có khái niệm "doanh thu cuối" riêng theo kênh).
//    "Doanh thu cuối" KHÔNG còn là CỘT HIỂN THỊ riêng (đúng file mẫu gốc
//    không có cột này) — chỉ dùng NGẦM để tính mẫu số Tỷ lệ lãi gộp Total.
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

// Danh mục 12 ngành hàng CỐ ĐỊNH, ĐÚNG thứ tự mã tăng dần — khớp mẫu Excel
// người dùng gửi. Hiện ĐỦ cả 12 dòng mỗi khối dù ngành hàng đó KHÔNG phát
// sinh dữ liệu trong kỳ (Thực đạt = 0), không ẩn dòng.
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

// 3 khối — label dòng tiêu đề ngang (__isSectionHeader) ngắn gọn, và label
// ĐẦY ĐỦ cho dòng "Tổng cộng ..." cuối khối (khớp ĐÚNG chữ trong file mẫu
// Excel gốc, dòng 17/30/43).
const SECTIONS = [
  { key: 'brg', headerLabel: 'Toàn hệ thống BRG', totalLabel: 'Tổng cộng toàn hệ thống BRG', color: '174A7C', isGrandTotal: true, filter: null },
  { key: 'lfl', headerLabel: 'LFL', totalLabel: 'Tổng cộng nhóm siêu thị LFL', color: '2E7D32', isGrandTotal: false, filter: 'lfl' },
  { key: 'nso', headerLabel: 'NSO', totalLabel: 'Tổng cộng nhóm siêu thị NSO', color: 'B45309', isGrandTotal: false, filter: 'nso' }
];

// Mỗi 1 trong 8 chỉ số (4 Doanh thu + 4 Lãi gộp) có đúng 3 cột con
// Total/Bán lẻ/Bán buôn — ĐÚNG cấu trúc file mẫu Excel gốc (24 cột giá trị).
const COLUMNS = [
  { key: 'stt', label: 'TT' },
  { key: 'maNganhHang', label: 'Mã ngành hàng' },
  { key: 'tenNganhHang', label: 'Ngành hàng', width: 2 },
  { key: 'chiTieuTotal', label: 'Total', width: 1.2 },
  { key: 'chiTieuBanLe', label: 'Bán lẻ', width: 1.2 },
  { key: 'chiTieuBanBuon', label: 'Bán buôn', width: 1.2 },
  { key: 'thucDatTotal', label: 'Total', width: 1.2 },
  { key: 'thucDatBanLe', label: 'Bán lẻ', width: 1.2 },
  { key: 'thucDatBanBuon', label: 'Bán buôn', width: 1.2 },
  { key: 'tyLeDatTotal', label: 'Total', format: 'percent', width: 0.9 },
  { key: 'tyLeDatBanLe', label: 'Bán lẻ', format: 'percent', width: 0.9 },
  { key: 'tyLeDatBanBuon', label: 'Bán buôn', format: 'percent', width: 0.9 },
  { key: 'cungKyTotal', label: 'Total', format: 'percent', width: 0.9 },
  { key: 'cungKyBanLe', label: 'Bán lẻ', format: 'percent', width: 0.9 },
  { key: 'cungKyBanBuon', label: 'Bán buôn', format: 'percent', width: 0.9 },
  { key: 'giaTriHongHuyTotal', label: 'Total', width: 1.2 },
  { key: 'giaTriHongHuyBanLe', label: 'Bán lẻ', width: 1.2 },
  { key: 'giaTriHongHuyBanBuon', label: 'Bán buôn', width: 1.2 },
  { key: 'tyLeLaiGopTotal', label: 'Total', format: 'percent', width: 0.9 },
  { key: 'tyLeLaiGopBanLe', label: 'Bán lẻ', format: 'percent', width: 0.9 },
  { key: 'tyLeLaiGopBanBuon', label: 'Bán buôn', format: 'percent', width: 0.9 },
  { key: 'giaTriLaiGopTotal', label: 'Total', width: 1.2 },
  { key: 'giaTriLaiGopBanLe', label: 'Bán lẻ', width: 1.2 },
  { key: 'giaTriLaiGopBanBuon', label: 'Bán buôn', width: 1.2 },
  { key: 'tyLeLaiGopSoChiTieuTotal', label: 'Total', format: 'percent', width: 0.9 },
  { key: 'tyLeLaiGopSoChiTieuBanLe', label: 'Bán lẻ', format: 'percent', width: 0.9 },
  { key: 'tyLeLaiGopSoChiTieuBanBuon', label: 'Bán buôn', format: 'percent', width: 0.9 },
  { key: 'laiGopCungKyTotal', label: 'Total', format: 'percent', width: 0.9 },
  { key: 'laiGopCungKyBanLe', label: 'Bán lẻ', format: 'percent', width: 0.9 },
  { key: 'laiGopCungKyBanBuon', label: 'Bán buôn', format: 'percent', width: 0.9 }
];

// COLUMN_SUPER_GROUPS (bản 9.73, theo yêu cầu người dùng — gửi file mẫu
// Excel gốc có 3 CẤP tiêu đề: "Doanh thu"/"Lãi gộp" (CẤP 1, gộp ngang 4
// nhóm con mỗi bên) -> 4 nhóm con mỗi bên (CẤP 2, "Chỉ tiêu"/"Thực đạt"/
// "% so chỉ tiêu"/"% so cùng kỳ năm trước") -> Total/Bán lẻ/Bán buôn (CẤP
// 3) — trước đây CHỈ có CẤP 2+3 (COLUMN_GROUPS ở trên đã TỰ GHÉP tên CẤP 1
// vào label, vd "Doanh thu — Chỉ tiêu", thay vì vẽ thêm 1 dòng banner
// riêng như file mẫu). "Giá trị hàng hỏng hủy" CHỦ Ý không thuộc nhóm nào
// ở đây — cột MỚI THÊM bản 9.68, KHÔNG có trong file mẫu Excel gốc, giữ
// nguyên là 1 banner CẤP 2 "trôi nổi" không gộp dưới "Doanh thu"/"Lãi gộp"
// nào, đúng ý định ban đầu (xem chú thích COLUMN_GROUPS). Cơ chế dựng dòng
// banner mới xem lib/exportExcel.js:addReportSheet()/lib/exportPdf.js:
// drawHeader()/rp-user/src/components/DataTable.jsx:buildSuperHeader().
const COLUMN_SUPER_GROUPS = [
  {
    label: 'Doanh thu', color: '1F3B57',
    groupLabels: ['Doanh thu — Chỉ tiêu', 'Doanh thu — Thực đạt', 'Doanh thu — % so chỉ tiêu', 'Doanh thu — % so cùng kỳ năm trước']
  },
  {
    label: 'Lãi gộp', color: '7A3E13',
    groupLabels: ['Lãi gộp — Tỷ lệ', 'Lãi gộp — Giá trị', 'Lãi gộp — % so chỉ tiêu', 'Lãi gộp — % so cùng kỳ năm trước']
  }
];

const COLUMN_GROUPS = [
  { label: 'Doanh thu — Chỉ tiêu', color: 'green', keys: ['chiTieuTotal', 'chiTieuBanLe', 'chiTieuBanBuon'] },
  { label: 'Doanh thu — Thực đạt', color: 'green', keys: ['thucDatTotal', 'thucDatBanLe', 'thucDatBanBuon'] },
  { label: 'Doanh thu — % so chỉ tiêu', color: 'green', keys: ['tyLeDatTotal', 'tyLeDatBanLe', 'tyLeDatBanBuon'] },
  { label: 'Doanh thu — % so cùng kỳ năm trước', color: 'green', keys: ['cungKyTotal', 'cungKyBanLe', 'cungKyBanBuon'] },
  { label: 'Giá trị hàng hỏng hủy', color: 'red', keys: ['giaTriHongHuyTotal', 'giaTriHongHuyBanLe', 'giaTriHongHuyBanBuon'] },
  { label: 'Lãi gộp — Tỷ lệ', color: 'orange', keys: ['tyLeLaiGopTotal', 'tyLeLaiGopBanLe', 'tyLeLaiGopBanBuon'] },
  { label: 'Lãi gộp — Giá trị', color: 'orange', keys: ['giaTriLaiGopTotal', 'giaTriLaiGopBanLe', 'giaTriLaiGopBanBuon'] },
  { label: 'Lãi gộp — % so chỉ tiêu', color: 'orange', keys: ['tyLeLaiGopSoChiTieuTotal', 'tyLeLaiGopSoChiTieuBanLe', 'tyLeLaiGopSoChiTieuBanBuon'] },
  { label: 'Lãi gộp — % so cùng kỳ năm trước', color: 'orange', keys: ['laiGopCungKyTotal', 'laiGopCungKyBanLe', 'laiGopCungKyBanBuon'] }
];

function round1(n) {
  return Math.round(n * 10) / 10;
}

function pctOrNull(numerator, denominator) {
  if (denominator === null || denominator === undefined || denominator === 0) return null;
  return round1(numerator / denominator * 100);
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

// Tính 1 dòng ngành hàng (hoặc dòng "Tổng cộng" — khi gọi với measures đã
// CỘNG DỒN sẵn từ 12 ngành hàng, isTotalRow=true để biết nhãn/màu riêng).
// `current`/`lastYear`/`target` — object measures thô đọc được (hoặc sums
// cộng dồn khi tính dòng Tổng cộng), `hasLastYear*`/`hasChiTieu*` — cờ
// phân biệt "KHÔNG có dữ liệu" (null, hiện "—") với "có dữ liệu = 0".
function computeRowFields({ thucDat, lastYearThucDat, hasLastYear, giaTriHongHuy, lastYearGiaTriHongHuy, laiGopGross, lastYearLaiGopGross, hasLastYearLaiGop, chiTieu, hasChiTieuBanLe, hasChiTieuBanBuon, chiTieuLaiGop, hasChiTieuLaiGopBanLe, hasChiTieuLaiGopBanBuon }) {
  // Chỉ tiêu Bán lẻ/Bán buôn (bản 9.73, theo yêu cầu người dùng — "tách chỉ
  // tiêu bán buôn, bán lẻ") — TRƯỚC ĐÂY hệ thống chỉ có 1 số Chỉ tiêu THEO
  // TOÀN BỘ (Total), 2 cột Bán lẻ/Bán buôn LUÔN "—" (null cố định). Giờ file
  // nhập có 2 cột riêng (ChiTieuDoanhThuBanLe/BanBuon,
  // ChiTieuLaiGopBanLe/BanBuon — xem etl/server.js) — "Total" = CỘNG hai cột
  // lại (giống cách Thực đạt/Lãi gộp Total đã tính), "có dữ liệu" (khác "—")
  // khi ÍT NHẤT 1 trong 2 kênh có số — kênh còn thiếu coi như 0 khi cộng vào
  // Total (không phải "chưa nhập cả 2 kênh" mới tính là có dữ liệu, tránh ẩn
  // Total chỉ vì 1 kênh ít gặp chưa kịp nhập).
  const hasChiTieu = hasChiTieuBanLe || hasChiTieuBanBuon;
  const chiTieuTotal = (hasChiTieuBanLe ? chiTieu.banLe : 0) + (hasChiTieuBanBuon ? chiTieu.banBuon : 0);
  const hasChiTieuLaiGop = hasChiTieuLaiGopBanLe || hasChiTieuLaiGopBanBuon;
  const chiTieuLaiGopTotal = (hasChiTieuLaiGopBanLe ? chiTieuLaiGop.banLe : 0) + (hasChiTieuLaiGopBanBuon ? chiTieuLaiGop.banBuon : 0);
  // Hàng hỏng hủy gán HẾT cho kênh Bán lẻ (Bán buôn thường không có — theo
  // người dùng xác nhận bản 9.68) — cả kỳ hiện tại VÀ cùng kỳ năm trước.
  const hhTotal = giaTriHongHuy.total;
  const hhBanLe = giaTriHongHuy.total;
  const hhBanBuon = 0;
  const hhTotalLY = lastYearGiaTriHongHuy.total;
  const hhBanLeLY = lastYearGiaTriHongHuy.total;
  const hhBanBuonLY = 0;

  const doanhThuCuoiTotal = thucDat.total - hhTotal;

  const giaTriLaiGopBanLe = laiGopGross.banLe - hhBanLe;
  const giaTriLaiGopBanBuon = laiGopGross.banBuon - hhBanBuon;
  const giaTriLaiGopTotal = giaTriLaiGopBanLe + giaTriLaiGopBanBuon;

  const lastYearLaiGopBanLe = hasLastYearLaiGop ? (lastYearLaiGopGross.banLe - hhBanLeLY) : null;
  const lastYearLaiGopBanBuon = hasLastYearLaiGop ? (lastYearLaiGopGross.banBuon - hhBanBuonLY) : null;
  const lastYearLaiGopTotal = hasLastYearLaiGop ? (lastYearLaiGopBanLe + lastYearLaiGopBanBuon) : null;

  return {
    chiTieuTotal: hasChiTieu ? chiTieuTotal : null,
    chiTieuBanLe: hasChiTieuBanLe ? chiTieu.banLe : null,
    chiTieuBanBuon: hasChiTieuBanBuon ? chiTieu.banBuon : null,
    thucDatTotal: thucDat.total, thucDatBanLe: thucDat.banLe, thucDatBanBuon: thucDat.banBuon,
    tyLeDatTotal: hasChiTieu ? pctOrNull(thucDat.total, chiTieuTotal) : null,
    tyLeDatBanLe: hasChiTieuBanLe ? pctOrNull(thucDat.banLe, chiTieu.banLe) : null,
    tyLeDatBanBuon: hasChiTieuBanBuon ? pctOrNull(thucDat.banBuon, chiTieu.banBuon) : null,
    cungKyTotal: hasLastYear ? pctOrNull(thucDat.total, lastYearThucDat.total) : null,
    cungKyBanLe: hasLastYear ? pctOrNull(thucDat.banLe, lastYearThucDat.banLe) : null,
    cungKyBanBuon: hasLastYear ? pctOrNull(thucDat.banBuon, lastYearThucDat.banBuon) : null,
    giaTriHongHuyTotal: hhTotal, giaTriHongHuyBanLe: hhBanLe, giaTriHongHuyBanBuon: hhBanBuon,
    // "Tỷ lệ" lãi gộp Total chia theo DOANH THU CUỐI (= Thực đạt − Giá trị
    // hàng hỏng hủy, bản 9.64) — ÁP DỤNG ĐỒNG NHẤT cả 3 khối từ bản 9.68
    // (trước đây chỉ khối BRG, vì hàng hỏng hủy khi đó chỉ có ở khối đó).
    // Bán lẻ/Bán buôn không có khái niệm "doanh thu cuối" riêng theo kênh
    // — chia trực tiếp theo Thực đạt của kênh đó.
    tyLeLaiGopTotal: pctOrNull(giaTriLaiGopTotal, doanhThuCuoiTotal),
    tyLeLaiGopBanLe: pctOrNull(giaTriLaiGopBanLe, thucDat.banLe),
    tyLeLaiGopBanBuon: pctOrNull(giaTriLaiGopBanBuon, thucDat.banBuon),
    giaTriLaiGopTotal, giaTriLaiGopBanLe, giaTriLaiGopBanBuon,
    tyLeLaiGopSoChiTieuTotal: hasChiTieuLaiGop ? pctOrNull(giaTriLaiGopTotal, chiTieuLaiGopTotal) : null,
    tyLeLaiGopSoChiTieuBanLe: hasChiTieuLaiGopBanLe ? pctOrNull(giaTriLaiGopBanLe, chiTieuLaiGop.banLe) : null,
    tyLeLaiGopSoChiTieuBanBuon: hasChiTieuLaiGopBanBuon ? pctOrNull(giaTriLaiGopBanBuon, chiTieuLaiGop.banBuon) : null,
    laiGopCungKyTotal: hasLastYearLaiGop ? pctOrNull(giaTriLaiGopTotal, lastYearLaiGopTotal) : null,
    laiGopCungKyBanLe: hasLastYearLaiGop ? pctOrNull(giaTriLaiGopBanLe, lastYearLaiGopBanLe) : null,
    laiGopCungKyBanBuon: hasLastYearLaiGop ? pctOrNull(giaTriLaiGopBanBuon, lastYearLaiGopBanBuon) : null,
    // Giữ lại giá trị NET (đã trừ hàng hỏng hủy) để dòng "Tổng cộng" cộng
    // dồn đúng — KHÔNG cộng dồn giaTriLaiGopGross (đã trừ rồi ở trên).
    __netLaiGop: { total: giaTriLaiGopTotal, banLe: giaTriLaiGopBanLe, banBuon: giaTriLaiGopBanBuon },
    __netLaiGopLY: hasLastYearLaiGop ? { total: lastYearLaiGopTotal, banLe: lastYearLaiGopBanLe, banBuon: lastYearLaiGopBanBuon } : null,
    __doanhThuCuoiTotal: doanhThuCuoiTotal
  };
}

function buildSegmentRows(section, currentMap, lastYearMap, targetMap) {
  const rows = [{ __isSectionHeader: true, __sectionLabel: section.headerLabel, __sectionColor: section.color }];

  const sums = {
    thucDat: { total: 0, banLe: 0, banBuon: 0 },
    lastYearThucDat: { total: 0, banLe: 0, banBuon: 0 }, hasLastYear: false,
    giaTriHongHuy: { total: 0 }, lastYearGiaTriHongHuy: { total: 0 },
    laiGopGross: { banLe: 0, banBuon: 0 }, lastYearLaiGopGross: { banLe: 0, banBuon: 0 }, hasLastYearLaiGop: false,
    chiTieu: { banLe: 0, banBuon: 0 }, hasChiTieuBanLe: false, hasChiTieuBanBuon: false,
    chiTieuLaiGop: { banLe: 0, banBuon: 0 }, hasChiTieuLaiGopBanLe: false, hasChiTieuLaiGopBanBuon: false
  };

  for (const item of NGANH_HANG_LIST) {
    const current = currentMap.get(item.code);
    const lastYear = lastYearMap.get(item.code);
    const target = targetMap.get(item.code);

    const thucDat = {
      total: current?.measures?.DoanhThu || 0,
      banLe: current?.measures?.DoanhThuBanLe || 0,
      banBuon: current?.measures?.DoanhThuBanBuon || 0
    };
    const hasLastYear = lastYear?.measures?.DoanhThu != null;
    const lastYearThucDat = {
      total: lastYear?.measures?.DoanhThu || 0,
      banLe: lastYear?.measures?.DoanhThuBanLe || 0,
      banBuon: lastYear?.measures?.DoanhThuBanBuon || 0
    };
    const giaTriHongHuy = { total: current?.measures?.GiaTriHongHuy || 0 };
    const lastYearGiaTriHongHuy = { total: lastYear?.measures?.GiaTriHongHuy || 0 };
    const laiGopGross = { banLe: current?.measures?.LaiGopBanLe || 0, banBuon: current?.measures?.LaiGopBanBuon || 0 };
    const hasLastYearLaiGop = lastYear?.measures?.LaiGop != null;
    const lastYearLaiGopGross = { banLe: lastYear?.measures?.LaiGopBanLe || 0, banBuon: lastYear?.measures?.LaiGopBanBuon || 0 };
    // Chỉ tiêu Bán lẻ/Bán buôn (bản 9.73) — ChiTieuDoanhThu/ChiTieuLaiGop
    // CŨ (1 số Total duy nhất) ĐỔI thành 2 field riêng mỗi bên, xem
    // etl/server.js + chú thích computeRowFields() ở trên.
    const hasChiTieuBanLe = target?.ChiTieuDoanhThuBanLe != null;
    const hasChiTieuBanBuon = target?.ChiTieuDoanhThuBanBuon != null;
    const chiTieu = { banLe: target?.ChiTieuDoanhThuBanLe || 0, banBuon: target?.ChiTieuDoanhThuBanBuon || 0 };
    const hasChiTieuLaiGopBanLe = target?.ChiTieuLaiGopBanLe != null;
    const hasChiTieuLaiGopBanBuon = target?.ChiTieuLaiGopBanBuon != null;
    const chiTieuLaiGop = { banLe: target?.ChiTieuLaiGopBanLe || 0, banBuon: target?.ChiTieuLaiGopBanBuon || 0 };

    const fields = computeRowFields({
      thucDat, lastYearThucDat, hasLastYear, giaTriHongHuy, lastYearGiaTriHongHuy,
      laiGopGross, lastYearLaiGopGross, hasLastYearLaiGop,
      chiTieu, hasChiTieuBanLe, hasChiTieuBanBuon, chiTieuLaiGop, hasChiTieuLaiGopBanLe, hasChiTieuLaiGopBanBuon
    });

    rows.push({
      maNganhHang: item.code,
      tenNganhHang: current?.dimensions?.TenNganhHang || lastYear?.dimensions?.TenNganhHang || item.name,
      ...fields
    });

    sums.thucDat.total += thucDat.total; sums.thucDat.banLe += thucDat.banLe; sums.thucDat.banBuon += thucDat.banBuon;
    if (hasLastYear) {
      sums.hasLastYear = true;
      sums.lastYearThucDat.total += lastYearThucDat.total;
      sums.lastYearThucDat.banLe += lastYearThucDat.banLe;
      sums.lastYearThucDat.banBuon += lastYearThucDat.banBuon;
    }
    sums.giaTriHongHuy.total += giaTriHongHuy.total;
    sums.lastYearGiaTriHongHuy.total += lastYearGiaTriHongHuy.total;
    sums.laiGopGross.banLe += laiGopGross.banLe; sums.laiGopGross.banBuon += laiGopGross.banBuon;
    if (hasLastYearLaiGop) {
      sums.hasLastYearLaiGop = true;
      sums.lastYearLaiGopGross.banLe += lastYearLaiGopGross.banLe;
      sums.lastYearLaiGopGross.banBuon += lastYearLaiGopGross.banBuon;
    }
    if (hasChiTieuBanLe) { sums.chiTieu.banLe += chiTieu.banLe; sums.hasChiTieuBanLe = true; }
    if (hasChiTieuBanBuon) { sums.chiTieu.banBuon += chiTieu.banBuon; sums.hasChiTieuBanBuon = true; }
    if (hasChiTieuLaiGopBanLe) { sums.chiTieuLaiGop.banLe += chiTieuLaiGop.banLe; sums.hasChiTieuLaiGopBanLe = true; }
    if (hasChiTieuLaiGopBanBuon) { sums.chiTieuLaiGop.banBuon += chiTieuLaiGop.banBuon; sums.hasChiTieuLaiGopBanBuon = true; }
  }

  const totalFields = computeRowFields({
    thucDat: sums.thucDat, lastYearThucDat: sums.lastYearThucDat, hasLastYear: sums.hasLastYear,
    giaTriHongHuy: sums.giaTriHongHuy, lastYearGiaTriHongHuy: sums.lastYearGiaTriHongHuy,
    laiGopGross: sums.laiGopGross, lastYearLaiGopGross: sums.lastYearLaiGopGross, hasLastYearLaiGop: sums.hasLastYearLaiGop,
    chiTieu: sums.chiTieu, hasChiTieuBanLe: sums.hasChiTieuBanLe, hasChiTieuBanBuon: sums.hasChiTieuBanBuon,
    chiTieuLaiGop: sums.chiTieuLaiGop, hasChiTieuLaiGopBanLe: sums.hasChiTieuLaiGopBanLe, hasChiTieuLaiGopBanBuon: sums.hasChiTieuLaiGopBanBuon
  });
  delete totalFields.__netLaiGop;
  delete totalFields.__netLaiGopLY;
  delete totalFields.__doanhThuCuoiTotal;

  rows.push({
    maNganhHang: null, tenNganhHang: section.totalLabel,
    ...totalFields,
    __isSubtotal: true,
    __isGrandTotal: section.isGrandTotal
  });

  return rows;
}

async function runNganhHangBrgReport(definition, filterValues = {}) {
  const targetDomain = definition.targetDomain;
  if (!targetDomain) {
    throw new Error('Báo cáo thiếu DefinitionJson.targetDomain (vd "sales-targets-nganhhang-dt" hoặc "sales-targets-nganhhang-dt-ldtd") — SourceType=\'nganhHangBrg\' bắt buộc phải khai domain Chỉ tiêu riêng của báo cáo đó.');
  }
  const dwhPool = await getPool('DWH');
  const range = resolveRequestedRange(filterValues);
  const lastYearRange = { from: shiftYearMinus1(range.from), to: shiftYearMinus1(range.to) };

  const fetchDomain = async (domain, dateRange) => {
    const blockDefinition = { domain, filters: [{ field: 'eventDate', type: 'dateRange' }] };
    const raw = await fetchAllReportRows(dwhPool, blockDefinition, { eventDate: dateRange });
    return aggregateDailyRowsByEntity(raw, dateRange.to);
  };

  const [currentRows, lastYearRows] = await Promise.all([
    fetchDomain(DOANHTHU_DOMAIN, range),
    fetchDomain(DOANHTHU_DOMAIN, lastYearRange)
  ]);

  const fromPeriod = firstOfMonth(range.from);
  const toPeriod = firstOfMonth(range.to);
  const targetRows = await runSalesTargetsBlockRange(dwhPool, targetDomain, fromPeriod, toPeriod);
  const targetMap = new Map(targetRows.map(t => [t.entityCode, t]));

  const diemMapping = await loadDiemStkMapping();
  const stkLookup = buildStkIdLookup(diemMapping);
  const nsoSet = await loadNsoMaDiemSet();
  const isNsoStk = (stkId) => {
    const info = stkLookup.get(String(stkId));
    return !!(info && nsoSet.has(info.maDiem));
  };

  const lflStkIds = new Set();
  const nsoStkIds = new Set();
  for (const r of [...currentRows, ...lastYearRows]) {
    const stk = String(r.dimensions?.STK_ID ?? '');
    if (!stk) continue;
    if (isNsoStk(stk)) nsoStkIds.add(stk); else lflStkIds.add(stk);
  }
  const stkFilterBySection = { brg: null, lfl: lflStkIds, nso: nsoStkIds };

  let rows = [];
  for (const section of SECTIONS) {
    const stkFilter = stkFilterBySection[section.key];
    const currentMap = groupByDeptId(currentRows, stkFilter);
    const lastYearMap = groupByDeptId(lastYearRows, stkFilter);
    rows = rows.concat(buildSegmentRows(section, currentMap, lastYearMap, targetMap));
  }

  const columns = describeColumns(COLUMNS);
  assignSttIfPresent(rows, columns);

  return {
    columns,
    rows,
    columnGroups: COLUMN_GROUPS,
    columnSuperGroups: COLUMN_SUPER_GROUPS
  };
}

module.exports = { runNganhHangBrgReport };
