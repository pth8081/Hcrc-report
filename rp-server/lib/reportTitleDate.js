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

// ddmmyyyy KHÔNG dấu phân cách — dùng riêng cho TÊN FILE tải xuống theo
// quy tắc mã cố định (vd "BCDTRC-17092026.xlsx"), KHÁC hẳn định dạng
// dd/mm/yyyy dùng để HIỂN THỊ trong tiêu đề tài liệu.
function formatDateCompact(isoDate) {
  const [y, m, d] = String(isoDate).split('-');
  return `${d}${m}${y}`;
}

// definition.exportFileCode (TUỲ CHỌN, vd "BCDTRC"/"BCDDTLDTD" — xem
// scripts/seedLdtdHcrcReports.js) — tên file tải xuống theo ĐÚNG quy tắc
// mã cố định + ngày báo cáo, HOÀN TOÀN TÁCH RIÊNG khỏi tiêu đề hiển thị
// trong tài liệu (definition.exportTitle) và tên báo cáo trong danh mục
// (definition.title) — 3 khái niệm khác nhau, không suy ra lẫn nhau nữa.
// Báo cáo KHÔNG khai exportFileCode (đa số báo cáo khác) thì dùng
// fallbackBaseName (thường là tiêu đề, giữ đúng hành vi cũ).
function resolveExportFileBaseName(exportFileCode, filterValues, fallbackBaseName) {
  if (!exportFileCode) return fallbackBaseName;
  const { from, to } = resolveRequestedRange(filterValues || {});
  return from === to
    ? `${exportFileCode}-${formatDateCompact(to)}`
    : `${exportFileCode}-${formatDateCompact(from)}-${formatDateCompact(to)}`;
}

module.exports = { resolveTitleWithDate, resolveExportFileBaseName };
