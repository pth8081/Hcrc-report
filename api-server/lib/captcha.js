// lib/captcha.js — Mã xác nhận (captcha) dạng ảnh, 4 chữ số, chặn trước
// bước đăng nhập (bản 8.39, theo yêu cầu người dùng). Dùng svg-captcha —
// TỰ VẼ ảnh SVG bằng mã (font nhúng sẵn trong gói, không tải font/ảnh
// ngoài, không gọi dịch vụ xác thực nào qua mạng) — chạy được trên server
// nội bộ KHÔNG có Internet, đúng yêu cầu.
//
// Lưu đáp án đúng trong BỘ NHỚ (Map, giống lib/loginRateLimit.js — quy mô
// thật vài trăm lượt đăng nhập/phút là tối đa, không cần CSDL/Redis cho
// dữ liệu sống vài phút này), khoá theo 1 token ngẫu nhiên gửi kèm ảnh.
// DÙNG ĐÚNG 1 LẦN — xoá khỏi bộ nhớ ngay khi verifyCaptcha() được gọi, dù
// kết quả đúng hay sai, để không ai thử lại nhiều lần với CÙNG 1 ảnh đã
// hiện ra (giữ đúng tinh thần chống đoán mò của captcha).
const svgCaptcha = require('svg-captcha');
const crypto = require('crypto');

const CAPTCHA_TTL_MS = 5 * 60 * 1000; // 5 phút — đủ thời gian gõ, không để treo vô hạn trong bộ nhớ
const pending = new Map(); // token -> { text, expiresAt }

// Dọn định kỳ — captcha bỏ dở (tải ảnh nhưng không đăng nhập) không bao
// giờ bị verifyCaptcha() xoá, nếu không dọn sẽ tích luỹ vô hạn theo thời
// gian chạy của tiến trình.
setInterval(() => {
  const now = Date.now();
  for (const [token, entry] of pending) {
    if (entry.expiresAt < now) pending.delete(token);
  }
}, 60 * 1000).unref();

function createCaptcha() {
  const captcha = svgCaptcha.create({
    size: 4,
    noise: 3,
    color: true,
    background: '#f4f6f7',
    width: 150,
    height: 52,
    charPreset: '0123456789'
  });
  const token = crypto.randomBytes(16).toString('hex');
  pending.set(token, { text: captcha.text, expiresAt: Date.now() + CAPTCHA_TTL_MS });
  return { token, svg: captcha.data };
}

function verifyCaptcha(token, answer) {
  if (!token || !answer) return false;
  const entry = pending.get(token);
  pending.delete(token); // dùng 1 lần — xoá NGAY, trước khi biết kết quả đúng/sai
  if (!entry || entry.expiresAt < Date.now()) return false;
  return entry.text === String(answer).trim();
}

module.exports = { createCaptcha, verifyCaptcha };
