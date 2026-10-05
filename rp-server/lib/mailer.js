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

// Bản 8.88 — "wrong version number" (OpenSSL) là dấu hiệu RẤT ĐẶC TRƯNG:
// client gửi ClientHello TLS tới 1 cổng máy chủ đang nói SMTP THUẦN (không
// TLS) — đúng kịch bản gặp thật: admin tick "Secure" (hoặc dùng cổng 465,
// trước bản 8.88 bị ép secure=true cứng) nhưng Postfix/gateway thật KHÔNG
// bật TLS ngay-từ-đầu ở cổng đó. Thông điệp gốc của OpenSSL quá kỹ thuật
// (nhắc tới file .c/dòng số trong thư viện) để admin tự hiểu phải sửa gì —
// thêm 1 câu diễn giải NGAY SAU thông điệp gốc (giữ nguyên gốc để còn tra
// cứu/báo lỗi khi cần), chỉ đúng hướng sửa: bỏ tick "Secure".
function describeMailError(err) {
  const message = err?.message || String(err);
  if (/wrong version number|wrong_version_number/i.test(message)) {
    return `${message}\n→ Máy chủ SMTP này có vẻ KHÔNG bật TLS ngay từ đầu ở cổng đang dùng (dù đã tick "Secure") — thử BỎ tick "Secure" rồi gửi thử lại.`;
  }
  return message;
}

async function loadSettings() {
  const pool = await getPool('RP');
  const result = await pool.request().query(`
    SELECT Protocol, SmtpHost, SmtpPort, Secure, SmtpInsecureTls, EwsUrl, EwsInsecureTls,
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

  // Cổng 465 (vd Postfix smtps) THƯỜNG bắt buộc TLS NGAY TỪ ĐẦU kết nối —
  // khác 587/25 (STARTTLS). Bản 8.63 từng ÉP secure=true mỗi khi port=465,
  // bất kể checkbox "Secure" đã lưu gì — giả định "không có gateway SMTP
  // thật nào dùng cổng 465 ở chế độ không mã hoá" (bản 8.88, SỬA LẠI sau sự
  // cố thật: giả định đó SAI — Postfix nội bộ của người dùng lắng nghe cổng
  // 465 nhưng KHÔNG bật TLS ở đó, gửi thất bại với lỗi OpenSSL
  // "SSL routines:tls_validate_record_header:wrong version number" — đúng
  // dấu hiệu client gửi ClientHello TLS tới 1 cổng đang nói SMTP thuần, và
  // vì bị ép cứng, admin KHÔNG CÓ CÁCH NÀO bỏ tick "Secure" để thử gửi
  // không mã hoá trên cổng đó — mọi lần bấm "Gửi thử" đều lỗi y hệt). Từ
  // bản này, LUÔN tôn trọng đúng giá trị admin đã lưu — cổng 465 chỉ còn là
  // GỢI Ý tự tick sẵn lúc đổi cổng (xem EmailSettingsPage.jsx), không còn
  // ép buộc lúc GỬI THẬT.
  const secure = !!row.Secure;
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
    // tls.rejectUnauthorized (bản 8.67 — THIẾU SÓT phát hiện qua rà soát
    // người dùng, Postfix nội bộ dùng chứng chỉ TỰ KÝ, không do CA công
    // khai cấp): mặc định Node/nodemailer LUÔN kiểm tra chứng chỉ qua
    // danh sách CA tin cậy công khai — chứng chỉ tự ký bị từ chối thẳng
    // ("self signed certificate"), gửi thất bại dù host/port/mật khẩu
    // đúng hết. row.SmtpInsecureTls=1 (admin tự tick, mặc định TẮT) mới
    // bỏ qua kiểm tra này — same cơ chế đã có cho EWS (EwsInsecureTls).
    tls: { rejectUnauthorized: !row.SmtpInsecureTls },
    auth: row.Username ? { user: row.Username, pass: row.PasswordEncrypted ? decrypt(row.PasswordEncrypted) : undefined } : undefined
  });

  try {
    await transport.sendMail({
      from: row.FromName ? `${row.FromName} <${row.FromAddress}>` : row.FromAddress,
      to,
      subject,
      text,
      html,
      attachments
    });
  } catch (err) {
    err.message = describeMailError(err);
    throw err;
  }
}

module.exports = { sendMail };
