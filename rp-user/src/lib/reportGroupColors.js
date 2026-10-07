// lib/reportGroupColors.js — MIRROR đúng rp-server/lib/reportCellFormat.js
// (GROUP_COLORS/SUBTOTAL_COLOR/GRAND_TOTAL_COLOR/ZEBRA_COLOR/resolveRowFillColor/
// resolveStandaloneColumnColor) để bảng báo cáo trên web tô MÀU KHỚP HỆT
// Excel/PDF đã xuất, không rẽ 2 bảng màu khác nhau. definition.columnGroups
// khai tên màu (vd "green") hoặc mã HEX 6 ký tự tự chọn — không khớp cái
// nào thì rơi về "gray" (an toàn, không vỡ giao diện).
//
// Bản 8.58 (theo yêu cầu người dùng — xem chú thích đầy đủ ở bản gốc
// rp-server/lib/reportCellFormat.js): đổi mã màu theo ĐÚNG file mẫu
// BRGMART người dùng gửi (đã giảm bớt độ chói cho "sắc, mỏng, chuyên
// nghiệp hơn"), thêm GRAND_TOTAL_COLOR (dòng Tổng cộng toàn báo cáo, đồng
// nhất 1 màu) + ZEBAR_COLOR (xen kẽ dòng thường) + resolveRowFillColor()
// (dòng Tổng cộng/Tổng cộng nhóm giữ màu CỦA NHÓM, không phải 1 màu phẳng
// như trước) + resolveStandaloneColumnColor() (tô màu 1 cột đơn lẻ không
// thuộc nhóm nào, vd "Trung bình GD"). Bản 8.98 (theo yêu cầu người dùng —
// ĐỔI LẠI đúng màu gốc file mẫu, không giảm bão hoà nữa) — mirror đúng
// rp-server/lib/reportCellFormat.js (xem chú thích đầy đủ ở đó).
const GROUP_COLORS = {
  green: '#9BCC1E', yellow: '#F9CE27', orange: '#FACD9C',
  blue: '#BDD7EE', red: '#F2A9A9', gray: '#D9D9D9', purple: '#9D98FD'
};
export const SUBTOTAL_COLOR = GROUP_COLORS.purple;
export const GRAND_TOTAL_COLOR = GROUP_COLORS.blue;
export const ZEBRA_COLOR = '#D1FEFF';

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
