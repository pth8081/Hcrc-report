// lib/xlsxResponse.js — Trả 1 buffer .xlsx đã dựng sẵn (ExcelJS
// workbook.xlsx.writeBuffer(), xem lib/salesTargetsImport.js/
// lib/branchCodeMapImport.js) làm file tải về — dùng chung cho mọi route
// "Tải file mẫu"/"Xuất Excel" trong etl-admin, khỏi lặp lại 2 dòng header
// response ở từng route.
function sendXlsx(res, buffer, filename) {
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  res.send(buffer);
}

module.exports = { sendXlsx };
