// lib/exportExcel.js — Xuất Excel DẠNG BẢNG CHUNG (header + dữ liệu), chưa
// theo mẫu biểu công ty. Khi có file .xlsx mẫu thật (đặt trong templates/),
// thay hàm này bằng cách nạp file mẫu và điền dữ liệu vào đúng ô/placeholder
// đã định vị sẵn, thay vì tự dựng sheet mới như hiện tại (xem tài liệu kiến
// trúc, mục 05).
const ExcelJS = require('exceljs');

// Formula/CSV injection (OWASP): 1 ô bắt đầu bằng =, +, -, @ bị Excel/Sheets
// hiểu thành CÔNG THỨC SỐNG khi người nhận mở file — dữ liệu này đến từ
// dwh.ReportFacts/dữ liệu nguồn ngoài (vd Ghi chú nhập tay ở hệ thống chi
// nhánh), không phải do rp-server tự sinh, nên KHÔNG được tin là an toàn.
// Thêm dấu nháy đơn ở đầu buộc Excel hiểu là VĂN BẢN THƯỜNG (cách khắc phục
// chuẩn OWASP) — chỉ áp dụng khi ghi ra file xuất, không đụng tới dữ liệu
// gốc (rows gốc vẫn dùng nguyên để tính __isSubtotal bên dưới).
const FORMULA_LEADING_CHAR_RE = /^[=+\-@]/;

function sanitizeFormulaValue(value) {
  return typeof value === 'string' && FORMULA_LEADING_CHAR_RE.test(value) ? `'${value}` : value;
}

function sanitizeRowForExport(row) {
  const safe = {};
  for (const key of Object.keys(row)) safe[key] = sanitizeFormulaValue(row[key]);
  return safe;
}

// definition.columns = [{key, label}] — xem lib/reportEngine.js:describeColumns().
async function exportExcel(definition, rows) {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet(definition.title.slice(0, 31)); // Excel giới hạn tên sheet 31 ký tự

  sheet.columns = definition.columns.map(col => ({ header: col.label, key: col.key, width: 22 }));
  sheet.getRow(1).font = { bold: true };
  sheet.views = [{ state: 'frozen', ySplit: 1 }];
  sheet.addRows(rows.map(sanitizeRowForExport));

  // Dòng tổng (SourceType='composite' + groupBy — xem
  // lib/compositeReportRunner.js) đánh dấu bằng __isSubtotal, không phải
  // cột thật (không nằm trong definition.columns nên ExcelJS tự bỏ qua khi
  // ghi ô) — chỉ dùng ở đây để in đậm, giống hàng "Tổng cộng" trong file mẫu.
  rows.forEach((row, i) => {
    if (row.__isSubtotal) sheet.getRow(i + 2).font = { bold: true }; // +2: dòng 1 là header
  });

  return workbook.xlsx.writeBuffer();
}

module.exports = { exportExcel };
