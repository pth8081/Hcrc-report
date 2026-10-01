// lib/formatCell.js — Định dạng hiển thị 1 ô số trên bảng web (ReportBody.jsx)
// — MIRROR đúng rp-server/lib/reportCellFormat.js:formatCellText() để bảng
// web khớp hệt bảng Excel/PDF đã xuất (làm tròn + dấu phẩy ngăn cách hàng
// nghìn), không rẽ 2 cách tính khác nhau. Math.round() của JS làm tròn NỬA
// LÊN với số dương (2.5 -> 3), đúng quy tắc đã chốt với người dùng ("dưới 5
// làm tròn xuống, trên 5 làm tròn lên").
export function formatCellValue(value, col) {
  if (value === null || value === undefined || value === '') return '';
  if (typeof value !== 'number') return String(value);
  if (col?.format === 'percent') return `${Math.round(value)}%`;
  const sign = value < 0 ? '-' : '';
  return sign + Math.abs(Math.round(value)).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}
