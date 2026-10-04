// routes/admin/tlsCertificate.js — Trang "Chứng chỉ TLS" (bản 8.71, theo
// yêu cầu người dùng) — upload CA/private key/public cert cho CHÍNH tiến
// trình etl (cổng 4003) VÀ etl-admin (serve-static.js, cổng 5175) tự chạy
// HTTPS, KHÔNG cần Nginx đứng trước (dành cho topology "PM2-only" — xem
// deploy/Hướng dẫn triển khai PM2.md). Ghi file trên đĩa (etl/certs/*.pem),
// KHÔNG lưu CSDL — xem lib/tlsServer.js.
//
// Thao tác CỰC KỲ NHẠY CẢM (nắm được private key = giả mạo được chính danh
// tính TLS của hệ thống) — requireSystemRoleActor, mức chặt NHẤT đang có,
// giống /:id/roles, /:id/stores.
const express = require('express');
const multer = require('multer');
const { requireAdminAuth } = require('../../lib/adminAuth');
const { requireSystemRoleActor } = require('../../lib/adminPermissions');
const { readCertInfo, saveCertificateFiles, assertKeyMatchesCert, applyCertificateLive, isRunningHttps } = require('../../lib/tlsServer');
const { logAction } = require('../../lib/auditLog');

const router = express.Router();
router.use(requireAdminAuth);

// Giới hạn nhỏ (file PEM thường vài KB, kể cả CA chain dài cũng hiếm khi
// quá vài chục KB) — chặn sớm upload nhầm file lớn/không liên quan.
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 256 * 1024 } });

router.get('/', requireSystemRoleActor, (req, res) => {
  res.json({ isRunningHttps: isRunningHttps(), cert: readCertInfo() });
});

router.post('/', requireSystemRoleActor,
  upload.fields([{ name: 'privateKey', maxCount: 1 }, { name: 'certificate', maxCount: 1 }, { name: 'caCertificate', maxCount: 1 }]),
  async (req, res, next) => {
    try {
      const keyFile = req.files?.privateKey?.[0];
      const certFile = req.files?.certificate?.[0];
      const caFile = req.files?.caCertificate?.[0];
      if (!keyFile || !certFile) return res.status(400).json({ error: 'Thiếu file private key hoặc public cert (CA tuỳ chọn)' });

      const keyPem = keyFile.buffer.toString('utf8');
      const certPem = certFile.buffer.toString('utf8');
      const caPem = caFile ? caFile.buffer.toString('utf8') : null;

      const wasHttpsBefore = isRunningHttps();
      try {
        // Kiểm tra key KHỚP ĐÚNG cert TRƯỚC khi ghi file — ném lỗi rõ ràng
        // ngay ("key values mismatch") thay vì ghi file sai rồi hỏng TLS
        // lúc có người kết nối thật (triệu chứng mơ hồ hơn nhiều).
        assertKeyMatchesCert(keyPem, certPem, caPem);
      } catch (err) {
        return res.status(400).json({ error: `Private key/public cert không khớp nhau hoặc sai định dạng PEM: ${err.message}` });
      }

      saveCertificateFiles({ keyPem, certPem, caPem });
      const appliedLive = applyCertificateLive();

      await logAction(req, {
        module: 'Chứng chỉ TLS', actionType: 'UPLOAD_TLS_CERT', targetObject: 'etl',
        description: `Upload chứng chỉ TLS mới cho ETL Server${caFile ? ' (kèm CA/chain)' : ''}`
      });

      res.json({
        ok: true,
        cert: readCertInfo(),
        appliedLive,
        // Lần upload ĐẦU TIÊN (trước đó đang chạy HTTP) không thể tự
        // chuyển sang HTTPS mà không restart tiến trình (giới hạn của
        // Node) — báo rõ lệnh cần chạy, không âm thầm coi như xong.
        restartRequired: !wasHttpsBefore,
        restartCommand: 'pm2 restart hcrc-etl'
      });
    } catch (err) { next(err); }
  }
);

module.exports = router;
