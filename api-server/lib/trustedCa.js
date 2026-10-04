// lib/trustedCa.js — Danh sách "CA tin cậy" (bản 8.72, theo yêu cầu người
// dùng) — khi tiến trình NÀY tự gọi RA NGOÀI (fetch/https) sang 1 hệ thống
// khác dùng HTTPS ký bởi CA NỘI BỘ/tự tạo (không phải CA công khai như
// Let's Encrypt), Node mặc định CHỈ tin các CA công khai đã biết sẵn —
// cuộc gọi sẽ báo lỗi "self signed certificate"/"unable to verify the
// first certificate", CÙNG LOẠI lỗi đã gặp với Postfix tự ký (bản 8.67),
// khác ở chỗ đây là gọi HTTPS (fetch), không phải SMTP.
//
// Xử lý: dùng tls.setDefaultCACertificates() (Node >= ~20, có sẵn —
// KHÔNG cần gói ngoài) để THÊM CA admin upload vào danh sách tin cậy MẶC
// ĐỊNH của CẢ TIẾN TRÌNH — áp dụng NGAY cho MỌI cuộc gọi HTTPS tiếp theo
// (fetch/https/tls), KHÔNG cần restart, và KHÔNG cần sửa code ở nơi gọi
// (lib/internalApiClient.js, lib/hcrcWorkspaceClient.js...) — tự động có
// hiệu lực vì các nơi đó dùng `fetch()`/`https` chuẩn của Node, vốn đọc
// đúng danh sách CA mặc định này. ĐÃ KIỂM CHỨNG bằng test thật (dựng máy
// chủ HTTPS giả với chứng chỉ tự ký, gọi fetch() thất bại TRƯỚC khi gọi
// setDefaultCACertificates(), thành công NGAY SAU, không restart).
//
// KHÔNG dùng rejectUnauthorized:false/NODE_TLS_REJECT_UNAUTHORIZED=0 —
// cả 2 tắt HẲN việc kiểm tra chứng chỉ (mù quáng tin MỌI chứng chỉ, kể cả
// giả mạo), trong khi cách này chỉ THÊM ĐÚNG 1 CA cụ thể admin đã xác
// nhận, giữ nguyên kiểm tra cho mọi CA khác.
//
// Lưu từng CA là 1 file .pem riêng trong certs/trusted-ca/ (tên file =
// slug hoá từ nhãn admin đặt, vd "HCRC Workspace" -> "hcrc-workspace.pem")
// — KHÔNG lưu CSDL, cùng tinh thần lib/tlsServer.js.
const fs = require('fs');
const path = require('path');
const tls = require('tls');
const { X509Certificate } = require('crypto');

const TRUST_DIR = path.join(__dirname, '..', 'certs', 'trusted-ca');

// Chụp lại danh sách CA GỐC của Node CHỈ 1 LẦN, NGAY LÚC module này được
// nạp lần đầu (trước khi gọi setDefaultCACertificates() bất kỳ lần nào
// trong tiến trình) — ĐÃ KIỂM CHỨNG BẰNG TEST THẬT: gọi LẠI
// tls.getCACertificates('default') SAU KHI đã từng setDefaultCACertificates()
// không trả về danh sách gốc pristine nữa (số lượng đổi khác hẳn, có vẻ
// Node đã rút gọn/khử trùng lặp theo lần set gần nhất) — nếu cứ đọc lại
// 'default' mỗi lần applyTrustedCas() thay vì dùng bản đã chụp CỐ ĐỊNH
// này, các lần gọi sau có nguy cơ xây danh sách tin cậy SAI (thiếu CA gốc
// thật) mà không có dấu hiệu lỗi rõ ràng nào.
const BUILT_IN_CAS = tls.getCACertificates('default');

function slugify(label) {
  return String(label).trim().toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '') // bỏ dấu tiếng Việt
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')
    .slice(0, 80);
}

function listFiles() {
  if (!fs.existsSync(TRUST_DIR)) return [];
  return fs.readdirSync(TRUST_DIR).filter(f => f.endsWith('.pem'));
}

// Gọi lại MỖI LẦN thêm/xoá 1 CA — nạp lại TOÀN BỘ (danh sách mặc định của
// Node ghép với mọi CA admin đã upload) rồi set MỘT LẦN, không cộng dồn
// (tls.setDefaultCACertificates() THAY THẾ toàn bộ danh sách hiện có mỗi
// lần gọi, không phải "thêm vào") — đọc lại tls.getCACertificates('default')
// (danh sách gốc Mozilla đi kèm Node, KHÔNG phải danh sách đã bị ghi đè
// lần trước) để tránh nhân đôi/mất CA gốc qua nhiều lần gọi.
function applyTrustedCas() {
  const uploaded = listFiles().map(f => fs.readFileSync(path.join(TRUST_DIR, f), 'utf8'));
  tls.setDefaultCACertificates([...BUILT_IN_CAS, ...uploaded]);
}

function readCertInfo(pem) {
  const cert = new X509Certificate(pem);
  return { subject: cert.subject, issuer: cert.issuer, validFrom: cert.validFrom, validTo: cert.validTo };
}

function listTrustedCas() {
  return listFiles().map(f => {
    const id = f.replace(/\.pem$/, '');
    const pem = fs.readFileSync(path.join(TRUST_DIR, f), 'utf8');
    let info;
    try { info = readCertInfo(pem); } catch { info = null; } // file hỏng/không parse được — vẫn liệt kê để admin xoá được
    return { id, label: id, ...info };
  });
}

// Ném lỗi (thông điệp tiếng Việt, an toàn trả thẳng cho admin) nếu label
// rỗng hoặc nội dung không phải chứng chỉ X.509 hợp lệ — chặn SỚM trước
// khi ghi file/áp dụng, tránh làm hỏng danh sách CA tin cậy đang chạy tốt
// bằng 1 file rác.
function addTrustedCa(label, pem) {
  const id = slugify(label);
  if (!id) { const err = new Error('Thiếu nhãn (tên gợi nhớ) cho CA này'); err.status = 400; throw err; }
  try {
    readCertInfo(pem); // ném lỗi nếu không phải PEM chứng chỉ hợp lệ
  } catch (err) {
    const wrapped = new Error(`Không đọc được chứng chỉ CA (không đúng định dạng PEM): ${err.message}`);
    wrapped.status = 400;
    throw wrapped;
  }
  fs.mkdirSync(TRUST_DIR, { recursive: true, mode: 0o700 });
  fs.writeFileSync(path.join(TRUST_DIR, `${id}.pem`), pem, { mode: 0o600 });
  applyTrustedCas();
  return id;
}

function removeTrustedCa(id) {
  const safeId = slugify(id); // chặn path traversal qua :id trên URL
  const filePath = path.join(TRUST_DIR, `${safeId}.pem`);
  if (!fs.existsSync(filePath)) { const err = new Error('Không tìm thấy CA này'); err.status = 404; throw err; }
  fs.unlinkSync(filePath);
  applyTrustedCas();
}

// Áp dụng NGAY lúc module được require() lần đầu (server.js khởi động) —
// khôi phục đúng danh sách đã lưu từ trước nếu tiến trình bị restart
// thật (vd pm2 restart/deploy mới), không chỉ lúc admin vừa bấm lưu.
applyTrustedCas();

module.exports = { listTrustedCas, addTrustedCa, removeTrustedCa };
