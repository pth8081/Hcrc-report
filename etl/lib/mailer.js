// lib/mailer.js — Gửi email cảnh báo khi một lượt đồng bộ thất bại. Nếu chưa
// cấu hình SMTP_HOST/ALERT_EMAIL_TO trong .env thì chỉ log cảnh báo ra console
// thay vì lỗi — ETL vẫn chạy bình thường, chỉ là chưa có kênh báo lỗi chủ động.
const nodemailer = require('nodemailer');
const { logWarn } = require('./systemLog');

// Cổng 465 (vd Postfix cấu hình submissions/smtps) bắt buộc bật TLS NGAY TỪ
// ĐẦU kết nối — khác cổng 587/25 (STARTTLS, bắt đầu không mã hoá rồi mới
// nâng cấp). Thiếu `secure:true` ở cổng 465 là lỗi phổ biến nhất khiến gửi
// email thất bại (bản 8.63, theo sự cố thật với Postfix của người dùng) —
// giờ TỰ ĐOÁN theo cổng khi SMTP_SECURE chưa khai rõ trong .env, để admin
// chỉ cần đổi đúng SMTP_PORT=465 là chạy được, không phải nhớ khai thêm
// SMTP_SECURE=true. Vẫn tôn trọng SMTP_SECURE nếu có khai rõ ràng (true/false).
function resolveSecure(port) {
  if (process.env.SMTP_SECURE === 'true') return true;
  if (process.env.SMTP_SECURE === 'false') return false;
  return port === 465;
}

function getTransport() {
  if (!process.env.SMTP_HOST) return null;
  const port = parseInt(process.env.SMTP_PORT || '587', 10);
  const secure = resolveSecure(port);
  return nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port,
    secure,
    // requireTLS (bản 8.64 — tương thích Exchange/Office 365, cổng 587):
    // xem giải thích đầy đủ ở rp-server/lib/mailer.js (cùng lý do, khác nơi
    // cấu hình) — bắt buộc STARTTLS trước khi gửi SMTP_USER/SMTP_PASSWORD
    // thật khi KHÔNG dùng TLS ngay từ đầu.
    requireTLS: !secure && !!process.env.SMTP_USER,
    auth: process.env.SMTP_USER ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASSWORD } : undefined
  });
}

// errorMessage — TRUYỀN SẴN chuỗi đã diễn giải (xem
// jobs/runSync.js:describeSyncError), KHÔNG nhận thẳng đối tượng Error:
// err.message có thể RỖNG (vd AggregateError của Node khi TCP chập chờn),
// diễn giải 1 chỗ duy nhất, tránh lặp lại đúng lỗi "email rỗng, không đọc
// được lý do thật" ở một nơi khác.
async function alertSyncFailure(source, errorMessage) {
  const to = process.env.ALERT_EMAIL_TO;
  const transport = getTransport();
  if (!transport || !to) {
    logWarn('⚠️  Chưa cấu hình SMTP_HOST/ALERT_EMAIL_TO trong .env — bỏ qua gửi email cảnh báo lỗi ETL.');
    return;
  }
  await transport.sendMail({
    from: process.env.SMTP_FROM || process.env.SMTP_USER,
    to,
    subject: `[ETL] Đồng bộ "${source.label}" thất bại`,
    text: `Nguồn: ${source.label} (${source.key})\nLỗi: ${errorMessage}\nThời điểm: ${new Date().toISOString()}`
  });
}

// changedTables = [{dataSourceName, schemaName, tableName, changes: [{type,
// column, before?, after?, usedByJobs?}]}] — xem lib/schemaMonitor.js. DÙNG
// LẠI đúng kênh SMTP_HOST/ALERT_EMAIL_TO đã có (bản 8.57, theo yêu cầu
// người dùng "giám sát cấu trúc CSDL, thay đổi là báo ngay") — không thêm
// cấu hình SMTP riêng, cùng 1 nơi admin đã cấu hình cho cảnh báo lỗi đồng
// bộ ở trên.
const CHANGE_TYPE_LABELS = { removed: 'MẤT cột/bảng', added: 'Thêm cột mới', typeChanged: 'ĐỔI KIỂU DỮ LIỆU' };

async function alertSchemaChange(changedTables) {
  const to = process.env.ALERT_EMAIL_TO;
  const transport = getTransport();
  if (!transport || !to) {
    logWarn('⚠️  Chưa cấu hình SMTP_HOST/ALERT_EMAIL_TO trong .env — bỏ qua gửi email cảnh báo đổi cấu trúc CSDL.');
    return;
  }
  const lines = [];
  for (const t of changedTables) {
    lines.push(`\n[${t.dataSourceName}] ${t.schemaName}.${t.tableName}`);
    for (const c of t.changes) {
      const label = CHANGE_TYPE_LABELS[c.type] || c.type;
      let detail = `  - ${label}: ${c.column}`;
      if (c.type === 'typeChanged') detail += ` (${c.before} -> ${c.after})`;
      if (c.type === 'removed' && c.usedByJobs?.length) detail += ` — ĐANG DÙNG bởi job: ${c.usedByJobs.join(', ')}`;
      lines.push(detail);
    }
  }
  await transport.sendMail({
    from: process.env.SMTP_FROM || process.env.SMTP_USER,
    to,
    subject: `[ETL] Phát hiện ${changedTables.length} bảng nguồn thay đổi cấu trúc`,
    text: `Thời điểm: ${new Date().toISOString()}\n${lines.join('\n')}`
  });
}

module.exports = { alertSyncFailure, alertSchemaChange };
