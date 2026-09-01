// lib/sessionRevocation.js — Thu hồi phiên đăng nhập (JWT) của admin khi
// đổi mật khẩu/gỡ 2FA/đổi vai trò/khoá tài khoản. JWT tự chứa (self-contained,
// role NHÚNG THẲNG vào token lúc đăng nhập — xem lib/adminAuth.js issueToken)
// — requireAdminAuth() chỉ verify chữ ký, KHÔNG tự phát hiện được những thay
// đổi này cho tới khi token tự hết hạn — 1 phiên bị đánh cắp trước khi admin
// phát hiện/xử lý vẫn dùng được với ROLE CŨ tới hết TTL dù admin đã đổi mật
// khẩu/gỡ 2FA/đổi role/khoá tài khoản đó ngay lập tức.
//
// admin.AdminUsers.SessionsInvalidatedAt (xem etl-db/schema.sql) so với
// claim "iat" (issued-at, jsonwebtoken tự gắn) — token phát hành TRƯỚC lần
// thu hồi gần nhất bị từ chối dù chữ ký còn đúng. Cache TTL ngắn (cùng mẫu
// api-server/lib/apiConsumers.js:isActiveConsumer) — không tra CSDL mỗi request.
const { sql, getPool } = require('../db');

const CACHE_TTL_MS = 30 * 1000;
const cache = new Map(); // adminId -> { expiresAt, invalidatedAtMs }

async function loadInvalidatedAt(adminId) {
  const pool = await getPool('ADMIN');
  const result = await pool.request().input('id', sql.Int, adminId)
    .query('SELECT SessionsInvalidatedAt FROM admin.AdminUsers WHERE Id = @id');
  const row = result.recordset[0];
  return row?.SessionsInvalidatedAt ? new Date(row.SessionsInvalidatedAt).getTime() : null;
}

// issuedAtSeconds = payload.iat (giây, chuẩn JWT — jsonwebtoken tự gắn).
async function isSessionRevoked(adminId, issuedAtSeconds) {
  let entry = cache.get(adminId);
  if (!entry || entry.expiresAt <= Date.now()) {
    const invalidatedAtMs = await loadInvalidatedAt(adminId);
    entry = { expiresAt: Date.now() + CACHE_TTL_MS, invalidatedAtMs };
    cache.set(adminId, entry);
  }
  if (entry.invalidatedAtMs === null) return false;
  return entry.invalidatedAtMs > issuedAtSeconds * 1000;
}

// Gọi NGAY sau khi đổi mật khẩu/gỡ 2FA/đổi role/khoá tài khoản — ghi CSDL VÀ
// cập nhật cache TẠI CHỖ để có hiệu lực NGAY LẬP TỨC, không chờ hết TTL cache.
async function revokeSessions(adminId) {
  const pool = await getPool('ADMIN');
  const result = await pool.request().input('id', sql.Int, adminId)
    .query('UPDATE admin.AdminUsers SET SessionsInvalidatedAt = SYSUTCDATETIME() OUTPUT INSERTED.SessionsInvalidatedAt WHERE Id = @id');
  const invalidatedAtMs = result.recordset[0]?.SessionsInvalidatedAt
    ? new Date(result.recordset[0].SessionsInvalidatedAt).getTime() : Date.now();
  cache.set(adminId, { expiresAt: Date.now() + CACHE_TTL_MS, invalidatedAtMs });
}

module.exports = { isSessionRevoked, revokeSessions };
