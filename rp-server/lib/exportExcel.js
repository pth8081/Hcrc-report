// lib/exportExcel.js — Xuất Excel theo ĐÚNG khuôn báo cáo cũ khi
// definition.columnGroups có khai (tiêu đề gộp 2 dòng theo màu từng nhóm
// cột, vd "Doanh thu"/"Lãi gộp"/"Giao dịch" — xem chú thích DefinitionJson
// ở đầu lib/compositeReportRunner.js); không khai columnGroups thì rơi về
// bảng phẳng 1 dòng header như trước (không đổi hành vi báo cáo cũ).
const ExcelJS = require('exceljs');
const { resolveGroupColor, SUBTOTAL_COLOR, computeSttValues } = require('./reportCellFormat');

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

const THIN = { style: 'thin', color: { argb: 'FF999999' } };
const BORDER_ALL = { top: THIN, left: THIN, bottom: THIN, right: THIN };
function fillArgb(hex6) { return { type: 'pattern', pattern: 'solid', fgColor: { argb: `FF${hex6}` } }; }

// definition.columns = [{key, label, format?, width?}] — xem
// lib/reportEngine.js:describeColumns(). definition.columnGroups (TUỲ
// CHỌN) = [{label, color, keys: [...]}] — xem chú thích đầu file
// lib/compositeReportRunner.js.
async function exportExcel(definition, rows) {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet(definition.title.slice(0, 31)); // Excel giới hạn tên sheet 31 ký tự
  const columns = definition.columns;
  const groups = definition.columnGroups || [];
  const colCount = columns.length;

  sheet.columns = columns.map(c => ({ width: c.width || 16 }));

  // ---- Dòng tiêu đề (chỉ khi có columnGroups — báo cáo phẳng cũ giữ
  // nguyên hành vi cũ, KHÔNG thêm dòng tiêu đề để không đổi file đã quen) ----
  let dataStartRow;
  if (groups.length) {
    sheet.mergeCells(1, 1, 1, colCount);
    const titleCell = sheet.getCell(1, 1);
    titleCell.value = definition.title;
    titleCell.font = { bold: true, size: 14 };
    titleCell.alignment = { horizontal: 'center' };
    sheet.getRow(1).height = 22;

    const r1 = 2, r2 = 3;
    const colIndexByKey = new Map(columns.map((c, i) => [c.key, i + 1]));
    const covered = new Set();
    for (const g of groups) {
      const idxs = (g.keys || []).map(k => colIndexByKey.get(k)).filter(Boolean);
      if (!idxs.length) continue;
      const start = Math.min(...idxs), end = Math.max(...idxs);
      const argb = resolveGroupColor(g.color);
      sheet.mergeCells(r1, start, r1, end);
      const top = sheet.getCell(r1, start);
      top.value = g.label;
      top.font = { bold: true };
      top.alignment = { horizontal: 'center', vertical: 'middle' };
      for (let c = start; c <= end; c++) {
        covered.add(c);
        sheet.getCell(r1, c).fill = fillArgb(argb);
        const botC = sheet.getCell(r2, c);
        botC.fill = fillArgb(argb);
        botC.value = columns[c - 1].label;
        botC.font = { bold: true };
        botC.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
      }
    }
    columns.forEach((col, i) => {
      const c = i + 1;
      if (covered.has(c)) return;
      sheet.mergeCells(r1, c, r2, c);
      const cell = sheet.getCell(r1, c);
      cell.value = col.label;
      cell.font = { bold: true };
      cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
    });
    for (let c = 1; c <= colCount; c++) {
      sheet.getCell(r1, c).border = BORDER_ALL;
      sheet.getCell(r2, c).border = BORDER_ALL;
    }
    dataStartRow = 4;
    sheet.views = [{ state: 'frozen', ySplit: dataStartRow - 1 }];
  } else {
    sheet.getRow(1).values = columns.map(c => c.label);
    sheet.getRow(1).font = { bold: true };
    dataStartRow = 2;
    sheet.views = [{ state: 'frozen', ySplit: 1 }];
  }

  const sttValues = computeSttValues(rows);
  const sttColIdx = columns.findIndex(c => c.key === 'stt');

  rows.forEach((row, rIdx) => {
    const excelRow = sheet.getRow(dataStartRow + rIdx);
    columns.forEach((col, cIdx) => {
      const cell = excelRow.getCell(cIdx + 1);
      const raw = cIdx === sttColIdx ? sttValues[rIdx] : row[col.key];
      cell.value = sanitizeFormulaValue(raw);
      if (typeof cell.value === 'number') {
        // "[$-409]" ép định dạng số theo locale en-US (dấu phẩy phân cách
        // nghìn) — KHÔNG phụ thuộc locale Windows/Excel của máy người mở
        // file, khớp đúng định dạng số trong file mẫu báo cáo cũ (dấu phẩy,
        // không phải dấu chấm kiểu vi-VN).
        cell.numFmt = col.format === 'percent' ? '[$-409]0"%"' : '[$-409]#,##0';
        cell.alignment = { horizontal: 'right' };
      }
      if (groups.length) cell.border = BORDER_ALL;
      // Dòng tổng (SourceType='composite' + groupBy — xem
      // lib/compositeReportRunner.js) đánh dấu bằng __isSubtotal, không phải
      // cột thật (không nằm trong definition.columns nên ExcelJS tự bỏ qua
      // khi ghi ô) — tô nền + in đậm, giống hàng "Tổng cộng" trong file mẫu.
      if (row.__isSubtotal) {
        cell.fill = fillArgb(SUBTOTAL_COLOR);
        cell.font = { bold: true };
      }
    });
  });

  return workbook.xlsx.writeBuffer();
}

module.exports = { exportExcel };
