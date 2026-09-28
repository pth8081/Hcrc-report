// lib/xlsxResponse.js — Trả 1 buffer .xlsx đã dựng sẵn (ExcelJS
// workbook.xlsx.writeBuffer(), xem lib/salesTargetsImport.js/
// lib/branchCodeMapImport.js) làm file tải về — dùng chung cho mọi route
// "Tải file mẫu"/"Xuất Excel" trong etl-admin, khỏi lặp lại 2 dòng header
// response ở từng route.
function sendXlsx(res, buffer, filename) {
  // res.attachment() (Express, dùng gói content-disposition bên trong) tự mã
  // hoá đúng chuẩn RFC 5987 khi filename có ký tự tiếng Việt NGOÀI Latin-1 —
  // gán thẳng chuỗi vào header (như trước) ném TypeError [ERR_INVALID_CHAR],
  // 500 lỗi máy chủ, xem VERSION.md (lỗi tương tự bên rp-server/routes/reports.js).
  res.attachment(filename);
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.send(buffer);
}

module.exports = { sendXlsx };
