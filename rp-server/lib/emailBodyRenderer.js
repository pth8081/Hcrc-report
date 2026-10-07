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
  ZEBRA_COLOR, computeZebraFlags, computeSttValues, formatCellText,
  filterColumns, filterGroups
} = require('./reportCellFormat');

const BORDER_COLOR = 'D9DEE2'; // trùng --line (rp-user/src/styles.css) + viền Excel/PDF (bản 8.58).

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
    const argb = resolveGroupColor(g.color);
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
    const standaloneColor = resolveStandaloneColumnColor(col, standaloneColumnColors);
    topRow[i] = { label: col.label, colSpan: 1, color: standaloneColor, rowSpan: 2 };
  });

  return { topRow, bottomRow, standaloneRowSpan };
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

  const cellBase = `border:1px solid #${BORDER_COLOR};padding:6px 10px;`;
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
        const fillColor = resolveRowFillColor(row, col, groups);
        if (fillColor) style += `background:#${fillColor};font-weight:bold;`;
        else if (zebraFlags[rIdx]) style += `background:#${ZEBRA_COLOR};`;
      }
      return `<td style="${style}">${escapeHtml(text)}</td>`;
    }).join('');
    return `<tr>${cells}</tr>`;
  }).join('');

  return `
    <div style="font-family:Arial,Helvetica,sans-serif;font-size:13px;color:#222;">
      <h3 style="margin:0 0 10px 0;">${escapeHtml(definition.title)}</h3>
      <table style="border-collapse:collapse;width:100%;">
        <thead>${theadHtml}</thead>
        <tbody>${bodyRows}</tbody>
      </table>
    </div>
  `;
}

module.exports = { renderEmailBodyHtml };
