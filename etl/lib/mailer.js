// lib/mailer.js — Gửi email cảnh báo khi một lượt đồng bộ thất bại. Nếu chưa
// cấu hình SMTP_HOST/ALERT_EMAIL_TO trong .env thì chỉ log cảnh báo ra console
// thay vì lỗi — ETL vẫn chạy bình thường, chỉ là chưa có kênh báo lỗi chủ động.
const nodemailer = require('nodemailer');

function getTransport() {
  if (!process.env.SMTP_HOST) return null;
  return nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: parseInt(process.env.SMTP_PORT || '587', 10),
    secure: process.env.SMTP_SECURE === 'true',
    auth: process.env.SMTP_USER ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASSWORD } : undefined
  });
}

async function alertSyncFailure(source, err) {
  const to = process.env.ALERT_EMAIL_TO;
  const transport = getTransport();
  if (!transport || !to) {
    console.warn('⚠️  Chưa cấu hình SMTP_HOST/ALERT_EMAIL_TO trong .env — bỏ qua gửi email cảnh báo lỗi ETL.');
    return;
  }
  await transport.sendMail({
    from: process.env.SMTP_FROM || process.env.SMTP_USER,
    to,
    subject: `[ETL] Đồng bộ "${source.label}" thất bại`,
    text: `Nguồn: ${source.label} (${source.key})\nLỗi: ${err.message}\nThời điểm: ${new Date().toISOString()}`
  });
}

module.exports = { alertSyncFailure };
