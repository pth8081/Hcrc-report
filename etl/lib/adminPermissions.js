// lib/adminPermissions.js — Tra quyền của 1 tài khoản etl-admin/: có vai trò
// hệ thống (IsSystemRole, luôn qua mọi kiểm tra) không, thấy/sửa được trang
// nào (admin.RoleMenuAccess) — mirror rp-server/lib/permissions.js, khác ở
// chỗ CanEdit phân biệt "chỉ xem" với "xem + sửa" TỪNG trang (rp-server chỉ
// có "thấy trang hay không", không cần phân biệt vì không có vai trò kiểu
// 'viewer' xem-mà-không-sửa cho báo cáo). Cache trong bộ nhớ TTL ngắn (không
// nhúng vào JWT — xem lib/adminAuth.js) để đổi nhóm quyền có hiệu lực gần
// như ngay, không cần đăng xuất/vào lại.
const { sql, getPool } = require('../db');

const CACHE_TTL_MS = 60 * 1000;
const cache = new Map(); // adminUserId -> { expiresAt, context }

async function loadContext(adminUserId) {
  const pool = await getPool('ADMIN');

  const userResult = await pool.request().input('id', sql.Int, adminUserId)
    .query('SELECT Id, IsActive FROM admin.AdminUsers WHERE Id = @id');
  const user = userResult.recordset[0];
  if (!user || !user.IsActive) return null;

  const roleResult = await pool.request().input('id', sql.Int, adminUserId).query(`
    SELECT r.Id, r.IsSystemRole
    FROM admin.AdminUserRoles aur JOIN admin.Roles r ON aur.RoleId = r.Id
    WHERE aur.AdminUserId = @id
  `);
  const roles = roleResult.recordset;
  const isSystemRole = roles.some(r => r.IsSystemRole);

  const menuAccess = new Map(); // menuCode -> { canEdit }
  if (!isSystemRole && roles.length) {
    const roleIds = roles.map(r => r.Id);
    const req = pool.request();
    const inClause = roleIds.map((id, i) => { req.input(`r${i}`, sql.Int, id); return `@r${i}`; }).join(', ');
    // MAX(CanEdit) theo MenuCode — 1 tài khoản có thể giữ NHIỀU vai trò, mỗi
    // vai trò cấp khác nhau cho cùng 1 trang, quyền cao hơn (CanEdit=1) thắng.
    const menuResult = await req.query(`
      SELECT MenuCode, MAX(CAST(CanEdit AS INT)) AS CanEdit
      FROM admin.RoleMenuAccess WHERE RoleId IN (${inClause})
      GROUP BY MenuCode
    `);
    for (const row of menuResult.recordset) menuAccess.set(row.MenuCode, { canEdit: !!row.CanEdit });
  }

  return { adminUserId: user.Id, isSystemRole, menuAccess };
}

async function getAdminContext(adminUserId) {
  const cached = cache.get(adminUserId);
  if (cached && cached.expiresAt > Date.now()) return cached.context;

  const context = await loadContext(adminUserId);
  if (context) cache.set(adminUserId, { expiresAt: Date.now() + CACHE_TTL_MS, context });
  else cache.delete(adminUserId);
  return context;
}

// Gọi khi sửa vai trò của 1 tài khoản — buộc lần đọc kế tiếp làm mới ngay.
function invalidateUser(adminUserId) {
  cache.delete(adminUserId);
}

// Gọi khi sửa quyền của 1 vai trò (RoleMenuAccess) — ảnh hưởng nhiều tài
// khoản cùng lúc, không biết trước là ai, nên xoá sạch cache.
function invalidateAll() {
  cache.clear();
}

// Dùng SAU requireAdminAuth (lib/adminAuth.js) trên route CHỈ CẦN XEM được
// menuCode đó — thay blockTargetImporter cũ.
function requireMenuAccess(menuCode) {
  return async (req, res, next) => {
    try {
      const context = await getAdminContext(req.admin.sub);
      if (!context) return res.status(401).json({ error: 'Tài khoản không còn hoạt động' });
      if (context.isSystemRole || context.menuAccess.has(menuCode)) {
        req.adminContext = context;
        return next();
      }
      res.status(403).json({ error: 'Bạn không có quyền truy cập mục này' });
    } catch (err) { next(err); }
  };
}

// Dùng SAU requireAdminAuth trên route GHI (POST/PUT/DELETE) của menuCode đó
// — thay requireAdminRole/requireTargetImporterRole cũ.
function requireMenuEdit(menuCode) {
  return async (req, res, next) => {
    try {
      const context = await getAdminContext(req.admin.sub);
      if (!context) return res.status(401).json({ error: 'Tài khoản không còn hoạt động' });
      if (context.isSystemRole || context.menuAccess.get(menuCode)?.canEdit) {
        req.adminContext = context;
        return next();
      }
      res.status(403).json({ error: 'Bạn không có quyền sửa mục này' });
    } catch (err) { next(err); }
  };
}

// Dùng SAU requireAdminAuth trên thao tác NHẠY CẢM — CHẶT hơn
// requireMenuEdit('users'): menu 'users' có thể được cấp cho 1 tài khoản
// KHÔNG phải vai trò hệ thống (delegation hợp lệ, vd giao 1 người quản lý
// tài khoản mà không cần là Admin hệ thống). Nhưng gán VAI TRÒ tuỳ ý (kể cả
// vai trò hệ thống) hay tự sửa quyền của 1 vai trò lại chính là con đường
// leo thang — 1 tài khoản chỉ có menu 'users' (không phải vai trò hệ thống)
// có thể tự tạo vai trò IsSystemRole=1 mới, gán cho chính mình, coi như
// chiếm toàn quyền — mirror rp-server/lib/auth.js:requireSystemRoleActor.
function requireSystemRoleActor(req, res, next) {
  getAdminContext(req.admin.sub).then(context => {
    if (!context) return res.status(401).json({ error: 'Tài khoản không còn hoạt động' });
    if (!context.isSystemRole) return res.status(403).json({ error: 'Chỉ tài khoản vai trò hệ thống mới thực hiện được thao tác này' });
    next();
  }).catch(next);
}

// Thay getRoleForRateLimit cũ (đọc thẳng cột Role='admin') — tra "có vai trò
// hệ thống không" theo username, dùng TRƯỚC khi biết mật khẩu đúng/sai (chỉ
// để chọn ngưỡng rate-limit, không phải bước xác thực). Không dùng cache
// (getAdminContext) ở đây vì cache khoá theo adminUserId, lúc này CHƯA biết
// user có tồn tại/đăng nhập đúng không.
async function isSystemRoleForRateLimit(username) {
  if (!username) return false;
  const pool = await getPool('ADMIN');
  const result = await pool.request().input('username', sql.NVarChar(50), username).query(`
    SELECT TOP 1 1
    FROM admin.AdminUsers u
    JOIN admin.AdminUserRoles aur ON aur.AdminUserId = u.Id
    JOIN admin.Roles r ON r.Id = aur.RoleId AND r.IsSystemRole = 1
    WHERE u.Username = @username
  `);
  return result.recordset.length > 0;
}

module.exports = {
  getAdminContext, invalidateUser, invalidateAll,
  requireMenuAccess, requireMenuEdit, requireSystemRoleActor, isSystemRoleForRateLimit
};
