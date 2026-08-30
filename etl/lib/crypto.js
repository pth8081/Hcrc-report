// lib/crypto.js — Mã hoá/giải mã mật khẩu lưu trong etl.DataSources, dùng
// AES-256-GCM với khoá RIÊNG của ETL (ETL_ENCRYPTION_KEY trong .env, 32
// byte) — KHÔNG dùng chung khoá với Report Server/API Server, mỗi server tự
// cô lập bí mật của mình. Cùng thuật toán với report-server/lib/crypto.js,
// khác khoá.
const crypto = require('crypto');

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12;

function getKey() {
  const raw = process.env.ETL_ENCRYPTION_KEY;
  if (!raw) throw new Error('Thiếu ETL_ENCRYPTION_KEY trong .env');
  const key = Buffer.from(raw, 'base64');
  if (key.length !== 32) {
    throw new Error('ETL_ENCRYPTION_KEY phải là chuỗi base64 mã hoá đúng 32 byte — tạo bằng: node -e "console.log(require(\'crypto\').randomBytes(32).toString(\'base64\'))"');
  }
  return key;
}

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
