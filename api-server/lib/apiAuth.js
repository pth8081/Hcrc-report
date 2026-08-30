// lib/apiAuth.js — Xác thực bằng API key (header "X-API-Key") cho hệ thống
// đối tác — khác hẳn lib/adminAuth.js (xác thực người vận hành bằng mật khẩu
// để vào api-admin/, hai ranh giới hoàn toàn tách biệt). Tra cứu qua
// lib/apiConsumers.js (cache trong bộ nhớ, không phải 1 truy vấn CSDL cho
// mỗi request).
const { findByKey } = require('./apiConsumers');

function requireApiKey(...requiredScopes) {
  return async (req, res, next) => {
    try {
      const key = req.header('X-API-Key');
      if (!key) return res.status(401).json({ error: 'Thiếu header X-API-Key' });

      const consumer = await findByKey(key);
      if (!consumer) return res.status(401).json({ error: 'API key không hợp lệ' });

      const hasScope = requiredScopes.every(scope => consumer.scopes.includes(scope));
      if (!hasScope) return res.status(403).json({ error: 'API key không có quyền gọi endpoint này' });

      req.consumer = consumer;
      next();
    } catch (err) { next(err); }
  };
}

module.exports = { requireApiKey };
