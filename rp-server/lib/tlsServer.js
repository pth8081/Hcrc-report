// lib/tlsServer.js — Tạo HTTP hay HTTPS server tuỳ theo đã upload chứng
// chỉ TLS qua trang "Chứng chỉ TLS" (bản 8.71, theo yêu cầu người dùng —
// "giao diện upload CA, private key, public key cho PM2") hay chưa.
//
// CHƯA từng upload (mặc định, mọi hệ thống đang chạy hiện nay) = HTTP như
// cũ, KHÔNG đổi hành vi — tính năng hoàn toàn tự chọn (opt-in), dành cho
// topology "PM2-only" (không Nginx, xem deploy/Hướng dẫn triển khai
// PM2.md) muốn có HTTPS mà không cần dựng Nginx riêng. Topology "PM2 +
// Nginx" không cần dùng tính năng này (Nginx đã lo TLS).
//
// Lưu file TRỰC TIẾP trên đĩa (certs/key.pem, certs/cert.pem, certs/ca.pem
// — KHÔNG lưu CSDL) — cùng tinh thần chính Nginx/certbot đã làm từ trước
// giờ (chứng chỉ luôn là file trên đĩa, không phải bản ghi CSDL), đơn giản
// hoá: server khởi động KHÔNG cần chờ kết nối CSDL mới biết chạy HTTP hay
// HTTPS (đọc file đồng bộ, tức thì). routes/admin/tlsCertificate.js vẫn
// ghi 1 dòng vào admin.AuditLog mỗi lần upload (ai, lúc nào) — đủ cho mục
// đích kiểm tra lại sau, không cần lưu lại NỘI DUNG chứng chỉ 2 nơi.
const fs = require('fs');
const path = require('path');
const http = require('http');
const https = require('https');
const tls = require('tls');

const CERT_DIR = path.join(__dirname, '..', 'certs');
const KEY_PATH = path.join(CERT_DIR, 'key.pem');
const CERT_PATH = path.join(CERT_DIR, 'cert.pem');
const CA_PATH = path.join(CERT_DIR, 'ca.pem');

let currentServer = null; // để applyCertificateLive() gọi setSecureContext() khi cần

function readCredentialsIfPresent() {
  if (!fs.existsSync(KEY_PATH) || !fs.existsSync(CERT_PATH)) return null;
  const credentials = { key: fs.readFileSync(KEY_PATH), cert: fs.readFileSync(CERT_PATH) };
  if (fs.existsSync(CA_PATH)) credentials.ca = fs.readFileSync(CA_PATH);
  return credentials;
}

// Gọi THAY cho app.listen(PORT, cb) ở server.js — trả về 1 http.Server HOẶC
// https.Server tuỳ đã có file chứng chỉ hợp lệ hay chưa, PHẢI tự
// .listen(PORT, cb) ở nơi gọi (giữ nguyên các dòng server.requestTimeout/
// keepAliveTimeout/installProcessGuards(...) đang có, không đổi gì ở đó).
function createAppServer(app) {
  const credentials = readCredentialsIfPresent();
  currentServer = credentials ? https.createServer(credentials, app) : http.createServer(app);
  return currentServer;
}

// Gọi SAU khi lưu chứng chỉ MỚI (routes/admin/tlsCertificate.js) — áp dụng
// NGAY cho mọi kết nối TLS MỚI (handshake sau thời điểm gọi) nếu server
// hiện tại ĐÃ LÀ https.Server — Node hỗ trợ "hot-reload" SecureContext mà
// không cần đóng server, không rớt kết nối WebSocket/keep-alive đang có.
// Trả về false nếu server hiện tại vẫn là http.Server (LẦN UPLOAD ĐẦU
// TIÊN, chuyển HTTP -> HTTPS) — Node KHÔNG "nâng cấp" 1 http.Server đang
// chạy thành https.Server, bắt buộc phải `pm2 restart` 1 lần duy nhất.
function applyCertificateLive() {
  const credentials = readCredentialsIfPresent();
  if (!credentials) return false;
  if (currentServer instanceof https.Server) {
    currentServer.setSecureContext(credentials);
    return true;
  }
  return false;
}

function isRunningHttps() {
  return currentServer instanceof https.Server;
}

// Kiểm tra private key có KHỚP ĐÚNG với public cert trước khi ghi file —
// lỗi "key values mismatch" ở đây còn SỚM hơn nhiều so với để lộ ra lúc
// trình duyệt/đối tác không kết nối được (triệu chứng mơ hồ, khó chẩn
// đoán). tls.createSecureContext() tự ném lỗi rõ ràng nếu không khớp hoặc
// định dạng PEM sai, KHÔNG cần tự viết logic so khớp.
function assertKeyMatchesCert(keyPem, certPem, caPem) {
  const options = { key: keyPem, cert: certPem };
  if (caPem) options.ca = caPem;
  tls.createSecureContext(options); // ném lỗi ngay nếu sai — không bọc try/catch ở đây, để nơi gọi tự xử lý
}

// Đọc thông tin hiển thị (KHÔNG bao giờ trả lại nội dung private key) —
// dùng crypto.X509Certificate (Node >= 15.6, có sẵn, không cần gói ngoài).
function readCertInfo() {
  if (!fs.existsSync(CERT_PATH)) return null;
  const { X509Certificate } = require('crypto');
  const cert = new X509Certificate(fs.readFileSync(CERT_PATH));
  return {
    subject: cert.subject,
    issuer: cert.issuer,
    validFrom: cert.validFrom,
    validTo: cert.validTo,
    hasCa: fs.existsSync(CA_PATH)
  };
}

function saveCertificateFiles({ keyPem, certPem, caPem }) {
  fs.mkdirSync(CERT_DIR, { recursive: true, mode: 0o700 });
  fs.writeFileSync(KEY_PATH, keyPem, { mode: 0o600 });
  fs.writeFileSync(CERT_PATH, certPem, { mode: 0o600 });
  if (caPem) fs.writeFileSync(CA_PATH, caPem, { mode: 0o600 });
  else if (fs.existsSync(CA_PATH)) fs.unlinkSync(CA_PATH); // lần nhập mới KHÔNG kèm CA — xoá CA cũ, không để sót file lạc
}

module.exports = {
  createAppServer, applyCertificateLive, isRunningHttps,
  assertKeyMatchesCert, readCertInfo, saveCertificateFiles
};
