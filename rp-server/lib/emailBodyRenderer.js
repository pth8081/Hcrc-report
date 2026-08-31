// lib/emailBodyRenderer.js — Xuất HTML BẢNG NGAY TRONG NỘI DUNG EMAIL (khác
// exportExcel.js/exportPdf.js — 2 file đó xuất FILE ĐÍNH KÈM tải về, còn ở
// đây HTML chèn thẳng vào phần body email, người nhận mở email là thấy bảng
// luôn không cần tải file — dùng khi app.ReportEmailSchedules.DeliveryMode =
// 'body', xem jobs/reportEmailScheduler.js). Phù hợp báo cáo cần đọc nhanh
// dạng bảng có tô màu cảnh báo (vd "Báo Cáo Nhanh Doanh Thu" so sánh số liệu
// siêu thị/trung tâm, tô đỏ ô "Chênh lệch" khi vượt ngưỡng).
//
// highlightColumnKey/highlightThreshold lấy từ CHÍNH lịch gửi (không phải từ
// definition báo cáo) — cùng 1 báo cáo có thể có nhiều lịch gửi với ngưỡng
// cảnh báo khác nhau. Tô đỏ khi |giá trị số| > threshold; giá trị không phải
// số hoặc thiếu threshold thì bỏ qua, không lỗi.
//
// Email client (Outlook/Gmail...) không chạy CSS ngoài/class — PHẢI dùng
// style inline trên từng thẻ, không dùng <style> tag hay class.

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function formatCell(value) {
  if (value === null || value === undefined) return '';
  if (typeof value === 'number') return value.toLocaleString('vi-VN');
  return String(value);
}

function isHighlighted(row, col, highlightColumnKey, highlightThreshold) {
  if (!highlightColumnKey || highlightThreshold === null || highlightThreshold === undefined) return false;
  if (col.key !== highlightColumnKey) return false;
  const raw = row[col.key];
  const num = typeof raw === 'number' ? raw : Number(raw);
  if (!Number.isFinite(num)) return false;
  return Math.abs(num) > Number(highlightThreshold);
}

// definition = { title, columns: [{key, label}] } — xem
// lib/reportEngine.js:describeColumns(). options = { highlightColumnKey, highlightThreshold }.
function renderEmailBodyHtml(definition, rows, options = {}) {
  const { highlightColumnKey, highlightThreshold } = options;

  const thStyle = 'border:1px solid #ccc;padding:6px 10px;background:#f2f2f2;font-weight:bold;text-align:left;white-space:nowrap;';
  const tdStyle = 'border:1px solid #ccc;padding:6px 10px;';
  const tdBoldStyle = tdStyle + 'font-weight:bold;background:#fafafa;';
  const tdHighlightStyle = tdStyle + 'color:#c00000;font-weight:bold;background:#fde8e8;';

  const headerCells = definition.columns.map(col => `<th style="${thStyle}">${escapeHtml(col.label)}</th>`).join('');

  const bodyRows = rows.map(row => {
    const cells = definition.columns.map(col => {
      const highlighted = isHighlighted(row, col, highlightColumnKey, highlightThreshold);
      const style = highlighted ? tdHighlightStyle : (row.__isSubtotal ? tdBoldStyle : tdStyle);
      return `<td style="${style}">${escapeHtml(formatCell(row[col.key]))}</td>`;
    }).join('');
    return `<tr>${cells}</tr>`;
  }).join('');

  return `
    <div style="font-family:Arial,Helvetica,sans-serif;font-size:13px;color:#222;">
      <h3 style="margin:0 0 10px 0;">${escapeHtml(definition.title)}</h3>
      <table style="border-collapse:collapse;width:100%;">
        <thead><tr>${headerCells}</tr></thead>
        <tbody>${bodyRows}</tbody>
      </table>
    </div>
  `;
}

module.exports = { renderEmailBodyHtml };
