// lib/twoFactor.js — Xác thực hai yếu tố (TOTP, RFC 6238) cho tài khoản admin
// api-admin/ — BẮT BUỘC khi Role='admin' (xem routes/admin/twoFactor.js +
// routes/admin/auth.js). Secret mã hoá bằng lib/crypto.js (API_ENCRYPTION_KEY),
// KHÔNG lưu plaintext trong CSDL. Mã khôi phục (10 mã dùng 1 lần) hash bằng
// bcrypt, hiện nguyên văn cho admin đúng 1 LẦN lúc bật 2FA — sau đó không đọc
// lại được, chỉ đối chiếu hash.
//
// Bản sao CÙNG NỘI DUNG cũng có ở rp-server/lib/ và etl/lib/ — cố ý trùng
// lặp, theo đúng nguyên tắc "mỗi server tự chứa đủ code" đã áp dụng xuyên
// suốt dự án (không dùng thư mục shared/).
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const { generateSecret, verify, generateURI } = require('otplib');
const QRCode = require('qrcode');
const { encrypt, decrypt } = require('./crypto');

// Nhãn hiện trong app Authenticator — CỐ Ý khác nhau giữa 3 hệ thống dù cùng
// 1 admin có thể dùng chung 1 điện thoại: mỗi hệ thống tự có secret RIÊNG,
// app sẽ hiện 3 dòng phân biệt rõ ("HCRC ETL — tenadmin", "HCRC API — ...",
// "HCRC Report — ..."), KHÔNG dùng chung 1 secret cho cả 3 (lộ 1 secret sẽ
// mất lớp bảo vệ thứ 2 của CẢ 3 hệ thống cùng lúc).
const ISSUER = 'HCRC API';
const RECOVERY_CODE_COUNT = 10;

// Chặn dùng lại ĐÚNG 1 mã TOTP vừa xác thực thành công (chống replay nếu mã
// bị lộ/xem trộm màn hình) — theo adminUserId, trong bộ nhớ tiến trình (cùng
// giới hạn "chạy nhiều instance cần store dùng chung" như lib/loginRateLimit.js).
const lastUsedTimeStep = new Map(); // adminUserId -> timeStep đã dùng gần nhất

function newSecret() {
  return generateSecret();
}

function otpauthUri(secret, username) {
  return generateURI({ issuer: ISSUER, label: username, secret });
}

async function qrDataUrl(secret, username) {
  return QRCode.toDataURL(otpauthUri(secret, username));
}

// token: chuỗi 6 số người dùng gõ. secretEncrypted: giá trị đã mã hoá lưu
// trong CSDL (admin.AdminUsers.TwoFactorSecretEncrypted). epochTolerance: 1
// -> chấp nhận CẢ bước 30s TRƯỚC/SAU thời điểm máy chủ, bù lệch đồng hồ nhỏ
// giữa điện thoại và máy chủ (thực hành chuẩn cho TOTP — hầu hết ứng dụng
// authenticator/máy chủ đều cho phép dung sai tương tự).
async function verifyTotp(adminUserId, secretEncrypted, token) {
  if (!token || !/^\d{6}$/.test(String(token))) return false;
  const secret = decrypt(secretEncrypted);
  const afterTimeStep = lastUsedTimeStep.get(adminUserId);
  const result = await verify({ secret, token: String(token), afterTimeStep, epochTolerance: 1 });
  if (!result.valid) return false;
  lastUsedTimeStep.set(adminUserId, result.timeStep);
  return true;
}

// 10 mã dạng "AAAAA-BBBBB" (hex viết hoa, có gạch nối cho dễ chép tay).
function generateRecoveryCodes() {
  const codes = [];
  for (let i = 0; i < RECOVERY_CODE_COUNT; i++) {
    const raw = crypto.randomBytes(5).toString('hex').toUpperCase();
    codes.push(`${raw.slice(0, 5)}-${raw.slice(5)}`);
  }
  return codes;
}

async function hashRecoveryCodes(codes) {
  return Promise.all(codes.map(c => bcrypt.hash(c, 10)));
}

// hashRows: [{ id, codeHash }] các mã CHƯA dùng (UsedAt IS NULL) đọc từ CSDL —
// trả về id hàng khớp (để nơi gọi UPDATE UsedAt = SYSUTCDATETIME()), hoặc
// null nếu mã gõ không khớp mã nào.
async function verifyRecoveryCode(code, hashRows) {
  for (const row of hashRows) {
    if (await bcrypt.compare(code, row.codeHash)) return row.id;
  }
  return null;
}

module.exports = {
  ISSUER,
  RECOVERY_CODE_COUNT,
  newSecret,
  encryptSecret: encrypt,
  otpauthUri,
  qrDataUrl,
  verifyTotp,
  generateRecoveryCodes,
  hashRecoveryCodes,
  verifyRecoveryCode
};
