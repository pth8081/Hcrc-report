// lib/exportPdf.js — Xuất PDF DẠNG BẢNG CHUNG (tiêu đề + header + dữ liệu, tự
// sang trang khi tràn), chưa theo mẫu biểu công ty. Đủ dùng để xem/in nhanh;
// khi cần đúng khuôn dấu/tiêu đề công ty, thay bằng cách nạp mẫu PDF/Word có
// sẵn định dạng rồi điền dữ liệu, giống hướng làm với exportExcel.js.
//
// Font: StandardFonts (Helvetica) của pdf-lib chỉ mã hoá được bảng WinAnsi —
// KHÔNG có dấu tiếng Việt (ị/ẩ/ệ/ư/ơ...). Toàn bộ dữ liệu thật (tiêu đề báo
// cáo, tên siêu thị, ngành hàng...) đều có dấu, nên trước đây drawText() với
// StandardFonts NÉM LỖI NGAY ("WinAnsi cannot encode...") — xuất PDF gần như
// LUÔN lỗi 500, và lịch gửi email ExportFormat='pdf' (jobs/reportEmailScheduler.js)
// thất bại vĩnh viễn mỗi lần chạy. Nhúng font Noto Sans Vietnamese (qua
// @pdf-lib/fontkit, hỗ trợ Unicode đầy đủ) thay cho font chuẩn.
const { PDFDocument } = require('pdf-lib');
const fontkit = require('@pdf-lib/fontkit');
const fs = require('fs');
const path = require('path');

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

const PAGE_SIZE = [595.28, 841.89]; // A4 chiều dọc, đơn vị point
const MARGIN = 40;
const ROW_HEIGHT = 18;

// definition.columns = [{key, label}] — xem lib/reportEngine.js:describeColumns().
async function exportPdf(definition, rows) {
  const { regular: regularBytes, bold: boldBytes } = loadFontBytes();
  const pdfDoc = await PDFDocument.create();
  pdfDoc.registerFontkit(fontkit);
  const font = await pdfDoc.embedFont(regularBytes, { subset: true });
  const boldFont = await pdfDoc.embedFont(boldBytes, { subset: true });

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
    // Dòng tổng (SourceType='composite' + groupBy, xem
    // lib/compositeReportRunner.js) đánh dấu bằng __isSubtotal — in đậm,
    // giống hàng "Tổng cộng" trong file mẫu.
    drawRow(row, !!row.__isSubtotal);
  }

  return Buffer.from(await pdfDoc.save());
}

module.exports = { exportPdf };
