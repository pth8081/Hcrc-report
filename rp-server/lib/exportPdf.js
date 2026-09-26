// lib/exportPdf.js — Xuất PDF. definition.columnGroups có khai (xem chú
// thích đầu lib/compositeReportRunner.js) thì vẽ ĐÚNG khuôn báo cáo cũ:
// trang ngang (nhiều cột), tiêu đề gộp 2 dòng theo màu từng nhóm, kẻ khung
// từng ô, tô nền dòng "Tổng cộng" — lặp lại đúng header ở mỗi trang mới.
// Không khai columnGroups thì rơi về bảng phẳng trang dọc như trước (không
// đổi hành vi báo cáo cũ).
//
// Font: StandardFonts (Helvetica) của pdf-lib chỉ mã hoá được bảng WinAnsi —
// KHÔNG có dấu tiếng Việt (ị/ẩ/ệ/ư/ơ...). Toàn bộ dữ liệu thật (tiêu đề báo
// cáo, tên siêu thị, ngành hàng...) đều có dấu, nên trước đây drawText() với
// StandardFonts NÉM LỖI NGAY ("WinAnsi cannot encode...") — xuất PDF gần như
// LUÔN lỗi 500, và lịch gửi email ExportFormat='pdf' (jobs/reportEmailScheduler.js)
// thất bại vĩnh viễn mỗi lần chạy. Nhúng font Noto Sans Vietnamese (qua
// @pdf-lib/fontkit, hỗ trợ Unicode đầy đủ) thay cho font chuẩn.
const { PDFDocument, rgb } = require('pdf-lib');
const fontkit = require('@pdf-lib/fontkit');
const fs = require('fs');
const path = require('path');
const { resolveGroupColor, SUBTOTAL_COLOR, computeSttValues, formatCellText } = require('./reportCellFormat');

const FONT_DIR = path.join(__dirname, '..', 'node_modules', '@openfonts', 'noto-sans_vietnamese', 'files');

// Nạp LAZY (trong hàm, không phải ở scope module) + cache lại sau lần đầu —
// trước đây fs.readFileSync() chạy ngay lúc require() (module này được
// require ở top-level bởi routes/reports.js VÀ jobs/reportEmailScheduler.js,
// cả 2 đều nạp lúc server.js khởi động, không lazy). Thiếu file font (deploy
// sai/thiếu nested node_modules) trước đây làm SẬP CẢ TIẾN TRÌNH ngay lúc
// khởi động — không đăng nhập được, không route nào chạy được, dù lỗi chỉ
// thật sự liên quan tới đúng 1 tính năng (xuất PDF). Giờ lỗi chỉ nổ ra ĐÚNG
// lúc gọi exportPdf() thật, kèm thông báo rõ ràng, các tính năng khác không
// bị ảnh hưởng.
let fontBytesCache = null;
function loadFontBytes() {
  if (fontBytesCache) return fontBytesCache;
  try {
    fontBytesCache = {
      regular: fs.readFileSync(path.join(FONT_DIR, 'noto-sans-vietnamese-400.woff')),
      bold: fs.readFileSync(path.join(FONT_DIR, 'noto-sans-vietnamese-700.woff'))
    };
  } catch (err) {
    throw new Error(`Không nạp được font tiếng Việt cho xuất PDF (thiếu gói @openfonts/noto-sans_vietnamese — kiểm tra lại "npm install" đã chạy đủ chưa): ${err.message}`);
  }
  return fontBytesCache;
}

const MARGIN = 30;
const ROW_HEIGHT = 16;
const HEADER_ROW_HEIGHT = 24;

function hexToRgb01(hex6) {
  return rgb(
    parseInt(hex6.slice(0, 2), 16) / 255,
    parseInt(hex6.slice(2, 4), 16) / 255,
    parseInt(hex6.slice(4, 6), 16) / 255
  );
}
const BORDER_RGB = rgb(0.6, 0.6, 0.6);

// definition.columns = [{key, label, format?, width?}] — xem
// lib/reportEngine.js:describeColumns(). definition.columnGroups (TUỲ
// CHỌN) — xem chú thích đầu file lib/compositeReportRunner.js.
async function exportPdf(definition, rows) {
  const { regular: regularBytes, bold: boldBytes } = loadFontBytes();
  const pdfDoc = await PDFDocument.create();
  pdfDoc.registerFontkit(fontkit);
  const font = await pdfDoc.embedFont(regularBytes, { subset: true });
  const boldFont = await pdfDoc.embedFont(boldBytes, { subset: true });

  const columns = definition.columns;
  const groups = definition.columnGroups || [];
  const hasGroups = groups.length > 0;

  // Nhiều cột (báo cáo có columnGroups) thì dùng trang NGANG cho đủ chỗ —
  // báo cáo phẳng cũ (ít cột) giữ trang dọc như trước.
  const PAGE_SIZE = hasGroups ? [841.89, 595.28] : [595.28, 841.89];
  const usableWidth = PAGE_SIZE[0] - MARGIN * 2;

  const weights = columns.map(c => c.width || 1);
  const totalWeight = weights.reduce((a, b) => a + b, 0);
  const colWidths = weights.map(w => (w / totalWeight) * usableWidth);
  const colX = [];
  let x = MARGIN;
  for (const w of colWidths) { colX.push(x); x += w; }

  let page = pdfDoc.addPage(PAGE_SIZE);
  let y = PAGE_SIZE[1] - MARGIN;

  function drawCellText(text, cx, cw, cy, opts = {}) {
    const { bold = false, size = 8, align = 'left' } = opts;
    const f = bold ? boldFont : font;
    const str = String(text ?? '').slice(0, 60);
    const textWidth = f.widthOfTextAtSize(str, size);
    let tx = cx + 3;
    if (align === 'right') tx = cx + cw - textWidth - 3;
    else if (align === 'center') tx = cx + (cw - textWidth) / 2;
    page.drawText(str, { x: tx, y: cy, size, font: f, color: rgb(0.1, 0.1, 0.1) });
  }

  // Bọc dòng theo từ (word-wrap) để nhãn tiêu đề DÀI không tràn sang ô kế
  // bên — cột hẹp (vd "Cùng kỳ năm 2025") CẦN xuống dòng thay vì lấn ô khác.
  function wrapLines(text, f, size, maxWidth) {
    const words = String(text ?? '').split(' ');
    const lines = [];
    let cur = '';
    for (const w of words) {
      const attempt = cur ? `${cur} ${w}` : w;
      if (f.widthOfTextAtSize(attempt, size) <= maxWidth || !cur) {
        cur = attempt;
      } else {
        lines.push(cur);
        cur = w;
      }
    }
    if (cur) lines.push(cur);
    return lines;
  }

  // Vẽ nhãn CÓ THỂ xuống nhiều dòng, canh giữa cả ngang lẫn dọc trong 1 vùng
  // (cx, cw) x (vùng cao availableHeight, đỉnh tại topY).
  function drawWrappedCenteredText(text, cx, cw, topY, availableHeight, opts = {}) {
    const { bold = false, size = 7 } = opts;
    const f = bold ? boldFont : font;
    const lines = wrapLines(text, f, size, cw - 4);
    const lineGap = size + 2;
    const blockHeight = lines.length * lineGap;
    let ly = topY - (availableHeight - blockHeight) / 2 - size;
    for (const line of lines) {
      const w = f.widthOfTextAtSize(line, size);
      page.drawText(line, { x: cx + (cw - w) / 2, y: ly, size, font: f, color: rgb(0.1, 0.1, 0.1) });
      ly -= lineGap;
    }
  }

  function drawGridRect(cx, cy, cw, ch, fillHex) {
    page.drawRectangle({
      x: cx, y: cy, width: cw, height: ch,
      color: fillHex ? hexToRgb01(fillHex) : undefined,
      borderColor: BORDER_RGB, borderWidth: 0.5
    });
  }

  function drawTitle() {
    const size = 13;
    const textWidth = boldFont.widthOfTextAtSize(definition.title, size);
    page.drawText(definition.title, { x: (PAGE_SIZE[0] - textWidth) / 2, y, size, font: boldFont });
    y -= ROW_HEIGHT * 1.6;
  }

  function drawHeader() {
    if (!hasGroups) {
      // Bọc dòng (giống nhánh columnGroups bên dưới) thay vì vẽ 1 dòng cố
      // định — báo cáo càng nhiều cột (vd 'topZeroStock' có tới 9 cột, nhãn
      // dài như "Đã nhập hôm nay (Điều chuyển)") thì mỗi cột càng hẹp, nhãn
      // 1 dòng tràn đè lên cột kế bên (phát hiện được lúc demo báo cáo tồn
      // kho=0, xem VERSION.md).
      const rowTop = y;
      columns.forEach((col, i) => {
        drawGridRect(colX[i], rowTop - HEADER_ROW_HEIGHT, colWidths[i], HEADER_ROW_HEIGHT);
        drawWrappedCenteredText(col.label, colX[i], colWidths[i], rowTop, HEADER_ROW_HEIGHT, { bold: true, size: 7 });
      });
      y -= HEADER_ROW_HEIGHT;
      return;
    }
    const row1Top = y;
    const row2Top = y - HEADER_ROW_HEIGHT;
    const colIndexByKey = new Map(columns.map((c, i) => [c.key, i]));
    const covered = new Set();
    for (const g of groups) {
      const idxs = (g.keys || []).map(k => colIndexByKey.get(k)).filter(v => v !== undefined);
      if (!idxs.length) continue;
      const start = Math.min(...idxs), end = Math.max(...idxs);
      const argb = resolveGroupColor(g.color);
      const startX = colX[start];
      const spanW = colX[end] + colWidths[end] - startX;
      drawGridRect(startX, row1Top - HEADER_ROW_HEIGHT, spanW, HEADER_ROW_HEIGHT, argb);
      drawWrappedCenteredText(g.label, startX, spanW, row1Top, HEADER_ROW_HEIGHT, { bold: true, size: 9 });
      for (let i = start; i <= end; i++) {
        covered.add(i);
        drawGridRect(colX[i], row2Top - HEADER_ROW_HEIGHT, colWidths[i], HEADER_ROW_HEIGHT, argb);
        drawWrappedCenteredText(columns[i].label, colX[i], colWidths[i], row2Top, HEADER_ROW_HEIGHT, { bold: true, size: 6.5 });
      }
    }
    columns.forEach((col, i) => {
      if (covered.has(i)) return;
      drawGridRect(colX[i], row2Top - HEADER_ROW_HEIGHT, colWidths[i], HEADER_ROW_HEIGHT * 2);
      drawWrappedCenteredText(col.label, colX[i], colWidths[i], row1Top, HEADER_ROW_HEIGHT * 2, { bold: true, size: 7 });
    });
    y -= HEADER_ROW_HEIGHT * 2;
  }

  function newPage() {
    page = pdfDoc.addPage(PAGE_SIZE);
    y = PAGE_SIZE[1] - MARGIN;
    drawHeader();
  }

  drawTitle();
  drawHeader();

  const sttValues = computeSttValues(rows);
  const sttColIdx = columns.findIndex(c => c.key === 'stt');

  for (let rIdx = 0; rIdx < rows.length; rIdx++) {
    if (y - ROW_HEIGHT < MARGIN) newPage();
    const row = rows[rIdx];
    const rowTop = y;
    const rowFill = row.__isSubtotal ? SUBTOTAL_COLOR : undefined;
    columns.forEach((col, i) => {
      drawGridRect(colX[i], rowTop - ROW_HEIGHT, colWidths[i], ROW_HEIGHT, rowFill);
      const raw = i === sttColIdx ? sttValues[rIdx] : row[col.key];
      const text = formatCellText(raw, col);
      const align = typeof raw === 'number' ? 'right' : 'left';
      drawCellText(text, colX[i], colWidths[i], rowTop - ROW_HEIGHT + 4, { bold: !!row.__isSubtotal, align });
    });
    y -= ROW_HEIGHT;
  }

  return Buffer.from(await pdfDoc.save());
}

module.exports = { exportPdf };
