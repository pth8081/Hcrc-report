// lib/mailer.js — Gửi email dùng CHUNG cấu hình (app.EmailSettings, Id=1,
// xem routes/emailSettings.js). Tách riêng vì có 2 nơi cần gửi thật: nút
// "Gửi thử" (routes/emailSettings.js) và lịch gửi báo cáo tự động
// (jobs/reportEmailScheduler.js) — dùng chung để không lặp lại cùng logic.
//
// Protocol='smtp' (mặc định) -> nodemailer như trước. Protocol='ews' (bản
// 8.65, theo yêu cầu người dùng cho Exchange CÀI TẠI CHỖ — "truy cập trực
// tiếp vào mailbox để gửi" thay vì SMTP) -> lib/ewsMailer.js, bỏ qua mọi
// field Smtp*.
const nodemailer = require('nodemailer');
const { getPool } = require('../db');
const { decrypt } = require('./crypto');
const { sendMailEws } = require('./ewsMailer');

async function loadSettings() {
  const pool = await getPool('RP');
  const result = await pool.request().query(`
    SELECT Protocol, SmtpHost, SmtpPort, Secure, EwsUrl, EwsInsecureTls,
           Username, PasswordEncrypted, FromAddress, FromName
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

  if (row.Protocol === 'ews') {
    return sendMailEws(
      { ewsUrl: row.EwsUrl, username: row.Username, password: row.PasswordEncrypted ? decrypt(row.PasswordEncrypted) : undefined, insecureTls: !!row.EwsInsecureTls },
      { fromAddress: row.FromAddress, fromName: row.FromName, to, subject, text, html, attachments }
    );
  }

  // Cổng 465 (vd Postfix smtps) bắt buộc TLS NGAY TỪ ĐẦU kết nối — khác
  // 587/25 (STARTTLS). Lỗi phổ biến nhất khiến "Thiết lập email" cấu hình
  // đúng host/port vẫn gửi thất bại là quên tick "Secure" khi đổi sang cổng
  // 465 (bản 8.63, theo sự cố thật với Postfix của người dùng) — ÉP true
  // khi port là 465 bất kể giá trị đã lưu, không phụ thuộc người dùng nhớ
  // tick đúng checkbox (không có gateway SMTP thật nào dùng cổng 465 ở chế
  // độ không mã hoá).
  const secure = row.SmtpPort === 465 ? true : !!row.Secure;
  const transport = nodemailer.createTransport({
    host: row.SmtpHost,
    port: row.SmtpPort,
    secure,
    // requireTLS (bản 8.64 — tương thích Exchange/Office 365, cổng 587):
    // KHÔNG dùng TLS ngay từ đầu (secure=false) nhưng VẪN có mật khẩu thật
    // (row.Username) -> bắt buộc STARTTLS nâng cấp lên mã hoá TRƯỚC khi gửi
    // mật khẩu, không âm thầm gửi mật khẩu dạng chữ thường nếu gateway lỡ
    // không chào STARTTLS (Exchange/Office 365 LUÔN từ chối AUTH không mã
    // hoá nên không ảnh hưởng gateway đó, chỉ thêm 1 lớp an toàn rõ ràng).
    requireTLS: !secure && !!row.Username,
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
