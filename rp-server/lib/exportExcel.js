// lib/exportExcel.js — Xuất Excel DẠNG BẢNG CHUNG (header + dữ liệu), chưa
// theo mẫu biểu công ty. Khi có file .xlsx mẫu thật (đặt trong templates/),
// thay hàm này bằng cách nạp file mẫu và điền dữ liệu vào đúng ô/placeholder
// đã định vị sẵn, thay vì tự dựng sheet mới như hiện tại (xem tài liệu kiến
// trúc, mục 05).
const ExcelJS = require('exceljs');

// definition.columns = [{key, label}] — xem lib/reportEngine.js:describeColumns().
async function exportExcel(definition, rows) {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet(definition.title.slice(0, 31)); // Excel giới hạn tên sheet 31 ký tự

  sheet.columns = definition.columns.map(col => ({ header: col.label, key: col.key, width: 22 }));
  sheet.getRow(1).font = { bold: true };
  sheet.views = [{ state: 'frozen', ySplit: 1 }];
  sheet.addRows(rows);

  return workbook.xlsx.writeBuffer();
}

module.exports = { exportExcel };
