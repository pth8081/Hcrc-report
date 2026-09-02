// lib/crypto.js — Mã hoá/giải mã mật khẩu lưu trong api.DataSources, dùng
// AES-256-GCM với khoá RIÊNG của API Server (API_ENCRYPTION_KEY trong .env,
// 32 byte) — KHÔNG dùng chung khoá với Report Server/ETL. Cùng thuật toán
// với rp-server/lib/crypto.js và etl/lib/crypto.js, khác khoá. Không
// liên quan tới lib/hash.js (SHA-256 một chiều cho API key — ở đây cần GIẢI
// MÃ lại được để kết nối CSDL, nên phải mã hoá hai chiều, không phải băm).
const crypto = require('crypto');

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12;

function parseKey(raw, envVarName) {
  const key = Buffer.from(raw, 'base64');
  if (key.length !== 32) {
    throw new Error(`${envVarName} phải là chuỗi base64 mã hoá đúng 32 byte — tạo bằng: node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"`);
  }
  return key;
}

function getKey() {
  const raw = process.env.API_ENCRYPTION_KEY;
  if (!raw) throw new Error('Thiếu API_ENCRYPTION_KEY trong .env');
  return parseKey(raw, 'API_ENCRYPTION_KEY');
}

// API_ENCRYPTION_KEY_PREVIOUS (TUỲ CHỌN) — khoá CŨ, chỉ dùng để GIẢI MÃ dữ
// liệu đã ghi TRƯỚC lần xoay khoá gần nhất, không bao giờ dùng để mã hoá
// mới. Cho phép XOAY KHOÁ (đổi API_ENCRYPTION_KEY sang giá trị mới) mà
// không cần giải mã lại toàn bộ dữ liệu cũ ngay lập tức — quy trình xoay
// khoá THẬT (vận hành viên tự thực hiện, KHÔNG tự động):
//   1. Đặt API_ENCRYPTION_KEY_PREVIOUS = giá trị API_ENCRYPTION_KEY hiện tại
//   2. Đổi API_ENCRYPTION_KEY sang khoá MỚI, khởi động lại server
//   3. (tuỳ chọn) chạy job đọc + ghi lại từng dòng để chuyển hết dữ liệu
//      sang khoá mới, rồi mới bỏ API_ENCRYPTION_KEY_PREVIOUS khỏi .env
function getPreviousKey() {
  const raw = process.env.API_ENCRYPTION_KEY_PREVIOUS;
  if (!raw) return null;
  return parseKey(raw, 'API_ENCRYPTION_KEY_PREVIOUS');
}

function encryptWithKey(plainText, key) {
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
  const ciphertext = Buffer.concat([cipher.update(String(plainText), 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return Buffer.concat([iv, authTag, ciphertext]).toString('base64');
}

// LUÔN mã hoá bằng khoá HIỆN HÀNH (getKey()) — không bao giờ dùng khoá cũ
// để ghi mới.
function encrypt(plainText) {
  return encryptWithKey(plainText, getKey());
}

function decryptWithKey(encoded, key) {
  const buf = Buffer.from(encoded, 'base64');
  const iv = buf.subarray(0, IV_LENGTH);
  const authTag = buf.subarray(IV_LENGTH, IV_LENGTH + 16);
  const ciphertext = buf.subarray(IV_LENGTH + 16);
  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(authTag);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString('utf8');
}

// Thử khoá HIỆN HÀNH trước (đúng cho 100% dữ liệu nếu chưa từng xoay khoá) —
// CHỈ thử khoá CŨ (API_ENCRYPTION_KEY_PREVIOUS, nếu có cấu hình) khi khoá
// hiện hành giải mã lỗi. AES-256-GCM tự phát hiện sai khoá qua authTag
// (decipher.final() ném lỗi ngay, không "giải mã ra rác" âm thầm) nên việc
// thử 2 khoá tuần tự ở đây an toàn, không có rủi ro nhầm lẫn dữ liệu. Dữ
// liệu mã hoá TRƯỚC khi có cơ chế này không cần migrate gì — vẫn giải mã
// đúng bằng đường "khoá hiện hành" như từ trước tới nay.
function decrypt(encoded) {
  try {
    return decryptWithKey(encoded, getKey());
  } catch (err) {
    const previousKey = getPreviousKey();
    if (!previousKey) throw err;
    return decryptWithKey(encoded, previousKey);
  }
}

// getKey xuất thêm CHỈ để server.js gọi 1 LẦN lúc khởi động — xem chú
// thích tương tự trong lib/adminAuth.js.
module.exports = { encrypt, decrypt, getKey };
