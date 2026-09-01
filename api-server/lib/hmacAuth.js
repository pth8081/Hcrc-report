// lib/hmacAuth.js — Xác thực bằng chữ ký HMAC-SHA256 từng request
// (AuthMethod='hmac' bên api.ApiConsumers) — chuẩn phổ biến ở cổng thanh
// toán/ngân hàng (VNPay/MoMo...), khác API key tĩnh: mỗi request tự chứng
// minh không bị giả mạo/replay bằng chữ ký + mốc thời gian, không cần gửi
// bí mật (secret) qua dây mỗi lần.
//
// 3 header đối tác PHẢI gửi kèm:
//   X-Key-Id     — định danh CÔNG KHAI (không bí mật) để biết dùng secret nào.
//   X-Timestamp  — unix giây lúc ký, phải nằm trong TOLERANCE_SECONDS quanh
//                  giờ máy chủ (chống phát lại — replay).
//   X-Signature  — hex(HMAC-SHA256(secret, chuỗi ký)).
// Chuỗi ký = `${method}\n${path}\n${timestamp}\n${rawBody}` — method viết
// hoa, path gồm cả query string (đúng nguyên trạng đối tác gọi), rawBody là
// CHUỖI THÔ (không phải object đã parse — parse lại có thể đổi thứ tự khoá/
// khoảng trắng, làm sai lệch chữ ký cả 2 phía) — xem server.js (express.json
// verify callback lưu req.rawBody).
const crypto = require('crypto');
const { sql, getPool } = require('../db');

const TOLERANCE_SECONDS = 5 * 60; // 5 phút — đủ rộng cho lệch giờ đồng hồ, đủ hẹp để chặn phát lại

// Chống PHÁT LẠI (replay) — chỉ kiểm tra X-Timestamp nằm trong cửa sổ là
// CHƯA đủ: 1 request bị chặn bắt (proxy trung gian, log rò rỉ...) vẫn gửi
// lại NGUYÊN VẸN được bất kỳ lúc nào trong suốt cửa sổ ±5 phút đó với chữ ký
// vẫn hợp lệ 100%. Nhớ chữ ký ĐÃ DÙNG — CẤP CSDL (admin.HmacUsedSignatures),
// KHÔNG PHẢI Map trong bộ nhớ tiến trình: dưới PM2 cluster mode (nhiều
// worker Node cùng service), request gốc và request phát lại có thể rơi vào
// 2 WORKER KHÁC NHAU (nginx round-robin) — Map riêng từng tiến trình sẽ
// KHÔNG phát hiện được, để lọt phát lại. CSDL là store DÙNG CHUNG giữa mọi
// worker. Dọn định kỳ ở jobs/cleanupHmacSignatures.js (server.js, chỉ
// instance leader) để bảng không phình mãi.
async function recordSignatureIfNew(signature) {
  const pool = await getPool('ADMIN');
  try {
    await pool.request()
      .input('sig', sql.Char(64), signature)
      .input('expiresAt', sql.DateTime2, new Date(Date.now() + TOLERANCE_SECONDS * 1000))
      .query('INSERT INTO admin.HmacUsedSignatures (Signature, ExpiresAt) VALUES (@sig, @expiresAt)');
    return true; // chưa từng thấy, vừa ghi nhận
  } catch (err) {
    if (err.number === 2627 || err.number === 2601) return false; // PK trùng -> ĐÃ thấy (replay thật)
    // Lỗi CSDL khác (mất kết nối tạm thời...) -> FAIL OPEN, cùng triết lý
    // lib/sessionRevocation.js: đây là lớp phòng thủ CHIỀU SÂU trên chữ ký +
    // mốc thời gian ĐÃ xác thực đúng (ranh giới chính, không phụ thuộc CSDL)
    // — CSDL chập chờn vài giây không nên chặn TOÀN BỘ traffic đối tác HMAC.
    console.warn(`⚠️  [hmacAuth] không ghi được chữ ký chống phát lại (CSDL tạm gián đoạn?) — fail-open, coi như chưa phát lại: ${err.message}`);
    return true;
  }
}

function buildSigningString({ method, path, timestamp, body }) {
  return `${method.toUpperCase()}\n${path}\n${timestamp}\n${body || ''}`;
}

function computeSignature(secret, signingString) {
  return crypto.createHmac('sha256', secret).update(signingString, 'utf8').digest('hex');
}

// Trả { ok: true } hoặc { ok: false, reason }. So sánh bằng
// crypto.timingSafeEqual — so sánh chuỗi thường (===) rò rỉ thời gian xử lý
// theo độ dài phần khớp, có thể bị dò ra chữ ký đúng qua nhiều lần thử.
// ASYNC (khác trước) — bước chống phát lại giờ tra CSDL, xem
// recordSignatureIfNew() ở trên.
async function verify({ secret, method, path, timestamp, body, signature }) {
  const tsNum = Number(timestamp);
  if (!Number.isFinite(tsNum)) return { ok: false, reason: 'X-Timestamp không hợp lệ' };
  const skewSeconds = Math.abs(Date.now() / 1000 - tsNum);
  if (skewSeconds > TOLERANCE_SECONDS) return { ok: false, reason: 'X-Timestamp lệch quá xa giờ máy chủ (khả năng bị phát lại)' };

  const expected = computeSignature(secret, buildSigningString({ method, path, timestamp, body }));
  const expectedBuf = Buffer.from(expected, 'hex');
  const actualBuf = Buffer.from(String(signature || ''), 'hex');
  if (expectedBuf.length !== actualBuf.length || !crypto.timingSafeEqual(expectedBuf, actualBuf)) {
    return { ok: false, reason: 'Chữ ký không khớp' };
  }

  // Dùng "expected" (chữ ký MÁY CHỦ TỰ TÍNH, đã xác nhận khớp actualBuf ở
  // trên qua so sánh BYTE, không phải chuỗi gốc đối tác gửi) làm khoá tra
  // CSDL — luôn đúng 64 ký tự hex thường, tránh mọi lệch hoa/thường hay ký
  // tự thừa lạ trong chuỗi gốc làm hỏng INSERT (CHAR(64)).
  const isNew = await recordSignatureIfNew(expected);
  if (!isNew) {
    return { ok: false, reason: 'Request đã được xử lý trước đó (phát lại)' };
  }

  return { ok: true };
}

module.exports = { buildSigningString, computeSignature, verify };
