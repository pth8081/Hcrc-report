// lib/mailer.js — Gửi email dùng CHUNG cấu hình SMTP (app.EmailSettings,
// Id=1, xem routes/emailSettings.js). Tách riêng vì có 2 nơi cần gửi thật:
// nút "Gửi thử" (routes/emailSettings.js) và lịch gửi báo cáo tự động
// (jobs/reportEmailScheduler.js) — trước đây chỉ "Gửi thử" tự dựng transport
// tại chỗ, giờ dùng chung để không lặp lại cùng logic.
const nodemailer = require('nodemailer');
const { getPool } = require('../db');
const { decrypt } = require('./crypto');

async function loadSettings() {
  const pool = await getPool('RP');
  const result = await pool.request().query(`
    SELECT SmtpHost, SmtpPort, Secure, Username, PasswordEncrypted, FromAddress, FromName
    FROM app.EmailSettings WHERE Id = 1
  `);
  return result.recordset[0] || null;
}

// { to, subject, text, html?, attachments? } — attachments theo đúng hình
// dạng nodemailer ([{filename, content: Buffer}]), dùng thẳng Buffer trả về
// từ lib/exportExcel.js/lib/exportPdf.js, không cần chuyển đổi gì thêm. html
// (lib/emailBodyRenderer.js) dùng khi gửi báo cáo NGAY TRONG BODY EMAIL thay
// vì file đính kèm — có html thì nodemailer ưu tiên hiển thị html, text vẫn
// gửi kèm làm bản dự phòng (client không hiển thị được HTML).
async function sendMail({ to, subject, text, html, attachments }) {
  const row = await loadSettings();
  if (!row) throw new Error('Chưa cấu hình email — vào "Thiết lập email" trước');

  const transport = nodemailer.createTransport({
    host: row.SmtpHost,
    port: row.SmtpPort,
    secure: !!row.Secure,
    auth: row.Username ? { user: row.Username, pass: row.PasswordEncrypted ? decrypt(row.PasswordEncrypted) : undefined } : undefined
  });

  await transport.sendMail({
    from: row.FromName ? `${row.FromName} <${row.FromAddress}>` : row.FromAddress,
    to,
    subject,
    text,
    html,
    attachments
  });
}

module.exports = { sendMail };
