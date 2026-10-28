// lib/exportExcel.js — Xuất Excel theo ĐÚNG khuôn báo cáo cũ khi
// definition.columnGroups có khai (tiêu đề gộp 2 dòng theo màu từng nhóm
// cột, vd "Doanh thu"/"Lãi gộp"/"Giao dịch" — xem chú thích DefinitionJson
// ở đầu lib/compositeReportRunner.js); không khai columnGroups thì rơi về
// bảng phẳng 1 dòng header như trước (không đổi hành vi báo cáo cũ).
const ExcelJS = require('exceljs');
const {
  resolveGroupColor, resolveRowFillColor, resolveStandaloneColumnColor, computeZebraFlags, computeSttValues,
  GROUP_COLORS_CORPORATE, SUBTOTAL_COLOR_CORPORATE, GRAND_TOTAL_COLOR_CORPORATE, ZEBRA_COLOR_CORPORATE,
  computeSummaryCards, SUMMARY_CARD_COLORS
} = require('./reportCellFormat');
// Bảng màu "kiểu báo cáo tài chính quốc tế" (theo yêu cầu người dùng) —
// ÁP DỤNG CHO EXCEL (và web, xem rp-user/src/lib/reportGroupColors.js),
// CHƯA áp dụng cho PDF/email (người dùng muốn review PDF riêng trước khi
// chuyển luôn — xem chú thích GROUP_COLORS_CORPORATE ở lib/reportCellFormat.js).

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

// Phông Inter (bản 9.69, theo yêu cầu người dùng — "phông này hơi xấu...
// tham khảo phông chữ báo cáo quốc tế chuyên nghiệp hơn", demo 4 lựa chọn
// qua Artifact, người dùng chọn Inter) — ÁP DỤNG ĐỒNG BỘ với web (xem
// rp-user/src/main.jsx) và PDF (xem exportPdf.js). LƯU Ý khác PDF (nhúng
// font thật vào file): Excel CHỈ ghi TÊN font vào file — máy mở file PHẢI
// có cài Inter thì mới hiện đúng, KHÔNG có thì Excel tự thay bằng font mặc
// định của máy đó (thường Calibri), KHÔNG lỗi/vỡ chữ, chỉ không đổi giao
// diện. `fontName()` gộp `name: FONT_NAME` vào MỌI nơi set `cell.font =`
// (8 nơi, xem các hàm dùng bên dưới) — tránh sót 1 nơi nào đó vẫn dùng
// font mặc định ExcelJS.
const FONT_NAME = 'Inter';
function fontName(opts) { return { name: FONT_NAME, ...opts }; }

// Bản 8.99 (theo yêu cầu người dùng — "chữ cách giữa dòng kẻ trên dưới quá
// sát sẽ khó nhìn... dàn dòng ra thêm nữa... chữ nhỏ hơn một xíu") — TRƯỚC
// ĐÂY dòng dữ liệu KHÔNG khai font/height riêng, rơi về mặc định ExcelJS
// (Calibri 11pt, chiều cao dòng Excel tự co theo cỡ chữ đó ~15pt) — chữ sát
// 2 viền trên/dưới của mỗi ô. Giảm cỡ chữ (11 -> 10) + tăng chiều cao dòng
// (~15pt -> 20pt) để khoảng cách trong 1 ô rộng rãi hơn rõ rệt dù chữ nhỏ
// hơn 1 chút — CHỈ áp dụng báo cáo CÓ columnGroups (4 báo cáo Doanh thu
// cuối ngày, xem 2 nơi dùng bên dưới đều trong nhánh `if (groups.length)`).
const DATA_FONT_SIZE = 10;
const DATA_ROW_HEIGHT = 20;

const MIN_COL_WIDTH = 8;
const MAX_COL_WIDTH = 40;

// Khối "thẻ tổng doanh thu" (bản 10.21) — xem chú thích đầy đủ ở
// rp-server/lib/reportCellFormat.js:computeSummaryCards(). Vẽ 3 Ô merge
// ngang (Tổng/Mart/Minimart...) CHIẾM 3 DÒNG đầu sheet + 1 dòng đệm, TRƯỚC
// cả dòng tiêu đề báo cáo (title) — mọi vị trí dòng CÒN LẠI của sheet (title/
// header 2-3 dòng/dữ liệu) dồn xuống đúng SUMMARY_CARD_ROWS dòng, xem
// `rowOffset` ở addReportSheet() bên dưới. CHỈ gọi khi `groups.length`
// (báo cáo có columnGroups — summaryCards luôn đi kèm columnGroups ở cả 4
// báo cáo hiện dùng, xem scripts/seedLdtdHcrcReports.js) — nhánh báo cáo
// PHẲNG (không columnGroups) KHÔNG hỗ trợ khối này (chưa báo cáo phẳng nào
// cần tới, thêm sau nếu phát sinh nhu cầu).
const SUMMARY_CARD_ROWS = 4; // 3 dòng nội dung (nhãn/số/chỉ tiêu) + 1 dòng đệm
function addSummaryCardsBlock(sheet, definition, rows, colCount) {
  const cards = computeSummaryCards(definition, rows);
  if (!cards) return 0;
  const n = (v) => (v === null || v === undefined ? '—' : Math.round(v).toLocaleString('en-US'));
  const pct = (v) => (v === null || v === undefined ? '—' : `${Math.round(v)}%`);
  const trendText = (lfl) => {
    if (lfl === null || lfl === undefined) return '';
    const delta = Math.round(lfl) - 100;
    return ` · ${delta >= 0 ? '▲' : '▼'} ${Math.abs(delta)}% cùng kỳ`;
  };
  const entries = [
    { card: cards.grand, label: 'TỔNG DOANH THU TOÀN HỆ THỐNG', hero: true },
    ...cards.groups.map(g => ({ card: g, label: `DOANH THU KHỐI ${(g.label || '').replace('Tổng cộng ', '').toUpperCase()}`, hero: false }))
  ];
  // Chia cột cho tối đa 3 thẻ — thẻ Tổng (hero) rộng hơn 1 chút, khớp đúng
  // tỉ lệ 1.15fr/1fr/1fr đã dùng ở web (styles.css:.rsc-grid)/PDF.
  const weights = entries.map((_, i) => (i === 0 ? 1.15 : 1));
  const totalWeight = weights.reduce((a, b) => a + b, 0);
  let cStart = 1;
  const ranges = weights.map(w => {
    const span = Math.max(1, Math.round(colCount * w / totalWeight));
    const start = cStart, end = Math.min(colCount, cStart + span - 1);
    cStart = end + 1;
    return [start, end];
  });
  ranges[ranges.length - 1][1] = colCount; // phần dư do làm tròn dồn vào thẻ cuối, không để hở cột

  entries.forEach((e, i) => {
    const [start, end] = ranges[i];
    const heroFill = fillArgb(SUMMARY_CARD_COLORS.heroBg);
    for (let r = 1; r <= 3; r++) {
      sheet.mergeCells(r, start, r, end);
      const cell = sheet.getCell(r, start);
      if (e.hero) cell.fill = heroFill;
      cell.border = BORDER_ALL;
    }
    const labelCell = sheet.getCell(1, start);
    labelCell.value = e.label;
    labelCell.font = fontName({ bold: true, size: 9, color: { argb: e.hero ? `FF${SUMMARY_CARD_COLORS.heroLabel}` : `FF${SUMMARY_CARD_COLORS.inkSoft}` } });
    labelCell.alignment = { vertical: 'middle' };

    const valueCell = sheet.getCell(2, start);
    valueCell.value = `${n(e.card.thucDat)} đ`;
    valueCell.font = fontName({ bold: true, size: 16, color: { argb: e.hero ? 'FFFFFFFF' : `FF${SUMMARY_CARD_COLORS.navyInk}` } });
    valueCell.alignment = { vertical: 'middle' };

    const metaCell = sheet.getCell(3, start);
    metaCell.value = `Chỉ tiêu: ${n(e.card.chiTieu)} đ · ${pct(e.card.tyLeDat)} chỉ tiêu${trendText(e.card.lfl)}`;
    metaCell.font = fontName({ size: 8.5, color: { argb: e.hero ? `FF${SUMMARY_CARD_COLORS.heroTarget}` : `FF${SUMMARY_CARD_COLORS.inkSoft}` } });
    metaCell.alignment = { vertical: 'middle' };
  });
  sheet.getRow(1).height = 16;
  sheet.getRow(2).height = 26;
  sheet.getRow(3).height = 15;
  return SUMMARY_CARD_ROWS;
}

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
  // definition.columnSuperGroups (TUỲ CHỌN, bản 9.73 — theo yêu cầu người
  // dùng, báo cáo "Doanh thu theo ngành hàng"/"(LDTD)" cần thêm 1 CẤP banner
  // CAO HƠN columnGroups hiện có, vd "Doanh thu" gộp ngang 4 nhóm con "Chỉ
  // tiêu"/"Thực đạt"/.../"% so cùng kỳ", "Lãi gộp" gộp 4 nhóm con còn lại —
  // ĐÚNG cấu trúc 3 cấp tiêu đề của file mẫu Excel gốc người dùng gửi, xem
  // "báo cáo doanh thu-nhập hàng theo ngành hàng.md"). KHÔNG khai (mọi báo
  // cáo columnGroups khác, kể cả 4 báo cáo doanh thu cuối ngày LDTD/HCRC)
  // -> `superGroups.length === 0` -> ĐÚNG hành vi 2 dòng tiêu đề như cũ,
  // KHÔNG đổi gì. = [{label, color, groupLabels: [...g.label khớp đúng
  // columnGroups]}] — nhóm nào trong `groups` KHÔNG được liệt kê trong bất
  // kỳ `groupLabels` nào (vd "Giá trị hàng hỏng hủy", CHỦ Ý không thuộc
  // "Doanh thu" hay "Lãi gộp") thì ô ở dòng banner mới MERGE DỌC xuống luôn
  // dòng nhóm hiện có (cùng cách xử lý cột "không thuộc nhóm nào" đã có sẵn
  // ở vòng columns.forEach bên dưới, áp dụng thêm 1 cấp).
  const superGroups = definition.columnSuperGroups || [];
  let dataStartRow;
  if (groups.length) {
    // rowOffset (bản 10.21) — khối thẻ tổng doanh thu (nếu báo cáo khai
    // definition.summaryCards) CHIẾM SUMMARY_CARD_ROWS dòng NGAY TRÊN tiêu
    // đề — xem addSummaryCardsBlock() ở trên. Báo cáo không khai (mọi báo
    // cáo columnGroups khác) -> rowOffset = 0, title vẫn ở dòng 1 như cũ,
    // KHÔNG đổi hành vi.
    const rowOffset = addSummaryCardsBlock(sheet, definition, rows, colCount);
    const titleRow = 1 + rowOffset;
    sheet.mergeCells(titleRow, 1, titleRow, colCount);
    const titleCell = sheet.getCell(titleRow, 1);
    titleCell.value = definition.title;
    titleCell.font = fontName({ bold: true, size: 14 });
    titleCell.alignment = { horizontal: 'center' };
    sheet.getRow(titleRow).height = 22;

    const r0 = superGroups.length ? titleRow + 1 : null;
    const r1 = superGroups.length ? titleRow + 2 : titleRow + 1;
    const r2 = superGroups.length ? titleRow + 3 : titleRow + 2;
    const colIndexByKey = new Map(columns.map((c, i) => [c.key, i + 1]));
    const covered = new Set();
    // Nhãn g.label nào đã được 1 super-group "nhận" (xem columnSuperGroups ở
    // trên) — TÍNH TRƯỚC vòng vẽ dòng nhóm bên dưới, để biết nhóm đó cần vẽ
    // banner RIÊNG ở r0 (vd "Doanh thu — Chỉ tiêu" đã có "Doanh thu" ở r0) hay
    // PHẢI TỰ KÉO DÀI ô nhãn của chính nó lên luôn r0 (vd "Giá trị hàng hỏng
    // hủy", không thuộc super-group nào) — QUAN TRỌNG: merge 1 LẦN DUY NHẤT
    // từ `top` tới `r1` cho mỗi nhóm thay vì merge riêng r0 rồi merge riêng
    // r1/r2 chồng lên nhau (ExcelJS ném lỗi "Cannot merge already merged
    // cells" nếu 1 ô đã nằm trong 1 vùng merge khác rồi lại bị merge tiếp).
    const superLabelSet = new Set(superGroups.flatMap(sg => sg.groupLabels || []));
    // soloSuperGroupByLabel (bản 9.75, theo yêu cầu người dùng — "merge cho
    // đồng bộ liền mạch... total/bán lẻ/bán buôn merge thành 2 dòng luôn") —
    // super-group CHỈ CÓ ĐÚNG 1 nhóm con (vd "Giá trị hàng hỏng hủy" tự nó 1
    // super-group riêng, xem lib/nganhHangBrgRunner.js) TRƯỚC ĐÂY vẫn vẽ ĐỦ 2
    // Ô riêng (banner r0 ở vòng dưới + nhãn group r1 ở vòng này) — CÙNG 1
    // CHỮ lặp lại 2 lần chồng nhau, nhìn dư thừa/không giống cách "TT"/"Ngành
    // hàng" (không thuộc nhóm nào) đã gộp liền 1 Ô duy nhất từ trước. Giờ
    // XỬ LÝ NHƯ 1 CỘT GỘP DUY NHẤT (top = r0, merge THẲNG r0→r1 1 LẦN, màu/
    // chữ trắng LẤY TỪ super-group — giống hệt banner Doanh thu/Lãi gộp,
    // không phải màu nhạt + chữ đen như group thường) — vòng vẽ r0 riêng bên
    // dưới SẼ BỎ QUA đúng super-group này (đã vẽ xong ở đây, vẽ lại sẽ lỗi
    // "already merged").
    const soloSuperGroupByLabel = new Map();
    for (const sg of superGroups) {
      if ((sg.groupLabels || []).length === 1) soloSuperGroupByLabel.set(sg.groupLabels[0], sg);
    }
    for (const g of groups) {
      const idxs = (g.keys || []).map(k => colIndexByKey.get(k)).filter(Boolean);
      if (!idxs.length) continue;
      const start = Math.min(...idxs), end = Math.max(...idxs);
      const solo = soloSuperGroupByLabel.get(g.label);
      const top = (r0 && (solo || !superLabelSet.has(g.label))) ? r0 : r1;
      // topArgb (banner gộp r0-r1 khi `solo`, màu ĐẬM của chính super-group)
      // KHÁC `leafArgb` (dòng Total/Bán lẻ/Bán buôn ở r2, LUÔN màu NHẠT của
      // CHÍNH group — kể cả khi `solo` — không đổi màu dòng lá, chỉ đổi màu
      // banner gộp phía trên; dùng chung 1 màu đậm cho cả dòng lá sẽ làm chữ
      // "Total/Bán lẻ/Bán buôn" (đen) khó đọc trên nền đỏ đậm).
      const topArgb = resolveGroupColor(solo ? solo.color : g.color, GROUP_COLORS_CORPORATE);
      const leafArgb = resolveGroupColor(g.color, GROUP_COLORS_CORPORATE);
      sheet.mergeCells(top, start, r1, end);
      const topCell = sheet.getCell(top, start);
      topCell.value = solo ? solo.label : g.label;
      // Chữ ĐEN mặc định (giống hành vi cũ khi top===r1) kể cả khi nhóm này
      // phải "trồi" lên r0 vì KHÔNG thuộc super-group nào — nền của nó vẫn
      // là màu NHẠT của chính nhóm. RIÊNG nhóm `solo` (super-group CHỈ có
      // đúng nó) dùng màu/chữ TRẮNG ĐẬM của chính super-group đó — coi như 1
      // banner CẤP 1 thật, chỉ khác là KHÔNG có dòng CẤP 2 riêng bên dưới.
      topCell.font = fontName(solo ? { bold: true, color: { argb: 'FFFFFFFF' } } : { bold: true });
      topCell.alignment = { horizontal: 'center', vertical: 'middle' };
      for (let r = top; r <= r1; r++) {
        for (let c = start; c <= end; c++) sheet.getCell(r, c).fill = fillArgb(topArgb);
      }
      for (let c = start; c <= end; c++) {
        covered.add(c);
        const botC = sheet.getCell(r2, c);
        botC.fill = fillArgb(leafArgb);
        botC.value = columns[c - 1].label;
        botC.font = fontName({ bold: true });
        botC.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
      }
    }
    columns.forEach((col, i) => {
      const c = i + 1;
      if (covered.has(c)) return;
      const top = r0 || r1;
      sheet.mergeCells(top, c, r2, c);
      const cell = sheet.getCell(top, c);
      cell.value = col.label;
      cell.font = fontName({ bold: true });
      cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
      // standaloneColumnColors (bản 8.58) — tô HEADER riêng 1 cột đơn lẻ
      // không thuộc columnGroups nào (vd "Trung bình GD"), KHÔNG thêm dòng
      // tiêu đề nhóm phía trên như columnGroups thật.
      const standaloneColor = resolveStandaloneColumnColor(col, definition.standaloneColumnColors, GROUP_COLORS_CORPORATE);
      if (standaloneColor) cell.fill = fillArgb(standaloneColor);
    });
    // Dòng banner cấp CAO HƠN (r0) — xem chú thích columnSuperGroups ở trên.
    // Vẽ SAU vòng groups ở trên (cần `covered`/màu nhóm đã tô sẵn) — CHỈ ghi
    // đè nhãn/màu TRẮNG-ĐẬM cho đúng dải cột thuộc super-group, KHÔNG merge
    // gì thêm ở đây (vùng r0 của các cột này đã được merge đúng ở vòng
    // `groups`/`columns.forEach` phía trên rồi, vì top===r1 cho các nhóm
    // THUỘC super-group — chỉ cần vẽ ĐÈ 1 ô banner MERGE RIÊNG phía trên
    // từng dải, không đụng tới các ô r1/r2 bên dưới).
    if (r0) {
      for (const sg of superGroups) {
        // Super-group `solo` (CHỈ 1 nhóm con) đã vẽ ĐỦ cả banner lẫn merge ở
        // vòng `groups` phía trên (xem soloSuperGroupByLabel) — vẽ lại ở đây
        // sẽ ĐÈ merge cũ, ExcelJS ném lỗi "Cannot merge already merged cells".
        if ((sg.groupLabels || []).length === 1) continue;
        const idxs = (sg.groupLabels || []).flatMap(gl => {
          const g = groups.find(x => x.label === gl);
          return g ? (g.keys || []).map(k => colIndexByKey.get(k)).filter(Boolean) : [];
        });
        if (!idxs.length) continue;
        const start = Math.min(...idxs), end = Math.max(...idxs);
        const argb = resolveGroupColor(sg.color, GROUP_COLORS_CORPORATE);
        sheet.mergeCells(r0, start, r0, end);
        const cell = sheet.getCell(r0, start);
        cell.value = sg.label;
        cell.font = fontName({ bold: true, color: { argb: 'FFFFFFFF' } });
        cell.alignment = { horizontal: 'center', vertical: 'middle' };
        for (let c = start; c <= end; c++) sheet.getCell(r0, c).fill = fillArgb(argb);
      }
    }
    for (let c = 1; c <= colCount; c++) {
      if (r0) sheet.getCell(r0, c).border = BORDER_ALL;
      sheet.getCell(r1, c).border = BORDER_ALL;
      sheet.getCell(r2, c).border = BORDER_ALL;
    }
    dataStartRow = r2 + 1;
    sheet.views = [{ state: 'frozen', ySplit: dataStartRow - 1 }];
  } else {
    // Bản 9.42 (theo yêu cầu người dùng — "chuyển tất cả báo cáo Mua
    // hàng/Vận hành/Báo cáo tự do/Báo cáo kinh doanh sang màu bản 9.40") —
    // TRƯỚC ĐÂY nhánh phẳng (không columnGroups) không tô màu header nào,
    // chỉ in đậm. Thêm nền xanh navy nhạt (GROUP_COLORS_CORPORATE.green,
    // cùng tông "Doanh thu" ở 4 báo cáo cuối ngày) cho MỌI báo cáo phẳng —
    // áp dụng ĐỒNG LOẠT, không cần cờ bật/tắt riêng từng báo cáo (khác
    // nhánh columnGroups ở trên, nơi 4 báo cáo LDTD/HCRC đã đi qua).
    const flatHeaderFill = fillArgb(resolveGroupColor('green', GROUP_COLORS_CORPORATE));
    sheet.getRow(1).values = columns.map(c => c.label);
    sheet.getRow(1).font = fontName({ bold: true });
    sheet.getRow(1).eachCell({ includeEmpty: true }, (cell) => { cell.fill = flatHeaderFill; });
    dataStartRow = 2;
    sheet.views = [{ state: 'frozen', ySplit: 1 }];
  }

  const sttValues = computeSttValues(rows);
  const sttColIdx = columns.findIndex(c => c.key === 'stt');
  const zebraFlags = groups.length ? computeZebraFlags(rows) : rows.map(() => false);

  rows.forEach((row, rIdx) => {
    const excelRow = sheet.getRow(dataStartRow + rIdx);
    // __isSectionHeader (bản 9.68, xem rp-server/lib/nganhHangBrgRunner.js)
    // — dòng tiêu đề ngang MERGE hết cột (vd "Toàn hệ thống BRG"/"LFL"/
    // "NSO"), KHÔNG phải dòng dữ liệu — ghi 1 Ô duy nhất rồi BỎ QUA toàn bộ
    // logic tô màu/numFmt theo cột bên dưới (opt-in qua cờ này, không đổi
    // báo cáo khác).
    if (row.__isSectionHeader) {
      sheet.mergeCells(dataStartRow + rIdx, 1, dataStartRow + rIdx, colCount);
      const cell = sheet.getCell(dataStartRow + rIdx, 1);
      cell.value = row.__sectionLabel;
      cell.font = fontName({ bold: true, color: { argb: 'FFFFFFFF' }, size: groups.length ? DATA_FONT_SIZE + 1 : undefined });
      cell.fill = fillArgb(row.__sectionColor || '2B2F38');
      cell.alignment = { horizontal: 'left', vertical: 'middle' };
      if (groups.length) excelRow.height = DATA_ROW_HEIGHT;
      return;
    }
    // SỬA bản 8.99 (theo yêu cầu người dùng — "chữ cách giữa dòng kẻ trên
    // dưới quá sát sẽ khó nhìn... dàn dòng ra thêm nữa... chữ nhỏ hơn một
    // xíu") — TRƯỚC ĐÂY không khai `height` cho dòng dữ liệu (Excel tự co
    // theo cỡ chữ mặc định 11pt Calibri, ra ~15pt, sát 2 viền trên/dưới).
    // Tăng chiều cao dòng lên DATA_ROW_HEIGHT, cỡ chữ giảm xuống
    // DATA_FONT_SIZE — CHỈ áp dụng báo cáo CÓ columnGroups (4 báo cáo
    // Doanh thu cuối ngày), không đổi báo cáo phẳng khác.
    if (groups.length) excelRow.height = DATA_ROW_HEIGHT;
    columns.forEach((col, cIdx) => {
      const cell = excelRow.getCell(cIdx + 1);
      const raw = cIdx === sttColIdx ? sttValues[rIdx] : row[col.key];
      cell.value = sanitizeFormulaValue(raw);
      // Phông nền Inter (bản 9.69) — đặt TRƯỚC mọi nhánh bên dưới, để báo
      // cáo PHẲNG (không columnGroups, trước đây KHÔNG set font cho dòng
      // dữ liệu thường -> rơi về Calibri mặc định ExcelJS) cũng có Inter;
      // các nhánh group/fillColor bên dưới GHI ĐÈ thêm bold/size, vẫn giữ
      // `name` qua fontName().
      cell.font = fontName({});
      colMaxLen[cIdx] = Math.max(colMaxLen[cIdx], estimateDisplayLength(raw, col));
      if (typeof cell.value === 'number') {
        // "[$-409]" ép định dạng số theo locale en-US (dấu phẩy phân cách
        // nghìn) — KHÔNG phụ thuộc locale Windows/Excel của máy người mở
        // file, khớp đúng định dạng số trong file mẫu báo cáo cũ (dấu phẩy,
        // không phải dấu chấm kiểu vi-VN).
        cell.numFmt = col.format === 'percent' ? '[$-409]0"%"' : '[$-409]#,##0';
        cell.alignment = { horizontal: 'right' };
      }
      // Bản 9.44 (theo yêu cầu người dùng — "thêm cột STT và căn giữa") —
      // cột STT là SỐ nên bị nhánh numFmt ở trên canh PHẢI như mọi cột số
      // khác (giống lỗi đã sửa cho PDF ở bản 8.99, xem exportPdf.js) — đè
      // riêng cột STT sang canh GIỮA, khớp đúng PDF.
      if (cIdx === sttColIdx) {
        cell.alignment = { ...(cell.alignment || {}), horizontal: 'center' };
      }
      // SỬA bản 8.99 (theo yêu cầu người dùng — "phải dãn cả trên và dưới,
      // chữ nằm ở giữa hai dòng kẻ") — TRƯỚC ĐÂY chỉ set alignment cho Ô SỐ
      // (horizontal:'right' ở trên) và KHÔNG set vertical bao giờ — Excel mặc
      // định canh chữ SÁT ĐÁY ô theo chiều dọc (vertical: 'bottom'), nên dù
      // đã tăng DATA_ROW_HEIGHT, chữ vẫn dồn xuống sát viền dưới, khoảng
      // trống chỉ lộ ra ở phía TRÊN — không phải "dãn đều 2 bên" như yêu
      // cầu. Set vertical:'middle' cho MỌI Ô (đè SAU đoạn numFmt ở trên để
      // giữ đúng horizontal:'right' của Ô số, chỉ bổ sung vertical).
      if (groups.length) {
        cell.alignment = { ...(cell.alignment || {}), vertical: 'middle' };
        cell.border = BORDER_ALL;
        cell.font = fontName({ size: DATA_FONT_SIZE });
      }
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
      const fillColor = resolveRowFillColor(row, col, groups, GROUP_COLORS_CORPORATE, SUBTOTAL_COLOR_CORPORATE, GRAND_TOTAL_COLOR_CORPORATE);
      if (fillColor) {
        cell.fill = fillArgb(fillColor);
        cell.font = groups.length ? fontName({ size: DATA_FONT_SIZE, bold: true }) : fontName({ bold: true });
      } else if (zebraFlags[rIdx]) {
        cell.fill = fillArgb(ZEBRA_COLOR_CORPORATE);
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
