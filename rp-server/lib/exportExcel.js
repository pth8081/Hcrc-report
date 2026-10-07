// lib/exportExcel.js — Xuất Excel theo ĐÚNG khuôn báo cáo cũ khi
// definition.columnGroups có khai (tiêu đề gộp 2 dòng theo màu từng nhóm
// cột, vd "Doanh thu"/"Lãi gộp"/"Giao dịch" — xem chú thích DefinitionJson
// ở đầu lib/compositeReportRunner.js); không khai columnGroups thì rơi về
// bảng phẳng 1 dòng header như trước (không đổi hành vi báo cáo cũ).
const ExcelJS = require('exceljs');
const { resolveGroupColor, resolveRowFillColor, resolveStandaloneColumnColor, ZEBRA_COLOR, computeZebraFlags, computeSttValues } = require('./reportCellFormat');

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

// Màu viền — bản 8.58 dùng viền nhạt FFD9DEE2 ("mỏng, chuyên nghiệp hơn").
// Bản 8.98 (theo yêu cầu người dùng — "đóng khung màu đen như bản mẫu")
// ĐỔI sang viền ĐEN khớp đúng file mẫu BRGMART gốc. CHỈ áp dụng cho báo
// cáo CÓ columnGroups (xem 2 nơi gọi BORDER_ALL bên dưới, đều trong nhánh
// `if (groups.length)`) — không đổi viền báo cáo phẳng khác.
const THIN = { style: 'thin', color: { argb: 'FF000000' } };
const BORDER_ALL = { top: THIN, left: THIN, bottom: THIN, right: THIN };
function fillArgb(hex6) { return { type: 'pattern', pattern: 'solid', fgColor: { argb: `FF${hex6}` } }; }

const MIN_COL_WIDTH = 8;
const MAX_COL_WIDTH = 40;

// Độ dài hiển thị ước lượng của 1 giá trị — CHỈ dùng để TÍNH BỀ RỘNG cột,
// không phải giá trị ghi vào ô (numFmt thật vẫn do cell.numFmt quyết định,
// xem bên dưới). Số có numFmt "#,##0"/"0%" hiển thị DÀI HƠN chữ số thô
// (dấu phẩy phân cách nghìn, dấu %) — ước lượng theo ĐÚNG định dạng hiển
// thị thay vì String(raw).length để cột không bị hẹp hơn nội dung thật.
function estimateDisplayLength(raw, col) {
  if (raw === null || raw === undefined || raw === '') return 0;
  if (typeof raw === 'number') {
    return col.format === 'percent' ? `${raw}%`.length : raw.toLocaleString('en-US').length;
  }
  return String(raw).length;
}

// definition.columns = [{key, label, format?, width?}] — xem
// lib/reportEngine.js:describeColumns(). definition.columnGroups (TUỲ
// CHỌN) = [{label, color, keys: [...]}] — xem chú thích đầu file
// lib/compositeReportRunner.js.
//
// addReportSheet() TÁCH RIÊNG khỏi exportExcel() (bản 8.21 — xuất Dashboard,
// xem routes/dashboards.js:POST /:id/export) để GHÉP NHIỀU báo cáo vào CÙNG
// 1 workbook (1 sheet/báo cáo) thay vì mỗi báo cáo 1 file .xlsx riêng — xem
// exportMultiSheetExcel() bên dưới. exportExcel() (xuất 1 báo cáo, hành vi
// CŨ không đổi) giờ chỉ là lớp mỏng tạo workbook rồi gọi hàm này.
function addReportSheet(workbook, definition, rows, sheetName) {
  const sheet = workbook.addWorksheet((sheetName || definition.title).slice(0, 31)); // Excel giới hạn tên sheet 31 ký tự
  const columns = definition.columns;
  const groups = definition.columnGroups || [];
  const colCount = columns.length;

  // TRƯỚC ĐÂY: sheet.columns = columns.map(c => ({ width: c.width || 16 }))
  // — dùng THẲNG definition.columns[].width (đơn vị TRỌNG SỐ tương đối,
  // dùng để CHIA TỈ LỆ bề rộng trang PDF, xem lib/exportPdf.js — vd 0.4,
  // 0.8, 2.4) làm bề rộng CỘT EXCEL THẬT (đơn vị "số ký tự", xem ExcelJS/
  // OOXML) — 2 đơn vị hoàn toàn khác nhau bị gán nhầm cho nhau khiến MỌI
  // cột Excel xuất ra cực hẹp (rộng 0.4-2.4 ký tự, không đủ hiện cả tiêu đề
  // "TT" hay 1 chữ số), người dùng phải tự kéo lại từng cột mới đọc được —
  // đây là nguyên nhân báo cáo xuất Excel không "auto fit" như file mẫu.
  // Giờ TỰ TÍNH bề rộng theo ĐỘ DÀI HIỂN THỊ THẬT của tiêu đề + toàn bộ dữ
  // liệu từng cột (xem estimateDisplayLength() + vòng lặp rows bên dưới,
  // set width sau khi đã biết hết dữ liệu) — đúng nghĩa "auto fit", không
  // phụ thuộc phải khai đúng definition.columns[].width cho từng báo cáo.
  // Header 1 dòng (báo cáo KHÔNG có columnGroups) không tự xuống dòng ->
  // tính luôn độ dài nhãn vào bề rộng cột ngay từ đầu. Header 2 dòng gộp
  // màu (CÓ columnGroups, xem bên dưới) đã bật wrapText nên nhãn dài tự
  // xuống dòng — không cần ép cột rộng theo đúng độ dài nhãn.
  const colMaxLen = columns.map(c => (groups.length ? 0 : (c.label || '').length));

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
      // standaloneColumnColors (bản 8.58) — tô HEADER riêng 1 cột đơn lẻ
      // không thuộc columnGroups nào (vd "Trung bình GD"), KHÔNG thêm dòng
      // tiêu đề nhóm phía trên như columnGroups thật.
      const standaloneColor = resolveStandaloneColumnColor(col, definition.standaloneColumnColors);
      if (standaloneColor) cell.fill = fillArgb(standaloneColor);
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
  const zebraFlags = groups.length ? computeZebraFlags(rows) : rows.map(() => false);

  rows.forEach((row, rIdx) => {
    const excelRow = sheet.getRow(dataStartRow + rIdx);
    columns.forEach((col, cIdx) => {
      const cell = excelRow.getCell(cIdx + 1);
      const raw = cIdx === sttColIdx ? sttValues[rIdx] : row[col.key];
      cell.value = sanitizeFormulaValue(raw);
      colMaxLen[cIdx] = Math.max(colMaxLen[cIdx], estimateDisplayLength(raw, col));
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
      // khi ghi ô) — tô màu THEO TỪNG CỘT (bản 8.58, xem resolveRowFillColor
      // ở lib/reportCellFormat.js: cột thuộc nhóm giữ màu nhóm đó, cột ngoài
      // nhóm dùng SUBTOTAL_COLOR, dòng Tổng cộng toàn báo cáo đồng nhất 1
      // màu) + in đậm, giống hàng "Tổng cộng" trong file mẫu. Dòng dữ liệu
      // THƯỜNG (không phải Tổng cộng) xen kẽ màu zebra (bản 8.58) — CHỈ áp
      // dụng báo cáo có columnGroups (groups.length), không đổi báo cáo
      // phẳng cũ.
      const fillColor = resolveRowFillColor(row, col, groups);
      if (fillColor) {
        cell.fill = fillArgb(fillColor);
        cell.font = { bold: true };
      } else if (zebraFlags[rIdx]) {
        cell.fill = fillArgb(ZEBRA_COLOR);
      }
    });
  });

  columns.forEach((col, i) => {
    sheet.getColumn(i + 1).width = Math.min(MAX_COL_WIDTH, Math.max(MIN_COL_WIDTH, colMaxLen[i] + 2));
  });
}

async function exportExcel(definition, rows) {
  const workbook = new ExcelJS.Workbook();
  addReportSheet(workbook, definition, rows);
  return workbook.xlsx.writeBuffer();
}

const SHEET_NAME_MAX = 31; // giới hạn cứng của Excel

// Excel giới hạn tên sheet 31 ký tự — cắt NGẮN GIỮA (giữ đầu + "…" + ĐUÔI)
// thay vì cắt thẳng ở cuối: tiêu đề các Ô Dashboard thường giống nhau Ở ĐẦU,
// chỉ khác nhau ở ĐUÔI (vd "Top 5 MART — Doanh thu cao nhất (Trong ngày)" so
// với "...(Trong tháng)") — cắt thẳng cuối sẽ xoá mất đúng phần khác nhau
// đó, khiến nhiều sheet trông "trùng tên" rồi bị đánh số (2)/(3) vô nghĩa
// thay vì giữ được tên phân biệt rõ ràng.
function shortenSheetName(name) {
  if (name.length <= SHEET_NAME_MAX) return name;
  const headLen = 18, tailLen = SHEET_NAME_MAX - headLen - 1;
  return `${name.slice(0, headLen)}…${name.slice(-tailLen)}`;
}

// sheets: [{ definition, rows, sheetName? }] — xuất NHIỀU báo cáo thành 1
// file .xlsx, mỗi báo cáo 1 sheet riêng (dùng cho "Xuất Excel" ở Dashboard —
// xem routes/dashboards.js). sheetName sau khi rút ngắn (xem
// shortenSheetName()) vẫn trùng nhau (2 tiêu đề gốc khác nhau nhưng cùng 18
// ký tự đầu + 12 ký tự cuối) thì đánh số hậu tố (2), (3)... để đảm bảo duy
// nhất, tương tự cách Excel tự xử lý khi người dùng copy sheet trùng tên.
async function exportMultiSheetExcel(sheets) {
  const workbook = new ExcelJS.Workbook();
  const usedNames = new Set();
  for (const s of sheets) {
    const shortened = shortenSheetName(s.sheetName || s.definition.title);
    let name = shortened;
    let suffix = 2;
    while (usedNames.has(name)) {
      name = `${shortened.slice(0, SHEET_NAME_MAX - String(suffix).length - 3)} (${suffix})`;
      suffix += 1;
    }
    usedNames.add(name);
    addReportSheet(workbook, s.definition, s.rows, name);
  }
  return workbook.xlsx.writeBuffer();
}

module.exports = { exportExcel, exportMultiSheetExcel };
