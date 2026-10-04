// lib/reportCellFormat.js — Tiện ích DÙNG CHUNG cho lib/exportExcel.js và
// lib/exportPdf.js (cả 2 xuất từ CÙNG 1 definition/rows nên phải khớp nhau
// tuyệt đối, không rẽ 2 đường tính riêng): đánh số cột "TT" theo từng nhóm,
// định dạng số/phần trăm hiển thị, và bảng màu nhóm cột
// (definition.columnGroups — xem chú thích DefinitionJson ở đầu
// lib/compositeReportRunner.js mục "Tiêu đề nhóm cột + màu (Excel/PDF)").
// Bảng màu (bản 8.58, theo yêu cầu người dùng — "làm màu báo cáo doanh thu
// cuối ngày giống y hệt kiểu màu sắc" 1 file mẫu BRGMART người dùng gửi,
// nhưng "sắc, mỏng, chuyên nghiệp hơn"): lấy ĐÚNG mã màu từng nhóm trong
// file mẫu (lấy mẫu pixel trực tiếp từ PDF — xanh lá #9BCC1E "Doanh thu",
// cam đất #FACD9C "Lãi gộp", vàng gold #F9CE27 "Giao dịch", tím #9D98FD
// "Trung bình GD"/"Doanh thu/m2" + nền dòng Tổng cộng nhóm), sau đó giảm
// độ bão hoà ~15-20% + tăng nhẹ độ sáng để bớt chói/"nổi" kiểu Excel mặc
// định, giữ đúng tông màu gốc (xem /root/.../scratchpad/color-sample khi
// cần đối chiếu lại). 'yellow' PHẢI mang mã màu GOLD/VÀNG (không phải mã
// 'orange' cũ) vì bản 8.58 đổi "Giao dịch" dùng tên 'yellow' (xem
// scripts/seedLdtdHcrcReports.js) — tương tự 'orange' đổi thành mã CAM ĐẤT
// dùng cho "Lãi gộp". GROUP_COLORS KHÔNG dùng ở báo cáo nào khác ngoài 4
// báo cáo "cuối ngày LDTD/HCRC" (đã rà soát `grep columnGroups` toàn repo
// lúc đổi) nên đổi mã màu ở đây AN TOÀN, không ảnh hưởng báo cáo khác.
const GROUP_COLORS = {
  green: 'ADCF59', yellow: 'EAD78A', orange: 'EDC8A1',
  blue: 'BDD7EE', red: 'F2A9A9', gray: 'D9D9D9', purple: 'BCB9E9'
};
// Màu nền Ô "Tổng cộng"/"Tổng cộng <nhóm>" cho các CỘT KHÔNG thuộc
// columnGroups nào (TT/Siêu thị/Diện tích/Trung bình GD/Doanh thu/m2) —
// ĐÚNG mã màu 'purple' ở trên (file mẫu dùng CHUNG 1 màu tím cho cả 2 việc
// này) — xem resolveRowFillColor() bên dưới.
const SUBTOTAL_COLOR = GROUP_COLORS.purple;
// Màu nền dòng "Tổng cộng" TOÀN BÁO CÁO (row.__isGrandTotal — xem
// lib/compositeReportRunner.js) — ĐỒNG NHẤT 1 màu xanh dương cho MỌI cột,
// không phân biệt theo nhóm (đúng dòng cuối cùng trong file mẫu) — trùng
// mã 'blue' ở trên.
const GRAND_TOTAL_COLOR = GROUP_COLORS.blue;
// Màu xen kẽ (zebra) cho các dòng dữ liệu THƯỜNG (không phải Tổng cộng) —
// file mẫu dùng xanh cyan khá chói (#D1FEFF), giảm xuống 1 tông xám-xanh
// rất nhạt cho "mỏng, chuyên nghiệp" (dễ phân biệt dòng nhưng không chói
// mắt). CHỈ áp dụng cho báo cáo CÓ columnGroups (xem nơi gọi) — không đổi
// giao diện các bảng khác (danh sách người dùng, vai trò...) dùng chung
// DataTable.jsx/exportExcel.js/exportPdf.js.
const ZEBRA_COLOR = 'F5F8FA';

// Tên màu có sẵn (khớp đúng bảng trên), hoặc mã HEX 6 ký tự tự chọn (vd
// "FFAA00") — không khớp cái nào thì rơi về "gray" (an toàn, không throw).
function resolveGroupColor(color) {
  if (color && /^[0-9a-fA-F]{6}$/.test(color)) return color.toUpperCase();
  return GROUP_COLORS[color] || GROUP_COLORS.gray;
}

// Màu nền 1 Ô trong dòng "Tổng cộng"/"Tổng cộng <nhóm>" (row.__isSubtotal —
// xem lib/compositeReportRunner.js), ĐÚNG khuôn file mẫu BRGMART: cột
// THUỘC 1 columnGroups nào đó GIỮ NGUYÊN màu của nhóm đó (không có màu
// "đậm hơn" riêng cho dòng tổng — file mẫu dùng lại chính xác màu header);
// cột KHÔNG thuộc nhóm nào (TT/Siêu thị/Diện tích/cột đơn lẻ như "Trung
// bình GD") dùng chung SUBTOTAL_COLOR (tím); dòng TỔNG TOÀN BÁO CÁO
// (__isGrandTotal) ĐỒNG NHẤT 1 màu GRAND_TOTAL_COLOR cho MỌI cột, không
// phân biệt nhóm. Trả về null nếu row không phải dòng tổng (không tô gì —
// nơi gọi tự quyết định có tô zebar hay để trắng).
function resolveRowFillColor(row, col, groups) {
  if (!row || !row.__isSubtotal) return null;
  if (row.__isGrandTotal) return GRAND_TOTAL_COLOR;
  const group = (groups || []).find(g => (g.keys || []).includes(col.key));
  return group ? resolveGroupColor(group.color) : SUBTOTAL_COLOR;
}

// Màu nền HEADER cho 1 CỘT ĐƠN LẺ không thuộc columnGroups nào (rowSpan 2,
// vd "Trung bình GD"/"Doanh thu/m2" trong file mẫu — tô tím NHƯNG KHÔNG có
// dòng tiêu đề nhóm riêng phía trên như "Doanh thu"/"Giao dịch", khác hẳn
// cơ chế columnGroups vốn LUÔN vẽ 2 dòng tiêu đề). Khai ở
// definition.standaloneColumnColors = {colKey: 'tên màu'} (TUỲ CHỌN — không
// khai thì cột đó giữ nền trắng như trước bản 8.58).
function resolveStandaloneColumnColor(col, standaloneColumnColors) {
  const name = (standaloneColumnColors || {})[col.key];
  return name ? resolveGroupColor(name) : null;
}

// Cờ xen kẽ (zebra) cho TỪNG DÒNG trong rows — DÙNG CHUNG cho cả 3 nơi xuất
// (web/Excel/PDF, xem rp-user/src/lib/reportGroupColors.js bản mirror) để
// đảm bảo xen kẽ ĐÚNG Y HỆT nhau, không lệch pha nếu mỗi nơi tự đếm riêng.
// Dòng Tổng cộng/Tổng cộng nhóm (__isSubtotal) đã có màu riêng (xem
// resolveRowFillColor ở trên) nên KHÔNG tính vào số đếm — index xen kẽ CHỈ
// đếm dòng dữ liệu THƯỜNG, giữ nguyên "pha" xen kẽ trước/sau 1 dòng Tổng
// cộng thay vì lệch đi 1 nhịp.
function computeZebraFlags(rows) {
  let n = 0;
  return rows.map(row => {
    if (row.__isSubtotal) return false;
    n += 1;
    return n % 2 === 0;
  });
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

module.exports = {
  GROUP_COLORS, SUBTOTAL_COLOR, GRAND_TOTAL_COLOR, ZEBRA_COLOR,
  resolveGroupColor, resolveRowFillColor, resolveStandaloneColumnColor, computeZebraFlags,
  computeSttValues, formatCellText
};
