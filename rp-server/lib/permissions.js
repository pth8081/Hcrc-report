// lib/permissions.js — Tra quyền của một user: vai trò, menu được thấy, báo
// cáo được chạy. Cache trong bộ nhớ TTL ngắn (không nhúng vào JWT) — để admin
// thu hồi/đổi quyền có hiệu lực gần như ngay, không phải chờ người dùng đăng
// xuất/đăng nhập lại (xem tài liệu kiến trúc, mục 07).
const { sql, getPool } = require('../db');

const CACHE_TTL_MS = 60 * 1000;
const cache = new Map(); // userId -> { expiresAt, context }

async function loadContext(userId) {
  const pool = await getPool('RP');

  const userResult = await pool.request()
    .input('id', sql.Int, userId)
    .query('SELECT Id, Username, FullName, IsActive FROM app.Users WHERE Id = @id');
  const user = userResult.recordset[0];
  if (!user || !user.IsActive) return null;

  const roleResult = await pool.request()
    .input('id', sql.Int, userId)
    .query(`
      SELECT r.Id, r.Code, r.Name, r.IsSystemRole
      FROM app.UserRoles ur JOIN app.Roles r ON ur.RoleId = r.Id
      WHERE ur.UserId = @id
    `);
  const roles = roleResult.recordset;
  const isSystemRole = roles.some(r => r.IsSystemRole);

  let menuCodes, reportIds;
  if (isSystemRole) {
    const allMenu = await pool.request().query('SELECT Code FROM app.MenuItems');
    const allReports = await pool.request().query('SELECT ReportId FROM app.ReportCatalog WHERE IsActive = 1');
    menuCodes = new Set(allMenu.recordset.map(r => r.Code));
    reportIds = new Set(allReports.recordset.map(r => r.ReportId));
  } else if (roles.length) {
    const roleIds = roles.map(r => r.Id);
    const menuReq = pool.request();
    const reportReq = pool.request();
    const inClause = roleIds.map((id, i) => {
      menuReq.input(`r${i}`, sql.Int, id);
      reportReq.input(`r${i}`, sql.Int, id);
      return `@r${i}`;
    }).join(', ');

    const menuResult = await menuReq.query(`
      SELECT DISTINCT mi.Code
      FROM app.RoleMenuAccess rma JOIN app.MenuItems mi ON rma.MenuItemId = mi.Id
      WHERE rma.RoleId IN (${inClause})
    `);
    const reportResult = await reportReq.query(`
      SELECT DISTINCT ReportId FROM app.RoleReportAccess WHERE RoleId IN (${inClause})
    `);
    menuCodes = new Set(menuResult.recordset.map(r => r.Code));
    reportIds = new Set(reportResult.recordset.map(r => r.ReportId));
  } else {
    menuCodes = new Set();
    reportIds = new Set();
  }

  return {
    userId: user.Id,
    username: user.Username,
    fullName: user.FullName,
    roles: roles.map(r => ({ id: r.Id, code: r.Code, name: r.Name })),
    isSystemRole,
    menuCodes,
    reportIds
  };
}

async function getUserContext(userId) {
  const cached = cache.get(userId);
  if (cached && cached.expiresAt > Date.now()) return cached.context;

  const context = await loadContext(userId);
  if (context) cache.set(userId, { expiresAt: Date.now() + CACHE_TTL_MS, context });
  else cache.delete(userId);
  return context;
}

// Gọi khi sửa quyền của MỘT user (đổi vai trò) — buộc lần đọc kế tiếp làm
// mới ngay, không chờ hết TTL.
function invalidateUser(userId) {
  cache.delete(userId);
}

// Gọi khi sửa MỘT vai trò (RoleMenuAccess/RoleReportAccess) — có thể ảnh
// hưởng nhiều user cùng lúc, không biết trước là ai, nên xoá sạch cache.
function invalidateAll() {
  cache.clear();
}

module.exports = { getUserContext, invalidateUser, invalidateAll };
