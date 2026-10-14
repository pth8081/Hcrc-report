// lib/reportGroupColors.js — MIRROR bảng màu web cho bảng báo cáo — tách
// RIÊNG khỏi rp-server/lib/reportCellFormat.js (GROUP_COLORS, bản PDF/email
// gốc) kể từ bản đổi màu "kiểu báo cáo tài chính quốc tế" dưới đây.
// definition.columnGroups khai tên màu (vd "green") hoặc mã HEX 6 ký tự tự
// chọn — không khớp cái nào thì rơi về "gray" (an toàn, không vỡ giao diện).
//
// Bản đổi màu CORPORATE (theo yêu cầu người dùng — xem demo PDF đã gửi
// trước khi áp dụng): web + Excel (lib/reportCellFormat.js:GROUP_COLORS_CORPORATE)
// dùng bảng xanh navy nhạt/vàng đồng/xám THỐNG NHẤT 1 họ màu, thay cho
// bảng xanh lá/vàng/cam/tím sặc sỡ kiểu bán lẻ trước đây — PDF/email CHƯA
// đổi (người dùng muốn review riêng PDF trước, báo khi nào chuyển).
// Lịch sử trước đó (bản 8.58/8.98) đổi qua đổi lại màu gốc — xem lịch sử ở
// rp-server/lib/reportCellFormat.js nếu cần đối chiếu.
const GROUP_COLORS = {
  green: '#C9D6E0', yellow: '#D7DCE3', orange: '#E3D5B8',
  blue: '#9FB3C8', red: '#E3B8B5', gray: '#E0E0E0', purple: '#C3CEDC'
};
export const SUBTOTAL_COLOR = GROUP_COLORS.purple;
export const GRAND_TOTAL_COLOR = GROUP_COLORS.blue;
export const ZEBRA_COLOR = '#F3F5F7';

export function resolveGroupColor(color) {
  if (color && /^[0-9a-fA-F]{6}$/.test(color)) return `#${color.toUpperCase()}`;
  return GROUP_COLORS[color] || GROUP_COLORS.gray;
}

export function resolveRowFillColor(row, col, groups) {
  if (!row || !row.__isSubtotal) return null;
  if (row.__isGrandTotal) return GRAND_TOTAL_COLOR;
  const group = (groups || []).find(g => (g.keys || []).includes(col.key));
  return group ? resolveGroupColor(group.color) : SUBTOTAL_COLOR;
}

export function resolveStandaloneColumnColor(col, standaloneColumnColors) {
  const name = (standaloneColumnColors || {})[col.key];
  return name ? resolveGroupColor(name) : null;
}

export function computeZebraFlags(rows) {
  let n = 0;
  return rows.map(row => {
    if (row.__isSubtotal) return false;
    n += 1;
    return n % 2 === 0;
  });
}

// filterColumns/filterGroups (bản 8.97) — mirror ĐÚNG rp-server/lib/
// reportCellFormat.js (xem chú thích đầy đủ ở file gốc) — dùng để ẩn/chọn
// cột NGAY TRÊN WEB (modules/reports/ReportsPage.jsx) khi người dùng chọn
// "Cột hiển thị", không cần gọi lại server (rows kết quả /run đã có sẵn mọi
// field, DataTable.jsx chỉ vẽ theo đúng mảng columns truyền vào).
export function filterColumns(columns, keepKeys) {
  if (!Array.isArray(keepKeys) || !keepKeys.length) return columns;
  const keep = new Set(keepKeys);
  return columns.filter(col => keep.has(col.key));
}

export function filterGroups(groups, columns) {
  return (groups || []).map(g => ({
    ...g, keys: (g.keys || []).filter(k => columns.some(c => c.key === k))
  })).filter(g => g.keys.length);
}
