// lib/reportTitleDate.js — definition.title CÓ THỂ chứa token "{ngayBaoCao}"
// (vd "Hệ thống siêu thị BRGMART - Báo cáo nhanh doanh thu ngày {ngayBaoCao}",
// xem scripts/seedLdtdHcrcReports.js) — thay bằng ngày báo cáo THẬT (lấy từ
// filterValues.eventDate người dùng đã chọn/lịch đã cấu hình), dùng CHUNG 1
// hàm chuẩn hoá resolveRequestedRange() với lib/compositeReportRunner.js để
// khớp đúng mặc định "ngày hiện tại của máy chủ" khi không chọn gì. Dùng
// chung cho cả lúc bấm "Xuất" (routes/reports.js) lẫn lịch gửi email tự động
// (jobs/reportEmailScheduler.js) — KHÁC token "{ngay}" đã có sẵn ở subject
// email (dùng NGÀY GỬI thật, không phải ngày dữ liệu báo cáo).
//
// Báo cáo KHÔNG khai token này (đa số báo cáo khác) thì trả nguyên title,
// không đổi hành vi cũ.
const { resolveRequestedRange } = require('./compositeReportRunner');

const TITLE_DATE_TOKEN = '{ngayBaoCao}';

// separator="/" dùng để HIỆN trong file (dd/mm/yyyy); separator="-" dùng để
// ghép vào TÊN FILE tải xuống ("/" không hợp lệ trong tên file).
function formatDateVN(isoDate, separator) {
  const [y, m, d] = String(isoDate).split('-');
  return [d, m, y].join(separator);
}

function resolveTitleWithDate(title, filterValues, separator) {
  if (!title.includes(TITLE_DATE_TOKEN)) return title;
  const { from, to } = resolveRequestedRange(filterValues || {});
  const display = from === to
    ? formatDateVN(from, separator)
    : `${formatDateVN(from, separator)} - ${formatDateVN(to, separator)}`;
  return title.split(TITLE_DATE_TOKEN).join(display);
}

module.exports = { resolveTitleWithDate };
