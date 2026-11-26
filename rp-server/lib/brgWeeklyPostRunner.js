// lib/brgWeeklyPostRunner.js — SourceType='brgWeeklyPost' (bản 11.26, theo
// yêu cầu người dùng: "Weekly post vào 1 file chia nhiều sheet" — gộp 5
// báo cáo riêng "BRG Weekly Post - ..." (bc-brg-post-by-items/-by-store/
// -rankings/-recap/-detail, bản 11.24) thành ĐÚNG 1 báo cáo DUY NHẤT
// trong menu "Báo cáo MKT", chọn "sheet" muốn xem qua 1 bộ lọc nội bộ —
// mirror ĐÚNG cấu trúc 10 sheet của file Excel mẫu gốc
// "BRG_Weekly_Post_T6K1_BC1.xlsx" (nhiều sheet trong CÙNG 1 file).
//
// KHÔNG viết lại logic tính — chỉ ĐIỀU PHỐI sang ĐÚNG 5 hàm run...Report()
// đã có sẵn, nguyên vẹn (lib/brgPost*Runner.js, giữ nguyên để không phải
// viết lại/kiểm thử lại công thức đã xác nhận đúng với file mẫu thật) —
// filterValues (campaignId, __storeScope...) truyền NGUYÊN VẸN xuống từng
// hàm, CHỈ thêm field `sheet` MỚI để chọn hàm nào chạy.
//
// SHEET_OPTIONS (bản 11.26) — NGUỒN DUY NHẤT cho cả 2 nơi cần đúng danh
// sách/nhãn 5 sheet: scripts/seedBrgWeeklyPostReport.js (options của bộ
// lọc `sheet`) VÀ routes/reports.js (nhãn từng sheet khi xuất gộp 1 file
// Excel 5 sheet, theo yêu cầu người dùng "gộp nhiều báo cáo thành nhiều
// sheet") — tránh lệch nhãu/thứ tự giữa 2 nơi nếu sau này đổi.
const { runBrgPostByItemsReport } = require('./brgPostByItemsRunner');
const { runBrgPostByStoreReport } = require('./brgPostByStoreRunner');
const { runBrgPostRankingsReport } = require('./brgPostRankingsRunner');
const { runBrgPostRecapReport } = require('./brgPostRecapRunner');
const { runBrgPostDetailReport } = require('./brgPostDetailRunner');

const SHEET_OPTIONS = [
  { value: 'recap', label: 'Tổng hợp (Recap)', runFn: runBrgPostRecapReport },
  { value: 'byItems', label: 'Theo mã hàng', runFn: runBrgPostByItemsReport },
  { value: 'byStore', label: 'Theo siêu thị', runFn: runBrgPostByStoreReport },
  { value: 'rankings', label: 'Xếp hạng sản phẩm', runFn: runBrgPostRankingsReport },
  { value: 'detail', label: 'Chi tiết (Siêu thị x Sản phẩm)', runFn: runBrgPostDetailReport }
];
const SHEET_RUNNERS = Object.fromEntries(SHEET_OPTIONS.map(s => [s.value, s.runFn]));
const DEFAULT_SHEET = SHEET_OPTIONS[0].value;

// pagination (bản 11.30) — truyền NGUYÊN VẸN xuống hàm sheet đang chọn;
// CHỈ sheet "detail" (brgPostDetailRunner.js) thực sự đọc tham số này (báo
// cáo PHẲNG, an toàn để cắt hiển thị) — 4 sheet còn lại nhận thêm tham số
// thứ 3 này nhưng bỏ qua (CÓ nhóm/subtotal, chưa làm — xem audit).
async function runBrgWeeklyPostReport(definition, filterValues, pagination) {
  const sheet = (filterValues && filterValues.sheet) || DEFAULT_SHEET;
  const runFn = SHEET_RUNNERS[sheet] || SHEET_RUNNERS[DEFAULT_SHEET];
  return runFn(definition, filterValues, pagination);
}

module.exports = { runBrgWeeklyPostReport, SHEET_RUNNERS, SHEET_OPTIONS, DEFAULT_SHEET };
