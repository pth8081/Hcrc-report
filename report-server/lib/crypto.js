// lib/crypto.js — Mã hoá/giải mã mật khẩu lưu trong CSDL (app.ReportDataSources,
// app.EmailSettings), dùng AES-256-GCM với MỘT khoá bí mật duy nhất
// (APP_ENCRYPTION_KEY trong .env, 32 byte). Nhờ vậy số lượng kết nối/nguồn
// lưu trong CSDL tăng lên bao nhiêu cũng chỉ cần bảo vệ đúng 1 khoá ở tầng
// file — xem tài liệu kiến trúc, mục 05.
const crypto = require('crypto');

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12; // khuyến nghị cho GCM

function getKey() {
  const raw = process.env.APP_ENCRYPTION_KEY;
  if (!raw) throw new Error('Thiếu APP_ENCRYPTION_KEY trong .env');
  const key = Buffer.from(raw, 'base64');
  if (key.length !== 32) {
    throw new Error('APP_ENCRYPTION_KEY phải là chuỗi base64 mã hoá đúng 32 byte — tạo bằng: node -e "console.log(require(\'crypto\').randomBytes(32).toString(\'base64\'))"');
  }
  return key;
}

// Kết quả: base64(iv[12] + authTag[16] + ciphertext) — một chuỗi duy nhất,
// lưu thẳng vào cột NVARCHAR trong CSDL.
function encrypt(plainText) {
  const key = getKey();
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
  const ciphertext = Buffer.concat([cipher.update(String(plainText), 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return Buffer.concat([iv, authTag, ciphertext]).toString('base64');
}

function decrypt(encoded) {
  const key = getKey();
  const buf = Buffer.from(encoded, 'base64');
  const iv = buf.subarray(0, IV_LENGTH);
  const authTag = buf.subarray(IV_LENGTH, IV_LENGTH + 16);
  const ciphertext = buf.subarray(IV_LENGTH + 16);
  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(authTag);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString('utf8');
}

module.exports = { encrypt, decrypt };
