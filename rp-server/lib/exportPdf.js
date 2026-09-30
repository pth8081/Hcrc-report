// lib/exportPdf.js — Xuất PDF. definition.columnGroups có khai (xem chú
// thích đầu lib/compositeReportRunner.js) thì vẽ ĐÚNG khuôn báo cáo cũ:
// trang ngang (nhiều cột), tiêu đề gộp 2 dòng theo màu từng nhóm, kẻ khung
// từng ô, tô nền dòng "Tổng cộng" — lặp lại đúng header ở mỗi trang mới.
// Không khai columnGroups thì rơi về bảng phẳng trang dọc như trước (không
// đổi hành vi báo cáo cũ).
//
// definition.compactSinglePage === true (bản 8.18 — MỚI, CHỈ 4 báo cáo
// doanh thu LDTD/HCRC gốc + Thành viên khai cờ này, xem
// rp-server/scripts/seedLdtdHcrcReports.js) — khác HẲN 2 nhánh trên: khổ
// trang DỌC A4 CỐ ĐỊNH (không mở rộng theo nội dung như nhánh mặc định),
// TỰ ĐỘNG dò cỡ chữ nhỏ dần (8pt xuống tới sàn 4pt) cho tới khi TOÀN BỘ
// bảng (mọi cột + mọi dòng) vừa đúng 1 trang — đúng yêu cầu người dùng
// "xoay dọc và chữ nhỏ để đúng 1 trang" theo file mẫu tham khảo (PDF thật
// khổ A4 dọc, MediaBox 596x842, đã đối chiếu). Số chi nhánh/dòng có thể
// tăng theo thời gian (vd thêm cửa hàng Thành viên) — không có cỡ chữ cố
// định nào đúng mãi, nên DÒ ĐỘNG mỗi lần xuất thay vì hằng số cứng. Nếu dò
// tới sàn 4pt vẫn không đủ (quá nhiều dòng để nhồi 1 trang thật sự), CHẤP
// NHẬN tràn sang trang 2 (an toàn hơn chữ nhỏ tới mức không đọc được) —
// cơ chế tự ngắt trang overflow-guard vẫn hoạt động bình thường.
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

const DEFAULT_MARGIN = 30;
const DEFAULT_ROW_HEIGHT = 16;
const DEFAULT_HEADER_ROW_HEIGHT = 24;
const COMPACT_PAGE_SIZE = [595.28, 841.89]; // A4 dọc CỐ ĐỊNH — đối chiếu đúng MediaBox file mẫu người dùng gửi
const COMPACT_MARGIN = 20;
const COMPACT_TITLE_SIZE = 11;
const COMPACT_MIN_FONT_SIZE = 4; // sàn — dưới mức này coi như không đọc được nữa, chấp nhận tràn trang
const COMPACT_MIN_COL_WIDTH_PT = 14;

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
  const compact = !!definition.compactSinglePage;

  const sttValues = computeSttValues(rows);
  const sttColIdx = columns.findIndex(c => c.key === 'stt');

  // Bọc dòng theo từ (word-wrap) — ĐỊNH NGHĨA SỚM (trước đây nằm cuối file,
  // chỉ dùng lúc VẼ) vì nhánh compact bên dưới cần MÔ PHỎNG số dòng thật sự
  // của tiêu đề (vd "Cùng kỳ năm 2025" bọc mấy dòng ở cỡ chữ/bề rộng cột rất
  // nhỏ) để tính ĐÚNG chiều cao hàng tiêu đề cần thiết — không đoán bằng
  // công thức cố định (từng gây chồng chữ lên dòng dữ liệu bên dưới khi cỡ
  // chữ quá nhỏ mà công thức cũ đoán thiếu).
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

  // Đo bề rộng CẦN THIẾT của 1 cột ở 1 cỡ chữ + 1 TỔNG đệm (2 bên CỘNG lại)
  // cho trước — đo bằng boldFont (dòng Tổng cộng in đậm) để không đo THIẾU,
  // chữ đậm luôn rộng hơn hoặc bằng chữ thường cùng size. `totalPad` PHẢI
  // KHỚP ĐÚNG (hoặc lớn hơn 1 chút để an toàn) tổng đệm bị TRỪ lúc VẼ THẬT
  // (drawCellText: `cw - padding*2`) — trước đây 2 nơi tính đệm khác công
  // thức nhau, đo THỪA lúc đo nhưng lúc vẽ lại trừ đệm NHIỀU HƠN, khiến chữ
  // vừa đủ theo phép đo vẫn bị cắt "…" khi vẽ thật (đã phát hiện qua render
  // thử — HẦU HẾT ô số bị cắt dù cột đã "đủ rộng" theo tính toán).
  function measureCellWidthAtSize(col, i, cellFontSize, totalPad, minColWidth) {
    let maxTextWidth = 0;
    for (let r = 0; r < rows.length; r++) {
      const raw = i === sttColIdx ? sttValues[r] : rows[r][col.key];
      const text = String(formatCellText(raw, col) ?? '');
      const w = boldFont.widthOfTextAtSize(text.slice(0, 60), cellFontSize);
      if (w > maxTextWidth) maxTextWidth = w;
    }
    // Sàn theo TỪ dài nhất trong nhãn cột — header tự xuống dòng (wrapLines)
    // nên không cần vừa NGUYÊN nhãn trên 1 dòng, nhưng vẫn cần đủ rộng để
    // không cắt ngang GIỮA 1 từ.
    const headerFontSize = Math.max(4, cellFontSize - 1);
    const headerWords = String(col.label || '').split(' ');
    const headerWordWidth = Math.max(0, ...headerWords.map(w => boldFont.widthOfTextAtSize(w, headerFontSize)));
    return Math.max(minColWidth, maxTextWidth + totalPad, headerWordWidth + 6);
  }

  let PAGE_SIZE, MARGIN, ROW_HEIGHT, HEADER_ROW_HEIGHT, CELL_FONT_SIZE, TITLE_SIZE, colWidths, CELL_SIDE_PAD;
  let HEADER_GROUP_FONT_SIZE, HEADER_SUBCOL_FONT_SIZE, HEADER_FLAT_FONT_SIZE;

  if (compact) {
    // DÒ cỡ chữ giảm dần (8pt -> sàn COMPACT_MIN_FONT_SIZE, bước 0.25) cho
    // tới khi TOÀN BỘ bảng (bề rộng mọi cột CỘNG lại, VÀ chiều cao tiêu đề +
    // header + mọi dòng dữ liệu — chiều cao header MÔ PHỎNG wrap THẬT, xem
    // neededHeaderHeight()) vừa đúng khổ A4 dọc CỐ ĐỊNH — khác nhánh mặc
    // định bên dưới (nội dung rộng hơn khổ mặc định thì MỞ RỘNG khổ trang),
    // ở đây khổ trang KHÔNG BAO GIỜ đổi, chỉ cỡ chữ tự co lại.
    PAGE_SIZE = COMPACT_PAGE_SIZE;
    MARGIN = COMPACT_MARGIN;
    TITLE_SIZE = COMPACT_TITLE_SIZE;
    const usableWidth = PAGE_SIZE[0] - MARGIN * 2;
    const usableHeight = PAGE_SIZE[1] - MARGIN * 2;
    const titleBlockHeight = TITLE_SIZE * 1.6;

    // Chiều cao 1 hàng tiêu đề CẦN THIẾT — lấy MAX số dòng thật (mô phỏng
    // wrapLines, khớp đúng width mỗi cột/nhóm sẽ dùng lúc vẽ) trong TỪNG
    // nhãn, nhân lineGap (PHẢI khớp đúng lineGap trong drawWrappedCenteredText).
    function neededHeaderRowHeight(labelWidthPairs, fontSize) {
      let maxLines = 1;
      for (const [label, w] of labelWidthPairs) {
        const lines = wrapLines(label, boldFont, fontSize, Math.max(4, w - 4)).length;
        if (lines > maxLines) maxLines = lines;
      }
      return maxLines * (fontSize + 2) + 4;
    }

    let found = null;
    for (let size = 8; size >= COMPACT_MIN_FONT_SIZE; size -= 0.25) {
      const sidePad = Math.max(1.5, size * 0.3);
      const widths = columns.map((col, i) => measureCellWidthAtSize(col, i, size, sidePad * 2 + 0.5, COMPACT_MIN_COL_WIDTH_PT));
      const totalWidth = widths.reduce((a, b) => a + b, 0);
      if (totalWidth > usableWidth) continue;

      const groupFontSize = Math.max(4.5, size + 1.5);
      const subColFontSize = Math.max(4, size);
      const flatFontSize = Math.max(4, size);

      let headerBlockHeight;
      if (hasGroups) {
        const colIndexByKey = new Map(columns.map((c, i) => [c.key, i]));
        const groupPairs = groups.map(g => {
          const idxs = (g.keys || []).map(k => colIndexByKey.get(k)).filter(v => v !== undefined);
          const spanW = idxs.reduce((sum, i) => sum + widths[i], 0);
          return [g.label, spanW || 40];
        });
        const subColPairs = columns.map((col, i) => [col.label, widths[i]]);
        const row1H = neededHeaderRowHeight(groupPairs, groupFontSize);
        const row2H = neededHeaderRowHeight(subColPairs, subColFontSize);
        headerBlockHeight = Math.max(row1H, row2H) * 2; // drawHeader() dùng CHUNG 1 chiều cao cho cả 2 hàng
      } else {
        const flatPairs = columns.map((col, i) => [col.label, widths[i]]);
        headerBlockHeight = neededHeaderRowHeight(flatPairs, flatFontSize);
      }

      const rowH = Math.max(6, size + 4);
      const neededHeight = titleBlockHeight + headerBlockHeight + rowH * rows.length;
      if (neededHeight > usableHeight) continue;

      found = { size, widths, sidePad, rowH, headerRowH: headerBlockHeight / (hasGroups ? 2 : 1), groupFontSize, subColFontSize, flatFontSize };
      break;
    }
    if (!found) {
      // Quá nhiều dòng để nhồi 1 trang thật sự dù đã ở sàn cỡ chữ — dùng
      // sàn, chấp nhận tràn trang (overflow-guard trong vòng lặp vẽ dòng
      // bên dưới vẫn hoạt động bình thường, tự ngắt trang mới khi cần).
      const size = COMPACT_MIN_FONT_SIZE;
      const sidePad = Math.max(1.5, size * 0.3);
      const widths = columns.map((col, i) => measureCellWidthAtSize(col, i, size, sidePad * 2 + 0.5, COMPACT_MIN_COL_WIDTH_PT));
      found = {
        size, widths, sidePad,
        rowH: Math.max(6, size + 4),
        headerRowH: Math.max(10, size + 6),
        groupFontSize: Math.max(4.5, size + 1.5), subColFontSize: Math.max(4, size), flatFontSize: Math.max(4, size)
      };
    }
    CELL_FONT_SIZE = found.size;
    colWidths = found.widths;
    CELL_SIDE_PAD = found.sidePad;
    ROW_HEIGHT = found.rowH;
    HEADER_ROW_HEIGHT = found.headerRowH;
    HEADER_GROUP_FONT_SIZE = found.groupFontSize;
    HEADER_SUBCOL_FONT_SIZE = found.subColFontSize;
    HEADER_FLAT_FONT_SIZE = found.flatFontSize;
  } else {
    // ===== Nhánh MẶC ĐỊNH — HÀNH VI GIỮ NGUYÊN NHƯ TRƯỚC BẢN 8.18 =====
    MARGIN = DEFAULT_MARGIN;
    ROW_HEIGHT = DEFAULT_ROW_HEIGHT;
    HEADER_ROW_HEIGHT = DEFAULT_HEADER_ROW_HEIGHT;
    TITLE_SIZE = 13;
    CELL_FONT_SIZE = 8;
    HEADER_GROUP_FONT_SIZE = 9;
    HEADER_SUBCOL_FONT_SIZE = 6.5;
    HEADER_FLAT_FONT_SIZE = 7;

    // Auto-fit THẬT theo nội dung (giống lib/exportExcel.js:estimateDisplayLength)
    // — TRƯỚC ĐÂY bề rộng cột chia theo trọng số CỐ ĐỊNH (definition.columns[].width)
    // trên khổ trang A4 ngang CỐ ĐỊNH, chữ/số DÀI hơn phần chia bị CẮT kèm "…"
    // (fitText bên dưới) thay vì tự giãn cột — phát hiện qua báo cáo thật có
    // "Thực đạt" nhiều chữ số bị cắt (vd "11,647,64…"). Giờ đo ĐÚNG bề rộng cần
    // thiết của header + TOÀN BỘ dữ liệu từng cột bằng chính font sẽ vẽ (đo
    // trước, vẽ sau) — cột nào cần rộng hơn tự động rộng hơn, không phụ thuộc
    // definition.columns[].width nữa (field này hết tác dụng ở PDF, giữ lại
    // trong DefinitionJson chỉ để không phải sửa mọi báo cáo cũ).
    const CELL_PADDING = 8; // khớp "cw - 6" trong fitText() bên dưới + đệm an toàn
    const MIN_COL_WIDTH_PT = 26;
    const requiredWidths = columns.map((col, i) => measureCellWidthAtSize(col, i, CELL_FONT_SIZE, CELL_PADDING, MIN_COL_WIDTH_PT));
    const totalRequiredWidth = requiredWidths.reduce((a, b) => a + b, 0);

    // Nhiều cột (báo cáo có columnGroups, HOẶC báo cáo phẳng nhưng khai nhiều
    // cột tuỳ chọn — vd 'coreZeroStock' đủ domain tuỳ chọn ra tới 14 cột) thì
    // dùng trang NGANG cho đủ chỗ — báo cáo ít cột giữ trang dọc như trước.
    const BASE_PAGE_SIZE = (hasGroups || columns.length > 6) ? [841.89, 595.28] : [595.28, 841.89];
    const baseUsableWidth = BASE_PAGE_SIZE[0] - MARGIN * 2;

    // Nội dung vừa khổ trang mặc định -> GIÃN ĐỀU cho lấp đầy trang (giữ đúng
    // hình thức cũ, không để khoảng trắng thừa bên phải). Nội dung RỘNG HƠN
    // khổ mặc định -> GIỮ NGUYÊN bề rộng cần thiết và MỞ RỘNG khổ trang theo
    // đúng tổng đó, thà trang rộng hơn A4 còn hơn mất/cắt dữ liệu.
    if (totalRequiredWidth <= baseUsableWidth) {
      const scale = baseUsableWidth / totalRequiredWidth;
      colWidths = requiredWidths.map(w => w * scale);
      PAGE_SIZE = BASE_PAGE_SIZE;
    } else {
      colWidths = requiredWidths;
      PAGE_SIZE = [totalRequiredWidth + MARGIN * 2, BASE_PAGE_SIZE[1]];
    }
  }

  const colX = [];
  let x = MARGIN;
  for (const w of colWidths) { colX.push(x); x += w; }

  let page = pdfDoc.addPage(PAGE_SIZE);
  let y = PAGE_SIZE[1] - MARGIN;

  // Cắt bớt (kèm "…") nếu chữ RỘNG HƠN cột — dữ liệu thật (tên chi nhánh/tên
  // hàng dài) không tự xuống dòng như tiêu đề, trước đây vẽ NGUYÊN chữ bất
  // kể độ rộng cột, tràn đè lên cột kế bên khi báo cáo nhiều cột hẹp (phát
  // hiện lúc demo báo cáo "Core stock = 0", 13-14 cột).
  function fitText(str, f, size, maxWidth) {
    if (f.widthOfTextAtSize(str, size) <= maxWidth) return str;
    const ELLIPSIS = '…';
    let lo = 0, hi = str.length;
    while (lo < hi) {
      const mid = Math.ceil((lo + hi) / 2);
      const candidate = str.slice(0, mid) + ELLIPSIS;
      if (f.widthOfTextAtSize(candidate, size) <= maxWidth) lo = mid; else hi = mid - 1;
    }
    return lo > 0 ? str.slice(0, lo) + ELLIPSIS : ELLIPSIS;
  }

  function drawCellText(text, cx, cw, cy, opts = {}) {
    const { bold = false, size = CELL_FONT_SIZE, align = 'left' } = opts;
    const f = bold ? boldFont : font;
    // padding PHẢI khớp đúng totalPad/2 dùng lúc ĐO cột (đo qua CELL_SIDE_PAD
    // ở nhánh compact) — xem chú thích measureCellWidthAtSize() ở trên.
    const padding = compact ? CELL_SIDE_PAD : 3;
    const str = fitText(String(text ?? '').slice(0, 60), f, size, cw - padding * 2);
    const textWidth = f.widthOfTextAtSize(str, size);
    let tx = cx + padding;
    if (align === 'right') tx = cx + cw - textWidth - padding;
    else if (align === 'center') tx = cx + (cw - textWidth) / 2;
    page.drawText(str, { x: tx, y: cy, size, font: f, color: rgb(0.1, 0.1, 0.1) });
  }

  // wrapLines() định nghĩa sớm hơn ở đầu hàm (nhánh compact cần dùng để mô
  // phỏng số dòng thật sự lúc dò cỡ chữ) — dùng lại đúng hàm đó ở đây.

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
    const size = TITLE_SIZE;
    const textWidth = boldFont.widthOfTextAtSize(definition.title, size);
    page.drawText(definition.title, { x: (PAGE_SIZE[0] - textWidth) / 2, y, size, font: boldFont });
    y -= (compact ? size * 1.4 : ROW_HEIGHT * 1.6);
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
        drawWrappedCenteredText(col.label, colX[i], colWidths[i], rowTop, HEADER_ROW_HEIGHT, { bold: true, size: HEADER_FLAT_FONT_SIZE });
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
      drawWrappedCenteredText(g.label, startX, spanW, row1Top, HEADER_ROW_HEIGHT, { bold: true, size: HEADER_GROUP_FONT_SIZE });
      for (let i = start; i <= end; i++) {
        covered.add(i);
        drawGridRect(colX[i], row2Top - HEADER_ROW_HEIGHT, colWidths[i], HEADER_ROW_HEIGHT, argb);
        drawWrappedCenteredText(columns[i].label, colX[i], colWidths[i], row2Top, HEADER_ROW_HEIGHT, { bold: true, size: HEADER_SUBCOL_FONT_SIZE });
      }
    }
    columns.forEach((col, i) => {
      if (covered.has(i)) return;
      drawGridRect(colX[i], row2Top - HEADER_ROW_HEIGHT, colWidths[i], HEADER_ROW_HEIGHT * 2);
      drawWrappedCenteredText(col.label, colX[i], colWidths[i], row1Top, HEADER_ROW_HEIGHT * 2, { bold: true, size: HEADER_FLAT_FONT_SIZE });
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
      drawCellText(text, colX[i], colWidths[i], rowTop - ROW_HEIGHT + (compact ? ROW_HEIGHT * 0.28 : 4), { bold: !!row.__isSubtotal, align, size: CELL_FONT_SIZE });
    });
    y -= ROW_HEIGHT;
  }

  return Buffer.from(await pdfDoc.save());
}

module.exports = { exportPdf };
