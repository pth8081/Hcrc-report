// lib/fileSignature.js — Kiểm tra CHỮ KÝ FILE THẬT (magic byte), không tin
// đuôi file (`multer`'s fileFilter chỉ soi được originalname, CHƯA có nội
// dung lúc đó) hay Content-Type do client tự khai. File .xlsx là container
// ZIP (Office Open XML) — đổi đuôi 1 file bất kỳ (vd .html/.exe) thành
// .xlsx vẫn lọt qua fileFilter theo đuôi, nhưng KHÔNG khớp chữ ký ZIP này.
// Chặn ở đây trước khi đưa buffer vào ExcelJS (zip/XML parser, có bề mặt
// tấn công riêng) — không phải để thay thế fileFilter, mà bổ sung lớp kiểm
// tra nội dung thật sau khi multer đã đọc xong file vào bộ nhớ.
const ZIP_SIGNATURES = [
  Buffer.from([0x50, 0x4b, 0x03, 0x04]), // "PK\x03\x04" — zip thường gặp
  Buffer.from([0x50, 0x4b, 0x05, 0x06]), // "PK\x05\x06" — zip rỗng
  Buffer.from([0x50, 0x4b, 0x07, 0x08])  // "PK\x07\x08" — zip spanned/split (hiếm)
];

function hasZipSignature(bytes) {
  if (!bytes || bytes.length < 4) return false;
  const head = bytes.subarray(0, 4);
  return ZIP_SIGNATURES.some(sig => sig.equals(head));
}

module.exports = { hasZipSignature };
