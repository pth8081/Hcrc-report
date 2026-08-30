// lib/adminIpAllowlist.js — Lớp phòng thủ BỔ SUNG cho /admin/* (toàn bộ ETL
// chỉ có mặt /admin/*) — kiểm soát CHÍNH vẫn phải là chặn ở Nginx/tường lửa
// (etl KHÔNG nên lộ ra Internet, xem README). Đặt ETL_ADMIN_ALLOWED_IPS
// trong .env (phân tách dấu phẩy) để bật; để trống = không chặn gì thêm ở
// đây. Cùng khuôn với api-server/lib/adminIpAllowlist.js.
function adminIpAllowlist(req, res, next) {
  const raw = process.env.ETL_ADMIN_ALLOWED_IPS;
  if (!raw) return next();
  const allowed = raw.split(',').map(s => s.trim()).filter(Boolean);
  if (allowed.includes(req.ip)) return next();
  res.status(403).json({ error: 'IP không được phép truy cập trang quản trị' });
}

module.exports = { adminIpAllowlist };
