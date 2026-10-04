// lib/internalAuth.js — Bảo vệ route /internal/* (bản 8.70, theo yêu cầu
// người dùng) — API NỘI BỘ để rp-server gọi SANG, ghi thẳng dữ liệu vào CSDL
// ETL (HCRC_ETL) qua api-server, KHÔNG dành cho đối tác ngoài (khác hẳn
// /api/v1/* — không đi qua lib/apiConsumers.js/chống phát lại HMAC).
//
// 2 lớp phòng thủ, mirror đúng tinh thần lib/adminIpAllowlist.js:
//   1. requireInternalSecret — secret CỐ ĐỊNH dùng chung (KHÔNG phải mỗi
//      request 1 chữ ký như HMAC đối tác — nội bộ, đơn giản hoá theo đúng
//      yêu cầu người dùng), đặt trong INTERNAL_API_SECRET (CẢ 2 bên
//      rp-server/.env và api-server/.env PHẢI khớp y hệt).
//   2. internalAllowedIps — TUỲ CHỌN, giống ADMIN_ALLOWED_IPS, lớp phòng
//      thủ BỔ SUNG — kiểm soát CHÍNH vẫn là KHÔNG proxy /internal ra
//      Internet (chỉ rp-server trong cùng mạng nội bộ gọi tới).
function requireInternalSecret(req, res, next) {
  const expected = process.env.INTERNAL_API_SECRET;
  if (!expected) return res.status(500).json({ error: 'Thiếu cấu hình INTERNAL_API_SECRET' });
  const provided = req.get('X-Internal-Secret');
  if (provided !== expected) return res.status(401).json({ error: 'Không có quyền gọi API nội bộ' });
  next();
}

function internalAllowedIps(req, res, next) {
  const raw = process.env.INTERNAL_ALLOWED_IPS;
  if (!raw) return next();
  const allowed = raw.split(',').map(s => s.trim()).filter(Boolean);
  if (allowed.includes(req.ip)) return next();
  res.status(403).json({ error: 'IP không được phép gọi API nội bộ' });
}

module.exports = { requireInternalSecret, internalAllowedIps };
