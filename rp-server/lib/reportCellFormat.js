// lib/reportCellFormat.js — Tiện ích DÙNG CHUNG cho lib/exportExcel.js và
// lib/exportPdf.js (cả 2 xuất từ CÙNG 1 definition/rows nên phải khớp nhau
// tuyệt đối, không rẽ 2 đường tính riêng): đánh số cột "TT" theo từng nhóm,
// định dạng số/phần trăm hiển thị, và bảng màu nhóm cột
// (definition.columnGroups — xem chú thích DefinitionJson ở đầu
// lib/compositeReportRunner.js mục "Tiêu đề nhóm cột + màu (Excel/PDF)").
const GROUP_COLORS = {
  green: 'C6E0B4', yellow: 'FFE699', orange: 'F8CBAD',
  blue: 'BDD7EE', red: 'F2A9A9', gray: 'D9D9D9', purple: 'D9D2E9'
};
const SUBTOTAL_COLOR = 'D9D2E9';

// Tên màu có sẵn (khớp đúng bảng trên), hoặc mã HEX 6 ký tự tự chọn (vd
// "FFAA00") — không khớp cái nào thì rơi về "gray" (an toàn, không throw).
function resolveGroupColor(color) {
  if (color && /^[0-9a-fA-F]{6}$/.test(color)) return color.toUpperCase();
  return GROUP_COLORS[color] || GROUP_COLORS.gray;
}

// Cột đặc biệt key === 'stt' — đánh số LẠI TỪ 1 ngay sau mỗi dòng
// __isSubtotal (khớp đúng cột "TT" đếm riêng theo từng nhóm MART/MINIMART
// trong mẫu báo cáo cũ), để TRỐNG ở chính dòng subtotal/tổng (không phải
// số 0 hay tiếp tục đếm).
function computeSttValues(rows) {
  const values = [];
  let n = 0;
  for (const row of rows) {
    if (row.__isSubtotal) { values.push(''); n = 0; continue; }
    n += 1;
    values.push(n);
  }
  return values;
}

// Định dạng hiển thị DẠNG VĂN BẢN (dùng cho PDF, vẽ text trực tiếp — Excel
// tự có numFmt riêng, xem lib/exportExcel.js, KHÔNG dùng hàm này để giữ
// đúng kiểu số/sắp xếp được trong Excel).
// col.format === 'percent': công thức báo cáo đã tự nhân 100 sẵn (vd
// "ROUND(x/y*100,1)" -> 87.3), CHỈ thêm dấu "%" khi hiển thị, KHÔNG nhân
// lại 100 lần nữa (khác numFmt phần trăm chuẩn của Excel).
// Dấu phẩy phân cách nghìn CỐ ĐỊNH (không phụ thuộc locale máy chủ) — khớp
// đúng định dạng số trong file mẫu báo cáo cũ người dùng gửi (dấu phẩy,
// KHÔNG phải dấu chấm kiểu vi-VN).
function formatCellText(value, col) {
  if (value === null || value === undefined || value === '') return '';
  if (typeof value !== 'number') return String(value);
  if (col?.format === 'percent') return `${Math.round(value)}%`;
  const sign = value < 0 ? '-' : '';
  return sign + Math.abs(Math.round(value)).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

module.exports = { GROUP_COLORS, SUBTOTAL_COLOR, resolveGroupColor, computeSttValues, formatCellText };
