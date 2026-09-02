// lib/sessionRevocation.js — Thu hồi phiên đăng nhập (JWT) khi đổi mật
// khẩu/gỡ 2FA/đổi vai trò/khoá tài khoản. JWT tự chứa (self-contained) —
// requireAuth() (lib/auth.js) chỉ verify chữ ký, KHÔNG tự phát hiện được
// những thay đổi này cho tới khi token tự hết hạn (TTL 2h, có thể "trượt"
// dài hơn nếu còn hoạt động — xem maybeSlideSession() ở lib/auth.js) — 1
// phiên bị đánh cắp trước khi admin phát hiện/xử lý vẫn dùng được tới hết
// TTL dù admin đã đổi mật khẩu/gỡ 2FA/khoá tài khoản đó ngay lập tức.
//
// app.Users.SessionsInvalidatedAt (xem rp-db/schema.sql) so với claim "iat"
// (issued-at, jsonwebtoken tự gắn mỗi lần jwt.sign()) — token phát hành
// TRƯỚC lần thu hồi gần nhất bị từ chối dù chữ ký còn đúng. Cache TTL ngắn
// (cùng mẫu lib/permissions.js/api-server's apiConsumers.js:isActiveConsumer)
// — không tra CSDL mỗi request.
const { sql, getPool } = require('../db');

const CACHE_TTL_MS = 30 * 1000;
const cache = new Map(); // userId -> { expiresAt, invalidatedAtMs }

async function loadInvalidatedAt(userId) {
  const pool = await getPool('RP');
  const result = await pool.request().input('id', sql.Int, userId)
    .query('SELECT SessionsInvalidatedAt FROM app.Users WHERE Id = @id');
  const row = result.recordset[0];
  return row?.SessionsInvalidatedAt ? new Date(row.SessionsInvalidatedAt).getTime() : null;
}

// issuedAtSeconds = payload.iat (giây, chuẩn JWT — jsonwebtoken tự gắn).
//
// Lỗi CSDL khi tra cache miss (mất kết nối tạm thời) -> FAIL OPEN (coi như
// "chưa thu hồi", không chặn request) thay vì để lỗi lan lên chặn cả
// request — đây là lớp phòng thủ CHIỀU SÂU chống phiên bị đánh cắp sau khi
// đổi mật khẩu/2FA/vai trò, KHÔNG PHẢI ranh giới xác thực chính (chữ ký JWT
// mới là ranh giới chính, vẫn được verify trước đó, không phụ thuộc CSDL).
// requireAuth() (lib/auth.js) trước khi có cơ chế này hoàn toàn không cần
// CSDL — CSDL chập chờn vài giây không nên khiến TOÀN BỘ app (mọi route,
// kể cả route không cần dữ liệu gì khác) trả lỗi. KHÔNG cache kết quả lỗi —
// lần gọi sau tự thử lại ngay, tự phục hồi ngay khi CSDL sống lại.
async function isSessionRevoked(userId, issuedAtSeconds) {
  let entry = cache.get(userId);
  if (!entry || entry.expiresAt <= Date.now()) {
    let invalidatedAtMs;
    try {
      invalidatedAtMs = await loadInvalidatedAt(userId);
    } catch (err) {
      console.warn(`⚠️  [sessionRevocation] không tra được SessionsInvalidatedAt cho user #${userId} (CSDL tạm gián đoạn?) — fail-open, coi như phiên chưa bị thu hồi: ${err.message}`);
      return false;
    }
    entry = { expiresAt: Date.now() + CACHE_TTL_MS, invalidatedAtMs };
    cache.set(userId, entry);
  }
  if (entry.invalidatedAtMs === null) return false;
  return entry.invalidatedAtMs > issuedAtSeconds * 1000;
}

// Gọi NGAY sau khi đổi mật khẩu/gỡ 2FA/đổi vai trò/khoá tài khoản — ghi CSDL
// VÀ cập nhật cache TẠI CHỖ để có hiệu lực NGAY LẬP TỨC, không chờ hết TTL
// cache (khác invalidateUser() ở lib/permissions.js — đó chỉ xoá cache
// menu/quyền, không đụng gì tới tính hợp lệ của token đã phát).
async function revokeSessions(userId) {
  const pool = await getPool('RP');
  const result = await pool.request().input('id', sql.Int, userId)
    .query('UPDATE app.Users SET SessionsInvalidatedAt = SYSUTCDATETIME() OUTPUT INSERTED.SessionsInvalidatedAt WHERE Id = @id');
  const invalidatedAtMs = result.recordset[0]?.SessionsInvalidatedAt
    ? new Date(result.recordset[0].SessionsInvalidatedAt).getTime() : Date.now();
  cache.set(userId, { expiresAt: Date.now() + CACHE_TTL_MS, invalidatedAtMs });
}

module.exports = { isSessionRevoked, revokeSessions };
