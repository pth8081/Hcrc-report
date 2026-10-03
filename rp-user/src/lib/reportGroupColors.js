// lib/reportGroupColors.js — MIRROR đúng rp-server/lib/reportCellFormat.js
// (GROUP_COLORS/SUBTOTAL_COLOR) để bảng báo cáo trên web tô MÀU KHỚP HỆT
// Excel/PDF đã xuất, không rẽ 2 bảng màu khác nhau. definition.columnGroups
// khai tên màu (vd "green") hoặc mã HEX 6 ký tự tự chọn — không khớp cái
// nào thì rơi về "gray" (an toàn, không vỡ giao diện).
const GROUP_COLORS = {
  green: '#C6E0B4', yellow: '#FFE699', orange: '#F8CBAD',
  blue: '#BDD7EE', red: '#F2A9A9', gray: '#D9D9D9', purple: '#D9D2E9'
};
export const SUBTOTAL_COLOR = '#D9D2E9';

export function resolveGroupColor(color) {
  if (color && /^[0-9a-fA-F]{6}$/.test(color)) return `#${color.toUpperCase()}`;
  return GROUP_COLORS[color] || GROUP_COLORS.gray;
}
