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
//
// "Chỉ 1 phiên đăng nhập" (bản 10.6, theo yêu cầu người dùng — "phiên muộn
// hơn sẽ giữ lại và phiên cũ sẽ bị tự động disable") — DÙNG CHUNG đúng cơ
// chế/CSDL/cache ở trên, chỉ thêm 1 cột admin.AdminUsers.CurrentSessionId so
// với claim "sid" (mã ngẫu nhiên mỗi lần issueToken() phát hành phiên, xem
// lib/adminAuth.js) — KHÁC NHAU nghĩa là đã có lượt đăng nhập MỚI HƠN ở nơi
// khác, coi như phiên này bị thu hồi y hệt trường hợp SessionsInvalidatedAt
// (cùng 1 request CSDL, không tốn thêm round-trip nào).
const { sql, getPool } = require('../db');

const CACHE_TTL_MS = 30 * 1000;
const cache = new Map(); // adminId -> { expiresAt, invalidatedAtMs, currentSessionId, lastLoginAtMs }

// LAST_LOGIN_WINDOW_MS (bản 10.68) — xem chú thích đầy đủ ở
// etl-db/schema.sql:LastLoginAt (mirror rp-db, chỉ khác tên bảng).
const LAST_LOGIN_WINDOW_MS = 8 * 60 * 60 * 1000;

async function loadSessionState(adminId) {
  const pool = await getPool('ADMIN');
  const result = await pool.request().input('id', sql.Int, adminId)
    .query('SELECT SessionsInvalidatedAt, CurrentSessionId, LastLoginAt FROM admin.AdminUsers WHERE Id = @id');
  const row = result.recordset[0];
  return {
    invalidatedAtMs: row?.SessionsInvalidatedAt ? new Date(row.SessionsInvalidatedAt).getTime() : null,
    currentSessionId: row?.CurrentSessionId || null,
    lastLoginAtMs: row?.LastLoginAt ? new Date(row.LastLoginAt).getTime() : null
  };
}

// issuedAtSeconds = payload.iat (giây, chuẩn JWT — jsonwebtoken tự gắn).
// sessionId = payload.sid (có thể undefined — token phát hành TRƯỚC bản
// 10.6, xem chú thích CurrentSessionId ở etl-db/schema.sql).
//
// Lỗi CSDL khi tra cache miss (mất kết nối tạm thời) -> FAIL OPEN (coi như
// "chưa thu hồi", không chặn request) thay vì để lỗi lan lên chặn cả
// request — đây là lớp phòng thủ CHIỀU SÂU chống phiên bị đánh cắp sau khi
// đổi mật khẩu/2FA/role, KHÔNG PHẢI ranh giới xác thực chính (chữ ký JWT
// mới là ranh giới chính, vẫn được verify trước đó, không phụ thuộc CSDL).
// requireAdminAuth() (lib/adminAuth.js) trước khi có cơ chế này hoàn toàn
// không cần CSDL — CSDL chập chờn vài giây không nên khiến TOÀN BỘ app
// (mọi route) trả lỗi. KHÔNG cache kết quả lỗi — lần gọi sau tự thử lại
// ngay, tự phục hồi ngay khi CSDL sống lại.
async function isSessionRevoked(adminId, issuedAtSeconds, sessionId) {
  let entry = cache.get(adminId);
  if (!entry || entry.expiresAt <= Date.now()) {
    let state;
    try {
      state = await loadSessionState(adminId);
    } catch (err) {
      console.warn(`⚠️  [sessionRevocation] không tra được trạng thái phiên cho admin #${adminId} (CSDL tạm gián đoạn?) — fail-open, coi như phiên chưa bị thu hồi: ${err.message}`);
      return false;
    }
    entry = { expiresAt: Date.now() + CACHE_TTL_MS, ...state };
    cache.set(adminId, entry);
  }
  if (entry.invalidatedAtMs !== null && entry.invalidatedAtMs > issuedAtSeconds * 1000) return true;
  // currentSessionId NULL = tài khoản chưa từng đăng nhập qua code có cờ
  // "sid" (chưa migrate) — KHÔNG ép đăng xuất những phiên đang có.
  if (entry.currentSessionId && entry.currentSessionId !== sessionId) return true;
  return false;
}

// Gọi NGAY sau khi đổi mật khẩu/gỡ 2FA/đổi role/khoá tài khoản — ghi CSDL VÀ
// cập nhật cache TẠI CHỖ để có hiệu lực NGAY LẬP TỨC, không chờ hết TTL cache.
async function revokeSessions(adminId) {
  const pool = await getPool('ADMIN');
  const result = await pool.request().input('id', sql.Int, adminId)
    .query('UPDATE admin.AdminUsers SET SessionsInvalidatedAt = SYSUTCDATETIME() OUTPUT INSERTED.SessionsInvalidatedAt, INSERTED.CurrentSessionId WHERE Id = @id');
  const row = result.recordset[0];
  const invalidatedAtMs = row?.SessionsInvalidatedAt ? new Date(row.SessionsInvalidatedAt).getTime() : Date.now();
  const prev = cache.get(adminId);
  cache.set(adminId, { expiresAt: Date.now() + CACHE_TTL_MS, invalidatedAtMs, currentSessionId: row?.CurrentSessionId ?? prev?.currentSessionId ?? null });
}

// Gọi TỪ issueToken() (lib/adminAuth.js) mỗi lần phát hành phiên ĐẦY ĐỦ mới
// — ghi đè CurrentSessionId (phiên MỚI NHẤT luôn thắng, mọi phiên cũ hơn tự
// động bị isSessionRevoked() từ chối ở lượt gọi API kế tiếp của chúng) VÀ
// cập nhật cache TẠI CHỖ, cùng nguyên tắc "hiệu lực ngay" như
// revokeSessions() — không chờ hết TTL cache mới nhận ra phiên mới.
async function setCurrentSession(adminId, sessionId) {
  const pool = await getPool('ADMIN');
  const result = await pool.request().input('id', sql.Int, adminId).input('sid', sql.NVarChar(36), sessionId)
    .query(`
      UPDATE admin.AdminUsers SET CurrentSessionId = @sid, LastLoginAt = SYSUTCDATETIME()
      OUTPUT INSERTED.SessionsInvalidatedAt, INSERTED.LastLoginAt WHERE Id = @id
    `);
  const row = result.recordset[0];
  const invalidatedAtMs = row?.SessionsInvalidatedAt ? new Date(row.SessionsInvalidatedAt).getTime() : null;
  const lastLoginAtMs = row?.LastLoginAt ? new Date(row.LastLoginAt).getTime() : null;
  cache.set(adminId, { expiresAt: Date.now() + CACHE_TTL_MS, invalidatedAtMs, currentSessionId: sessionId, lastLoginAtMs });
}

// wasRecentlyLoggedIn (bản 10.68) — mirror rp-server/lib/sessionRevocation.js,
// xem chú thích đầy đủ ở đó.
async function wasRecentlyLoggedIn(adminId) {
  let entry = cache.get(adminId);
  if (!entry || entry.expiresAt <= Date.now()) {
    let state;
    try {
      state = await loadSessionState(adminId);
    } catch (err) {
      console.warn(`⚠️  [sessionRevocation] không tra được LastLoginAt cho admin #${adminId} (CSDL tạm gián đoạn?) — fail-open, coi như CHƯA có phiên gần đây: ${err.message}`);
      return false;
    }
    entry = { expiresAt: Date.now() + CACHE_TTL_MS, ...state };
    cache.set(adminId, entry);
  }
  return !!(entry.lastLoginAtMs && Date.now() - entry.lastLoginAtMs < LAST_LOGIN_WINDOW_MS);
}

module.exports = { isSessionRevoked, revokeSessions, setCurrentSession, wasRecentlyLoggedIn };
