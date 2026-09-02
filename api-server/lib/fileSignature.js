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

// guardZipBombSize() — Ước lượng dung lượng SAU GIẢI NÉN của 1 file .xlsx
// (Office Open XML = container ZIP) TỪ HEADER, không giải nén thật, chặn
// "zip bomb" (file nén vài trăm KB nhưng giải nén ra hàng trăm MB/vài GB,
// làm cạn RAM tiến trình Node) TRƯỚC KHI đưa buffer vào workbook.xlsx.load()
// (xem lib/dataSourcesImport.js) — MAX_IMPORT_ROWS ở file đó chỉ chặn ĐƯỢC
// sau khi ExcelJS đã giải nén + parse xong, quá trễ để chặn bom nén.
//
// Đọc trực tiếp End Of Central Directory (EOCD) + Central Directory records
// của định dạng ZIP (không dùng thư viện ngoài — chỉ 2 cấu trúc header cố
// định, xem chú thích offset bên dưới) để lấy uncompressedSize đã GHI SẴN
// trong header mỗi entry, không phải số liệu tự suy luận. Cùng cài đặt với
// etl/lib/fileSignature.js.
const EOCD_SIGNATURE = 0x06054b50;
const CENTRAL_DIR_SIGNATURE = 0x02014b50;
const EOCD_MIN_SIZE = 22;
const MAX_COMMENT_LENGTH = 65535; // trường comment cuối EOCD dài tối đa 65535 byte

// Giá trị "tràn" 32-bit đánh dấu ZIP64 (kích thước/offset THẬT nằm trong
// extra field ZIP64, không phân tích ở đây) — .xlsx thông thường (vài trăm/
// vài nghìn dòng, đúng phạm vi tính năng nhập liệu này) không bao giờ cần
// ZIP64; gặp giá trị này thì TỪ CHỐI luôn thay vì đoán mò dung lượng thật.
const ZIP64_SENTINEL = 0xffffffff;

function findEndOfCentralDirectory(buffer) {
  const scanLength = Math.min(buffer.length, EOCD_MIN_SIZE + MAX_COMMENT_LENGTH);
  const earliestStart = buffer.length - scanLength;
  for (let i = buffer.length - EOCD_MIN_SIZE; i >= earliestStart; i--) {
    if (buffer.readUInt32LE(i) === EOCD_SIGNATURE) return i;
  }
  return -1;
}

// Tổng uncompressedSize cộng dồn của MỌI entry trong Central Directory —
// ném lỗi nếu không phải ZIP hợp lệ hoặc dùng ZIP64 (xem ZIP64_SENTINEL).
function estimateZipUncompressedSize(buffer) {
  const eocdOffset = findEndOfCentralDirectory(buffer);
  if (eocdOffset === -1) throw new Error('Không đọc được cấu trúc ZIP (End Of Central Directory) — file có thể bị hỏng hoặc không phải .xlsx thật');

  const cdEntryCount = buffer.readUInt16LE(eocdOffset + 10); // +10: tổng số entry trong Central Directory
  const cdOffset = buffer.readUInt32LE(eocdOffset + 16); // +16: vị trí bắt đầu Central Directory
  if (cdEntryCount === 0xffff || cdOffset === ZIP64_SENTINEL) {
    throw new Error('File .xlsx dùng định dạng ZIP64, không hỗ trợ kiểm tra dung lượng trước khi giải nén — không nhận file này');
  }

  let total = 0;
  let pos = cdOffset;
  for (let i = 0; i < cdEntryCount; i++) {
    if (pos + 46 > buffer.length || buffer.readUInt32LE(pos) !== CENTRAL_DIR_SIGNATURE) {
      throw new Error('Cấu trúc Central Directory của file ZIP không hợp lệ hoặc bị cắt ngắn');
    }
    const uncompressedSize = buffer.readUInt32LE(pos + 24); // +24: kích thước SAU giải nén của entry này
    if (uncompressedSize === ZIP64_SENTINEL) {
      throw new Error('File .xlsx dùng định dạng ZIP64, không hỗ trợ kiểm tra dung lượng trước khi giải nén — không nhận file này');
    }
    total += uncompressedSize;
    const fileNameLen = buffer.readUInt16LE(pos + 28);
    const extraLen = buffer.readUInt16LE(pos + 30);
    const commentLen = buffer.readUInt16LE(pos + 32);
    pos += 46 + fileNameLen + extraLen + commentLen; // 46 = kích thước cố định phần đầu record
  }
  return total;
}

// Gọi TRƯỚC workbook.xlsx.load(buffer) — ném lỗi (thông điệp tiếng Việt, an
// toàn để trả thẳng cho admin qua res.status(400)) nếu ước lượng dung lượng
// sau giải nén vượt maxBytes.
function guardZipBombSize(buffer, maxBytes) {
  const estimated = estimateZipUncompressedSize(buffer);
  if (estimated > maxBytes) {
    throw new Error(`File giải nén ra ước tính ${(estimated / 1024 / 1024).toFixed(1)}MB, vượt giới hạn ${(maxBytes / 1024 / 1024).toFixed(0)}MB cho phép — nghi ngờ file nén bất thường ("zip bomb"), từ chối xử lý`);
  }
}

module.exports = { hasZipSignature, guardZipBombSize };
