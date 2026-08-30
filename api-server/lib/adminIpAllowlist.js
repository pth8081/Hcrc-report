// lib/adminIpAllowlist.js — Lớp phòng thủ BỔ SUNG cho /admin/* — kiểm soát
// CHÍNH vẫn phải là chặn ở Nginx/tường lửa (không proxy /admin ra Internet,
// xem tài liệu kiến trúc "Quản Trị API HCRC", mục 07). Đặt ADMIN_ALLOWED_IPS
// trong .env (phân tách dấu phẩy) để bật; để trống = không chặn gì thêm ở
// đây, dựa hoàn toàn vào Nginx.
function adminIpAllowlist(req, res, next) {
  const raw = process.env.ADMIN_ALLOWED_IPS;
  if (!raw) return next();
  const allowed = raw.split(',').map(s => s.trim()).filter(Boolean);
  if (allowed.includes(req.ip)) return next();
  res.status(403).json({ error: 'IP không được phép truy cập trang quản trị' });
}

module.exports = { adminIpAllowlist };
