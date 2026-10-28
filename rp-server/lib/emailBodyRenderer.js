// lib/emailBodyRenderer.js — Xuất HTML BẢNG NGAY TRONG NỘI DUNG EMAIL (khác
// exportExcel.js/exportPdf.js — 2 file đó xuất FILE ĐÍNH KÈM tải về, còn ở
// đây HTML chèn thẳng vào phần body email, người nhận mở email là thấy bảng
// luôn không cần tải file — dùng khi app.ReportEmailSchedules.DeliveryMode =
// 'body', xem jobs/reportEmailScheduler.js). Phù hợp báo cáo cần đọc nhanh
// dạng bảng có tô màu cảnh báo (vd "Báo Cáo Nhanh Doanh Thu" so sánh số liệu
// siêu thị/trung tâm, tô đỏ ô "Chênh lệch" khi vượt ngưỡng).
//
// SỬA bản 8.96 (theo yêu cầu người dùng: "màu sắc giống hệt báo cáo xuất file
// pdf và excel") — TRƯỚC ĐÂY file này dựng màu RIÊNG (bảng xám-trắng đơn
// giản, #ccc/#f2f2f2), hoàn toàn KHÔNG dùng bộ màu nhóm cột (xanh lá/cam đất/
// vàng gold/tím, bản 8.58) mà exportExcel.js/exportPdf.js đã dùng — báo cáo
// "Doanh thu" (có definition.columnGroups) gửi qua email trông khác hẳn file
// Excel/PDF xuất ra. Giờ DÙNG CHUNG lib/reportCellFormat.js (nguồn sự thật
// duy nhất, đã dùng cho cả Excel+PDF) để đảm bảo 3 nơi xuất khớp màu TUYỆT
// ĐỐI — xem addReportSheet() ở lib/exportExcel.js để đối chiếu logic gốc
// (header 2 dòng + colSpan theo nhóm, tô màu dòng Tổng cộng/Tổng cộng nhóm,
// xen kẽ zebra) đã mirror lại ở đây dưới dạng bảng HTML style inline (email
// client không chạy CSS ngoài/class — PHẢI dùng style inline trên từng thẻ).
//
// bodyColumnKeys (bản 8.96, TUỲ CHỌN) — mảng key cột được CHỌN để đưa vào
// email (lấy từ app.ReportEmailSchedules.BodyColumnKeysJson, xem
// routes/reportEmailSchedules.js) — rỗng/không khai = lấy TOÀN BỘ cột như
// hành vi cũ (tương thích ngược các lịch gửi tạo trước bản 8.96). Lọc GIỮ
// NGUYÊN THỨ TỰ cột gốc trong definition.columns (không theo thứ tự người
// dùng tick) — vì definition.columnGroups xếp các cột CÙNG NHÓM LIỀN KỀ
// nhau theo đúng thứ tự này, giữ nguyên thứ tự gốc đảm bảo cột còn lại của
// 1 nhóm vẫn LIỀN KỀ sau khi lọc bớt (cần thiết để colSpan gộp đúng, xem
// buildColumnGroups() bên dưới).
//
// highlightColumnKey/highlightThreshold lấy từ CHÍNH lịch gửi (không phải từ
// definition báo cáo) — cùng 1 báo cáo có thể có nhiều lịch gửi với ngưỡng
// cảnh báo khác nhau. Tô đỏ khi |giá trị số| > threshold; giá trị không phải
// số hoặc thiếu threshold thì bỏ qua, không lỗi. Mức ưu tiên tô màu 1 ô (cao
// -> thấp): tô đỏ cảnh báo ngưỡng > màu dòng Tổng cộng/nhóm > xen kẽ zebra >
// không tô (nền trắng).
const {
  resolveGroupColor, resolveRowFillColor, resolveStandaloneColumnColor,
  computeZebraFlags, computeSttValues, formatCellText,
  filterColumns, filterGroups,
  GROUP_COLORS_CORPORATE, SUBTOTAL_COLOR_CORPORATE, GRAND_TOTAL_COLOR_CORPORATE, ZEBRA_COLOR_CORPORATE,
  computeSummaryCards, SUMMARY_CARD_COLORS
} = require('./reportCellFormat');
// Bảng màu "kiểu báo cáo tài chính quốc tế" (theo yêu cầu người dùng) —
// ÁP DỤNG CHO EMAIL luôn (cùng bộ màu với Excel/web) — xem chú thích đầy đủ
// ở lib/reportCellFormat.js:GROUP_COLORS_CORPORATE. PDF CHƯA đổi.

// Viền — bản 8.58 dùng viền nhạt cho MỌI báo cáo gửi email dạng bảng.
// Bản 8.98 (theo yêu cầu người dùng — "đóng khung màu đen như bản mẫu")
// ĐỔI viền ĐEN nhưng CHỈ cho báo cáo CÓ columnGroups (xem renderEmailBodyHtml
// bên dưới) — báo cáo khác gửi email dạng bảng GIỮ NGUYÊN viền nhạt cũ.
const BORDER_COLOR_LIGHT = 'D9DEE2';
const BORDER_COLOR_BLACK = '000000';

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function isHighlighted(row, col, highlightColumnKey, highlightThreshold) {
  if (!highlightColumnKey || highlightThreshold === null || highlightThreshold === undefined) return false;
  if (col.key !== highlightColumnKey) return false;
  const raw = row[col.key];
  const num = typeof raw === 'number' ? raw : Number(raw);
  if (!Number.isFinite(num)) return false;
  return Math.abs(num) > Number(highlightThreshold);
}

// filterColumns/filterGroups (bản 8.97) — chuyển sang DÙNG CHUNG
// lib/reportCellFormat.js (trước đây file này tự định nghĩa filterColumns
// RIÊNG, trùng lặp đúng logic lọc cột + tính lại colSpan nhóm giờ cũng cần
// cho tính năng "ẩn/chọn cột báo cáo doanh thu" ở routes/reports.js — gộp
// về 1 nguồn để không lệch nhau khi sửa sau này).

// Mirror ĐÚNG đoạn dựng header 2 dòng ở lib/exportExcel.js:addReportSheet()
// (dòng ~84-134) nhưng trả về mô tả CELL thay vì ghi trực tiếp vào sheet —
// colIndex 0-based (khác Excel 1-based) để khớp mảng `columns` JS thường.
function buildGroupedHeaderRows(columns, groups, standaloneColumnColors) {
  const colIndexByKey = new Map(columns.map((c, i) => [c.key, i]));
  const covered = new Set();
  const topRow = new Array(columns.length).fill(null); // {label, colSpan, color} | null (ô bị colspan che)
  const bottomRow = new Array(columns.length).fill(null); // {label, color} — luôn 1 ô/cột ở dòng dưới khi có group che

  for (const g of groups) {
    const idxs = (g.keys || []).map(k => colIndexByKey.get(k)).filter(i => i !== undefined);
    if (!idxs.length) continue; // cả nhóm bị lọc hết (bodyColumnKeys bỏ hết cột thuộc nhóm này) -> bỏ qua nhóm
    const start = Math.min(...idxs), end = Math.max(...idxs);
    const argb = resolveGroupColor(g.color, GROUP_COLORS_CORPORATE);
    topRow[start] = { label: g.label, colSpan: end - start + 1, color: argb };
    for (let c = start; c <= end; c++) {
      covered.add(c);
      bottomRow[c] = { label: columns[c].label, color: argb };
    }
  }

  // Cột KHÔNG thuộc nhóm nào -> 1 ô duy nhất, gộp DỌC 2 dòng (rowSpan 2),
  // tô màu riêng nếu có khai standaloneColumnColors (bản 8.58).
  const standaloneRowSpan = new Array(columns.length).fill(false);
  columns.forEach((col, i) => {
    if (covered.has(i)) return;
    standaloneRowSpan[i] = true;
    const standaloneColor = resolveStandaloneColumnColor(col, standaloneColumnColors, GROUP_COLORS_CORPORATE);
    topRow[i] = { label: col.label, colSpan: 1, color: standaloneColor, rowSpan: 2 };
  });

  return { topRow, bottomRow, standaloneRowSpan };
}

// Khối "thẻ tổng doanh thu" (bản 10.21) — xem chú thích đầy đủ ở
// lib/reportCellFormat.js:computeSummaryCards(). Dựng bằng <table> (KHÔNG
// dùng flex/grid) — email client (Outlook/Gmail...) hỗ trợ CSS hiện đại rất
// hạn chế, <table> + style inline là cách DUY NHẤT đảm bảo hiển thị đúng ở
// mọi client, cùng nguyên tắc đã áp dụng cho bảng chi tiết bên dưới. Tính
// từ `rows` GỐC (trước khi lọc bodyColumnKeys) — chọn cột hiển thị không
// ảnh hưởng tới số liệu tổng (luôn đọc đúng dòng __isSubtotal/__isGrandTotal).
function renderSummaryCardsHtml(definition, rows) {
  const cards = computeSummaryCards(definition, rows);
  if (!cards) return '';
  const n = (v) => (v === null || v === undefined ? '—' : Math.round(v).toLocaleString('en-US'));
  const pct = (v) => (v === null || v === undefined ? '—' : `${Math.round(v)}%`);
  const trendHtml = (lfl, hero) => {
    if (lfl === null || lfl === undefined) return '';
    const delta = Math.round(lfl) - 100;
    const up = delta >= 0;
    const color = hero ? 'rgba(255,255,255,.9)' : (up ? `#${SUMMARY_CARD_COLORS.up}` : `#${SUMMARY_CARD_COLORS.down}`);
    const bg = hero ? 'rgba(255,255,255,.16)' : (up ? `#${SUMMARY_CARD_COLORS.upBg}` : `#${SUMMARY_CARD_COLORS.downBg}`);
    return `<span style="display:inline-block;margin-left:6px;padding:2px 7px;border-radius:999px;font-size:11px;font-weight:bold;background:${bg};color:${color};">${up ? '▲' : '▼'} ${Math.abs(delta)}% cùng kỳ</span>`;
  };
  const entries = [
    { card: cards.grand, label: 'Tổng doanh thu toàn hệ thống', hero: true },
    ...cards.groups.map(g => ({ card: g, label: `Doanh thu khối ${(g.label || '').replace('Tổng cộng ', '')}`, hero: false }))
  ];
  const cells = entries.map(e => {
    const bg = e.hero ? `background:#${SUMMARY_CARD_COLORS.heroBg};` : `background:#ffffff;border:1px solid #${SUMMARY_CARD_COLORS.lightBorder};`;
    const labelColor = e.hero ? `#${SUMMARY_CARD_COLORS.heroLabel}` : `#${SUMMARY_CARD_COLORS.inkSoft}`;
    const valueColor = e.hero ? '#ffffff' : `#${SUMMARY_CARD_COLORS.navyInk}`;
    const targetColor = e.hero ? `#${SUMMARY_CARD_COLORS.heroTarget}` : `#${SUMMARY_CARD_COLORS.inkSoft}`;
    const targetBold = e.hero ? '#e7ecf2' : '#222222';
    const chipWarnBg = e.hero ? 'rgba(255,255,255,.16)' : `#${SUMMARY_CARD_COLORS.warnBg}`;
    const chipWarnColor = e.hero ? '#f2dfb0' : `#${SUMMARY_CARD_COLORS.warnInk}`;
    return `<td valign="top" style="${bg}border-radius:10px;padding:14px 16px;">
      <div style="font-size:11px;font-weight:bold;letter-spacing:.04em;text-transform:uppercase;color:${labelColor};margin-bottom:6px;">${escapeHtml(e.label)}</div>
      <div style="font-size:20px;font-weight:bold;color:${valueColor};">${n(e.card.thucDat)} <span style="font-size:12px;font-weight:normal;opacity:.75;">đ</span></div>
      <div style="margin-top:6px;">
        ${e.card.tyLeDat !== null ? `<span style="display:inline-block;padding:2px 7px;border-radius:999px;font-size:11px;font-weight:bold;background:${chipWarnBg};color:${chipWarnColor};">${pct(e.card.tyLeDat)} chỉ tiêu</span>` : ''}
        ${trendHtml(e.card.lfl, e.hero)}
      </div>
      ${e.card.chiTieu !== null ? `<div style="margin-top:8px;font-size:11.5px;color:${targetColor};">Chỉ tiêu: <b style="color:${targetBold};">${n(e.card.chiTieu)} đ</b></div>` : ''}
    </td>`;
  }).join('<td style="width:10px;"></td>');
  return `<table style="border-collapse:separate;border-spacing:0;width:100%;margin-bottom:16px;"><tr>${cells}</tr></table>`;
}

// definition = { title, columns: [{key, label, format}], columnGroups?,
// standaloneColumnColors? } — xem lib/reportEngine.js:describeColumns() +
// lib/compositeReportRunner.js (chú thích đầu file, mục "Tiêu đề nhóm cột +
// màu (Excel/PDF)"). options = { highlightColumnKey, highlightThreshold,
// bodyColumnKeys }.
function renderEmailBodyHtml(definition, rows, options = {}) {
  const { highlightColumnKey, highlightThreshold, bodyColumnKeys } = options;
  const columns = filterColumns(definition.columns, bodyColumnKeys);
  const groups = filterGroups(definition.columnGroups, columns);
  const borderColor = (definition.columnGroups || []).length ? BORDER_COLOR_BLACK : BORDER_COLOR_LIGHT;

  const cellBase = `border:1px solid #${borderColor};padding:6px 10px;`;
  const thBase = cellBase + 'font-weight:bold;';

  let theadHtml;
  if (groups.length) {
    const { topRow, bottomRow, standaloneRowSpan } = buildGroupedHeaderRows(columns, groups, definition.standaloneColumnColors);
    const topCells = columns.map((col, i) => {
      const cell = topRow[i];
      if (!cell) return ''; // che bởi colSpan ô trước
      const bg = cell.color ? `background:#${cell.color};` : '';
      const rowSpanAttr = cell.rowSpan ? ' rowspan="2"' : '';
      const colSpanAttr = cell.colSpan > 1 ? ` colspan="${cell.colSpan}"` : '';
      return `<th style="${thBase}${bg}text-align:center;vertical-align:middle;"${rowSpanAttr}${colSpanAttr}>${escapeHtml(cell.label)}</th>`;
    }).join('');
    const bottomCells = columns.map((col, i) => {
      if (standaloneRowSpan[i]) return ''; // đã gộp rowSpan ở dòng trên
      const cell = bottomRow[i];
      const bg = cell?.color ? `background:#${cell.color};` : '';
      return `<th style="${thBase}${bg}text-align:center;vertical-align:middle;">${escapeHtml(cell?.label ?? col.label)}</th>`;
    }).join('');
    theadHtml = `<tr>${topCells}</tr><tr>${bottomCells}</tr>`;
  } else {
    const headerCells = columns.map(col => `<th style="${thBase}background:#F2F2F2;text-align:left;white-space:nowrap;">${escapeHtml(col.label)}</th>`).join('');
    theadHtml = `<tr>${headerCells}</tr>`;
  }

  const sttValues = computeSttValues(rows);
  const sttColIdx = columns.findIndex(c => c.key === 'stt');
  const zebraFlags = groups.length ? computeZebraFlags(rows) : rows.map(() => false);

  const bodyRows = rows.map((row, rIdx) => {
    const cells = columns.map((col, cIdx) => {
      const highlighted = isHighlighted(row, col, highlightColumnKey, highlightThreshold);
      const raw = cIdx === sttColIdx ? sttValues[rIdx] : row[col.key];
      const text = formatCellText(raw, col);
      const align = typeof raw === 'number' ? 'text-align:right;' : '';

      let style = cellBase + align;
      if (highlighted) {
        style += 'color:#C00000;font-weight:bold;background:#FDE8E8;';
      } else {
        const fillColor = resolveRowFillColor(row, col, groups, GROUP_COLORS_CORPORATE, SUBTOTAL_COLOR_CORPORATE, GRAND_TOTAL_COLOR_CORPORATE);
        if (fillColor) style += `background:#${fillColor};font-weight:bold;`;
        else if (zebraFlags[rIdx]) style += `background:#${ZEBRA_COLOR_CORPORATE};`;
      }
      return `<td style="${style}">${escapeHtml(text)}</td>`;
    }).join('');
    return `<tr>${cells}</tr>`;
  }).join('');

  // summaryCardsHtml (bản 10.21) — tính từ `rows` GỐC (tham số của hàm,
  // CHƯA lọc bodyColumnKeys) — xem renderSummaryCardsHtml() ở trên.
  const summaryCardsHtml = renderSummaryCardsHtml(definition, rows);
  return `
    <div style="font-family:Arial,Helvetica,sans-serif;font-size:13px;color:#222;">
      <h3 style="margin:0 0 10px 0;">${escapeHtml(definition.title)}</h3>
      ${summaryCardsHtml}
      <table style="border-collapse:collapse;width:100%;">
        <thead>${theadHtml}</thead>
        <tbody>${bodyRows}</tbody>
      </table>
    </div>
  `;
}

module.exports = { renderEmailBodyHtml };
