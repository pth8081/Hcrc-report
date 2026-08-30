// lib/apiAuth.js — Xác thực bằng API key (header "X-API-Key"), khác hẳn xác
// thực người dùng bằng mật khẩu ở Report Server — mỗi hệ thống đối tác một
// key riêng, gắn phạm vi (scope) được phép gọi (vd "reports", "realtime").
const { findByKey } = require('./apiKeys');

function requireApiKey(...requiredScopes) {
  return (req, res, next) => {
    const key = req.header('X-API-Key');
    if (!key) return res.status(401).json({ error: 'Thiếu header X-API-Key' });

    const consumer = findByKey(key);
    if (!consumer) return res.status(401).json({ error: 'API key không hợp lệ' });

    const hasScope = requiredScopes.every(scope => consumer.scopes?.includes(scope));
    if (!hasScope) return res.status(403).json({ error: 'API key không có quyền gọi endpoint này' });

    req.consumer = consumer;
    next();
  };
}

module.exports = { requireApiKey };
