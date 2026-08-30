// lib/exportPdf.js — Xuất PDF DẠNG BẢNG CHUNG (tiêu đề + header + dữ liệu, tự
// sang trang khi tràn), chưa theo mẫu biểu công ty. Đủ dùng để xem/in nhanh;
// khi cần đúng khuôn dấu/tiêu đề công ty, thay bằng cách nạp mẫu PDF/Word có
// sẵn định dạng rồi điền dữ liệu, giống hướng làm với exportExcel.js.
const { PDFDocument, StandardFonts } = require('pdf-lib');

const PAGE_SIZE = [595.28, 841.89]; // A4 chiều dọc, đơn vị point
const MARGIN = 40;
const ROW_HEIGHT = 18;

// definition.columns = [{key, label}] — xem lib/reportEngine.js:describeColumns().
async function exportPdf(definition, rows) {
  const pdfDoc = await PDFDocument.create();
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const boldFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

  let page = pdfDoc.addPage(PAGE_SIZE);
  let y = PAGE_SIZE[1] - MARGIN;

  page.drawText(definition.title, { x: MARGIN, y, size: 14, font: boldFont });
  y -= ROW_HEIGHT * 1.5;

  const colWidth = (PAGE_SIZE[0] - MARGIN * 2) / definition.columns.length;

  function drawRow(values, useBold) {
    definition.columns.forEach((col, i) => {
      const text = String(values[col.key] ?? '');
      page.drawText(text.slice(0, 40), {
        x: MARGIN + i * colWidth,
        y,
        size: 9,
        font: useBold ? boldFont : font
      });
    });
    y -= ROW_HEIGHT;
  }

  drawRow(Object.fromEntries(definition.columns.map(c => [c.key, c.label])), true);

  for (const row of rows) {
    if (y < MARGIN + ROW_HEIGHT) {
      page = pdfDoc.addPage(PAGE_SIZE);
      y = PAGE_SIZE[1] - MARGIN;
    }
    drawRow(row, false);
  }

  return Buffer.from(await pdfDoc.save());
}

module.exports = { exportPdf };
