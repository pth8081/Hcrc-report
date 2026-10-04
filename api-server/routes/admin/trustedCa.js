// routes/admin/trustedCa.js — "CA tin cậy" (bản 8.72, theo yêu cầu người
// dùng) — cùng trang "Chứng chỉ TLS" bên api-admin, phần RIÊNG cho chiều
// NGƯỢC LẠI: api-server tự GỌI RA sang hệ thống khác dùng HTTPS ký bởi CA
// nội bộ/tự tạo thì thêm đúng CA đó vào đây để Node tin tưởng — xem chú
// thích đầy đủ ở lib/trustedCa.js. Khác hẳn trang "Chứng chỉ TLS" (upload
// cert cho CHÍNH api-server tự trình diện khi NGƯỜI KHÁC gọi VÀO).
//
// Vẫn là thao tác NHẠY CẢM (quyết định tiến trình này sẽ tin tưởng ai khi
// gọi ra ngoài) — requireSystemRoleActor.
const express = require('express');
const { requireAdminAuth } = require('../../lib/adminAuth');
const { requireSystemRoleActor } = require('../../lib/adminPermissions');
const { listTrustedCas, addTrustedCa, removeTrustedCa } = require('../../lib/trustedCa');
const { logAction } = require('../../lib/auditLog');

const router = express.Router();
router.use(requireAdminAuth, requireSystemRoleActor);

router.get('/', (req, res) => {
  res.json(listTrustedCas());
});

router.post('/', async (req, res, next) => {
  try {
    const { label, pem } = req.body || {};
    if (!label || !pem) return res.status(400).json({ error: 'Thiếu nhãn (label) hoặc nội dung chứng chỉ CA (pem)' });
    let id;
    try {
      id = addTrustedCa(label, pem);
    } catch (err) {
      if (err.status === 400) return res.status(400).json({ error: err.message });
      throw err;
    }
    await logAction(req, { module: 'CA tin cậy', actionType: 'THEM_CA_TIN_CAY', targetObject: id, description: `Thêm CA tin cậy "${label}" cho các cuộc gọi HTTPS ra ngoài của API Server` });
    res.json({ ok: true, id });
  } catch (err) { next(err); }
});

router.delete('/:id', async (req, res, next) => {
  try {
    try {
      removeTrustedCa(req.params.id);
    } catch (err) {
      if (err.status === 404) return res.status(404).json({ error: err.message });
      throw err;
    }
    await logAction(req, { module: 'CA tin cậy', actionType: 'XOA_CA_TIN_CAY', targetObject: req.params.id, description: `Xoá CA tin cậy "${req.params.id}"` });
    res.json({ ok: true });
  } catch (err) { next(err); }
});

module.exports = router;
