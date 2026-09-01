// routes/users.js — Trang "Phân quyền" > danh sách người dùng. Không có route
// XOÁ người dùng — chỉ khoá (IsActive=0) — vì app.AuditLog tham chiếu UserId,
// xoá cứng sẽ mất dấu vết nhật ký của chính người đó đã từng làm gì.
const express = require('express');
const bcrypt = require('bcryptjs');
const { sql, getPool } = require('../db');
const { requireAuth, requireMenuAccess } = require('../lib/auth');
const { invalidateUser, getUserContext } = require('../lib/permissions');
const { logAction } = require('../lib/auditLog');
const { fetchDirectory } = require('../lib/hcrcWorkspaceClient');

const router = express.Router();
router.use(requireAuth, requireMenuAccess('system-permissions'));

// Dùng RIÊNG cho /:id/reset-2fa — CHẶT hơn requireMenuAccess('system-permissions')
// ở trên (menu đó có thể được cấp cho user KHÔNG phải Admin hệ thống, qua
// RoleMenuAccess), vì đây là thao tác gỡ 2FA của người khác — chỉ vai trò
// IsSystemRole=1 ("Admin") thật sự mới được thực hiện.
async function requireSystemRoleActor(req, res, next) {
  try {
    const context = await getUserContext(req.user.sub);
    if (!context?.isSystemRole) return res.status(403).json({ error: 'Chỉ vai trò Admin (hệ thống) mới thực hiện được thao tác này' });
    next();
  } catch (err) { next(err); }
}

router.get('/', async (req, res, next) => {
  try {
    const pool = await getPool('RP');
    const users = await pool.request().query(`
      SELECT Id, Username, FullName, Email, Department, Position, AuthSource, ExternalId, LastSyncedAt,
             IsActive, TwoFactorEnabled, CreatedAt, LastLoginAt
      FROM app.Users ORDER BY Username
    `);
    const roles = await pool.request().query(`
      SELECT ur.UserId, r.Id AS RoleId, r.Code, r.Name, r.IsSystemRole
      FROM app.UserRoles ur JOIN app.Roles r ON ur.RoleId = r.Id
    `);
    const rolesByUser = new Map();
    for (const r of roles.recordset) {
      if (!rolesByUser.has(r.UserId)) rolesByUser.set(r.UserId, []);
      rolesByUser.get(r.UserId).push({ id: r.RoleId, code: r.Code, name: r.Name, isSystemRole: !!r.IsSystemRole });
    }
    res.json(users.recordset.map(u => ({ ...u, roles: rolesByUser.get(u.Id) || [] })));
  } catch (err) { next(err); }
});

// Tạo tay LUÔN là AuthSource='local' (cần password ngay) — account
// AuthSource='hcrcWorkspace' chỉ tạo qua "Đồng bộ tài khoản" (POST /sync),
// không có form tạo tay riêng cho loại này (tránh gõ nhầm ExternalId, mất
// tác dụng khớp lần đồng bộ sau).
router.post('/', async (req, res, next) => {
  try {
    const { username, password, fullName, email } = req.body || {};
    if (!username || !password || !fullName) {
      return res.status(400).json({ error: 'Thiếu username/password/fullName' });
    }
    const passwordHash = await bcrypt.hash(password, 10);
    const pool = await getPool('RP');
    const result = await pool.request()
      .input('username', sql.NVarChar(50), username)
      .input('passwordHash', sql.NVarChar(200), passwordHash)
      .input('fullName', sql.NVarChar(200), fullName)
      .input('email', sql.NVarChar(200), email || null)
      .query(`
        INSERT INTO app.Users (Username, PasswordHash, FullName, Email, AuthSource)
        OUTPUT INSERTED.Id
        VALUES (@username, @passwordHash, @fullName, @email, 'local')
      `);
    const id = result.recordset[0].Id;
    await logAction(req, { module: 'Phân quyền', actionType: 'TAO_USER', targetObject: username, description: `Tạo người dùng "${username}"` });
    res.status(201).json({ id });
  } catch (err) {
    if (err.number === 2627 || err.number === 2601) return res.status(409).json({ error: 'Username đã tồn tại' });
    next(err);
  }
});

router.put('/:id', async (req, res, next) => {
  try {
    const { fullName, email, department, position, isActive } = req.body || {};
    const pool = await getPool('RP');
    await pool.request()
      .input('id', sql.Int, req.params.id)
      .input('fullName', sql.NVarChar(200), fullName)
      .input('email', sql.NVarChar(200), email || null)
      .input('department', sql.NVarChar(200), department || null)
      .input('position', sql.NVarChar(200), position || null)
      .input('isActive', sql.Bit, isActive ? 1 : 0)
      .query('UPDATE app.Users SET FullName = @fullName, Email = @email, Department = @department, Position = @position, IsActive = @isActive WHERE Id = @id');
    invalidateUser(parseInt(req.params.id, 10));
    await logAction(req, { module: 'Phân quyền', actionType: 'SUA_USER', targetObject: req.params.id, description: `Cập nhật người dùng #${req.params.id}` });
    res.json({ ok: true });
  } catch (err) { next(err); }
});

router.post('/:id/reset-password', async (req, res, next) => {
  try {
    const { password } = req.body || {};
    if (!password) return res.status(400).json({ error: 'Thiếu password' });
    const passwordHash = await bcrypt.hash(password, 10);
    const pool = await getPool('RP');
    await pool.request()
      .input('id', sql.Int, req.params.id)
      .input('passwordHash', sql.NVarChar(200), passwordHash)
      .query('UPDATE app.Users SET PasswordHash = @passwordHash WHERE Id = @id');
    await logAction(req, { module: 'Phân quyền', actionType: 'DAT_LAI_MK', targetObject: req.params.id, description: `Đặt lại mật khẩu người dùng #${req.params.id}` });
    res.json({ ok: true });
  } catch (err) { next(err); }
});

// Vai trò Admin (IsSystemRole=1) BẮT BUỘC AuthSource='local' (xem
// lib/auth.js) — chặn gán ở đây, không đợi tới lúc đăng nhập mới phát hiện
// account "Admin" không đăng nhập được vì HCRC Workspace không xác thực
// được vai trò Admin/không phụ thuộc uptime hệ thống ngoài.
router.put('/:id/roles', async (req, res, next) => {
  try {
    const { roleIds = [] } = req.body || {};
    const pool = await getPool('RP');

    if (roleIds.length) {
      const checkReq = pool.request();
      const inClause = roleIds.map((id, i) => { checkReq.input(`r${i}`, sql.Int, id); return `@r${i}`; }).join(', ');
      const systemRoleCheck = await checkReq.query(`SELECT COUNT(*) AS Cnt FROM app.Roles WHERE Id IN (${inClause}) AND IsSystemRole = 1`);
      if (systemRoleCheck.recordset[0].Cnt > 0) {
        const authSourceCheck = await pool.request().input('id', sql.Int, req.params.id)
          .query('SELECT AuthSource FROM app.Users WHERE Id = @id');
        if (authSourceCheck.recordset[0]?.AuthSource !== 'local') {
          return res.status(400).json({ error: 'Vai trò Admin (hệ thống) chỉ gán được cho tài khoản xác thực local — đổi "Nguồn xác thực" sang Local (kèm đặt mật khẩu) trước' });
        }
      }
    }

    const tx = new sql.Transaction(pool);
    await tx.begin();
    try {
      await new sql.Request(tx).input('id', sql.Int, req.params.id)
        .query('DELETE FROM app.UserRoles WHERE UserId = @id');
      for (const roleId of roleIds) {
        await new sql.Request(tx)
          .input('id', sql.Int, req.params.id)
          .input('roleId', sql.Int, roleId)
          .query('INSERT INTO app.UserRoles (UserId, RoleId) VALUES (@id, @roleId)');
      }
      await tx.commit();
    } catch (err) {
      await tx.rollback().catch(() => {});
      throw err;
    }
    invalidateUser(parseInt(req.params.id, 10));
    await logAction(req, { module: 'Phân quyền', actionType: 'GAN_VAI_TRO', targetObject: req.params.id, description: `Gán vai trò cho người dùng #${req.params.id}: [${roleIds.join(', ')}]` });
    res.json({ ok: true });
  } catch (err) { next(err); }
});

// "Đặt lại 2FA" — 1 Admin gỡ 2FA giúp Admin KHÁC bị mất thiết bị/cần khôi
// phục (xem lib/twoFactor.js). Xoá sạch secret + mã khôi phục cũ — lần đăng
// nhập kế tiếp của tài khoản đó bị bắt đăng ký 2FA lại từ đầu trước khi vào
// được gì khác (2FA vẫn BẮT BUỘC, không phải "tắt hẳn"). Thao tác NHẠY CẢM
// (bỏ lớp bảo vệ thứ 2 của người khác) — LUÔN ghi audit log rõ ai gỡ cho ai.
router.post('/:id/reset-2fa', requireSystemRoleActor, async (req, res, next) => {
  try {
    const targetId = parseInt(req.params.id, 10);
    const targetContext = await getUserContext(targetId);
    if (!targetContext) return res.status(404).json({ error: 'Không tìm thấy người dùng' });
    if (!targetContext.isSystemRole) return res.status(400).json({ error: '2FA chỉ áp dụng cho vai trò Admin' });

    const pool = await getPool('RP');
    await pool.request().input('id', sql.Int, targetId)
      .query('UPDATE app.Users SET TwoFactorEnabled = 0, TwoFactorSecretEncrypted = NULL, TwoFactorEnrolledAt = NULL WHERE Id = @id');
    await pool.request().input('id', sql.Int, targetId)
      .query('DELETE FROM app.UserTwoFactorRecoveryCodes WHERE UserId = @id');

    await logAction(req, {
      module: 'Phân quyền', actionType: 'DAT_LAI_2FA', targetObject: req.params.id,
      description: `Đặt lại 2FA cho người dùng "${targetContext.username}" (#${targetId}) — lần đăng nhập kế tiếp phải đăng ký lại`
    });
    res.json({ ok: true });
  } catch (err) { next(err); }
});

// Đổi "Nguồn xác thực" của MỘT tài khoản — THAO TÁC NHẠY CẢM (quyết định
// mật khẩu của account đó do ai xác thực), chỉ Admin hệ thống thật (không
// phải chỉ có menu 'system-permissions' qua RoleMenuAccess) mới làm được,
// giống reset-2fa. 'hcrcWorkspace' -> 'local': password BẮT BUỘC nếu account
// chưa có PasswordHash nào (account tạo qua "Đồng bộ tài khoản" luôn NULL) —
// không thì đổi xong không đăng nhập được bằng cách nào. Chặn đổi sang
// 'hcrcWorkspace' nếu account đang giữ vai trò Admin (xem lib/auth.js).
router.put('/:id/auth-source', requireSystemRoleActor, async (req, res, next) => {
  try {
    const { authSource, password } = req.body || {};
    if (!['local', 'hcrcWorkspace'].includes(authSource)) {
      return res.status(400).json({ error: 'authSource phải là "local" hoặc "hcrcWorkspace"' });
    }
    const targetId = parseInt(req.params.id, 10);
    const pool = await getPool('RP');
    const existing = await pool.request().input('id', sql.Int, targetId)
      .query('SELECT PasswordHash FROM app.Users WHERE Id = @id');
    if (!existing.recordset.length) return res.status(404).json({ error: 'Không tìm thấy người dùng' });

    if (authSource === 'hcrcWorkspace') {
      const targetContext = await getUserContext(targetId);
      if (targetContext?.isSystemRole) {
        return res.status(400).json({ error: 'Tài khoản đang giữ vai trò Admin (hệ thống) — gỡ vai trò Admin trước khi chuyển sang xác thực HCRC Workspace' });
      }
      await pool.request().input('id', sql.Int, targetId)
        .query("UPDATE app.Users SET AuthSource = 'hcrcWorkspace' WHERE Id = @id");
    } else {
      if (!password && !existing.recordset[0].PasswordHash) {
        return res.status(400).json({ error: 'Tài khoản chưa có mật khẩu local nào — nhập mật khẩu khi chuyển sang xác thực Local' });
      }
      const request = pool.request().input('id', sql.Int, targetId);
      if (password) {
        request.input('passwordHash', sql.NVarChar(200), await bcrypt.hash(password, 10));
        await request.query("UPDATE app.Users SET AuthSource = 'local', PasswordHash = @passwordHash WHERE Id = @id");
      } else {
        await request.query("UPDATE app.Users SET AuthSource = 'local' WHERE Id = @id");
      }
    }

    invalidateUser(targetId);
    await logAction(req, { module: 'Phân quyền', actionType: 'DOI_NGUON_XAC_THUC', targetObject: req.params.id, description: `Đổi nguồn xác thực người dùng #${targetId} sang "${authSource}"` });
    res.json({ ok: true });
  } catch (err) { next(err); }
});

// "Đồng bộ tài khoản" — bấm tay, KHÔNG tự chạy theo giờ (khác
// jobs/reportEmailScheduler.js) vì đây là thao tác cấp phát/thu hồi quyền
// TRUY CẬP, muốn admin chủ động biết mỗi lần có gì thay đổi (xem tổng kết
// trả về). Khớp theo ExternalId (mã nhân viên bên HCRC Workspace, ổn định
// hơn Username có thể đổi) — item nào từ HCRC Workspace CHƯA có ExternalId
// khớp NHƯNG Username đã tồn tại trong app.Users thì BỎ QUA (không tự gộp
// nhầm vào 1 account SẴN CÓ, nhất là account AuthSource='local' như Admin —
// admin tự xử lý tay nếu đúng là cùng 1 người). Tài khoản MỚI: AuthSource=
// 'hcrcWorkspace', PasswordHash=NULL, IsActive=0 (CHƯA cho phép kết nối —
// admin phải bấm "Mở khoá" tay, xem yêu cầu "thêm nút cho phép kết nối" của
// người dùng). Tài khoản ĐÃ đồng bộ trước đó (ExternalId khớp) chỉ cập nhật
// FullName/Department/Position — KHÔNG đụng AuthSource/IsActive/PasswordHash
// (giữ nguyên lựa chọn admin đã đổi tay, vd đã chuyển sang local). Tài khoản
// đã đồng bộ trước nhưng LẦN NÀY không còn thấy (nghỉ việc/đổi mã nhân viên)
// -> tự khoá (IsActive=0) — an toàn hơn để hở quyền truy cập của người đã
// nghỉ, ghi audit log rõ từng account bị khoá.
router.post('/sync', requireSystemRoleActor, async (req, res, next) => {
  try {
    const directory = await fetchDirectory();
    const activeItems = directory.filter(item => item && item.externalId && item.username && item.isActive !== false);
    const seenExternalIds = new Set(activeItems.map(item => String(item.externalId)));

    const pool = await getPool('RP');
    const existingResult = await pool.request().query(`
      SELECT Id, Username, ExternalId, IsActive FROM app.Users WHERE AuthSource = 'hcrcWorkspace'
    `);
    const byExternalId = new Map(existingResult.recordset.filter(r => r.ExternalId).map(r => [r.ExternalId, r]));
    const usernamesInUse = new Set(existingResult.recordset.map(r => r.Username));
    // Username 'local' cũng phải tránh trùng — không chỉ account hcrcWorkspace.
    const allUsernames = await pool.request().query('SELECT Username FROM app.Users');
    for (const r of allUsernames.recordset) usernamesInUse.add(r.Username);

    let added = 0, updated = 0;
    const skipped = [];
    for (const item of activeItems) {
      const externalId = String(item.externalId);
      const existing = byExternalId.get(externalId);
      if (existing) {
        await pool.request()
          .input('id', sql.Int, existing.Id)
          .input('fullName', sql.NVarChar(200), item.fullName || existing.Username)
          .input('department', sql.NVarChar(200), item.department || null)
          .input('position', sql.NVarChar(200), item.position || null)
          .query('UPDATE app.Users SET FullName = @fullName, Department = @department, Position = @position, LastSyncedAt = SYSUTCDATETIME() WHERE Id = @id');
        invalidateUser(existing.Id);
        updated++;
      } else if (usernamesInUse.has(item.username)) {
        skipped.push(`${item.username} (trùng username với tài khoản đã có, ExternalId "${externalId}" chưa từng khớp)`);
      } else {
        await pool.request()
          .input('username', sql.NVarChar(50), item.username)
          .input('fullName', sql.NVarChar(200), item.fullName || item.username)
          .input('department', sql.NVarChar(200), item.department || null)
          .input('position', sql.NVarChar(200), item.position || null)
          .input('externalId', sql.NVarChar(100), externalId)
          .query(`
            INSERT INTO app.Users (Username, PasswordHash, FullName, Department, Position, ExternalId, AuthSource, IsActive, LastSyncedAt)
            VALUES (@username, NULL, @fullName, @department, @position, @externalId, 'hcrcWorkspace', 0, SYSUTCDATETIME())
          `);
        usernamesInUse.add(item.username);
        added++;
      }
    }

    const autoLocked = [];
    for (const row of existingResult.recordset) {
      if (row.ExternalId && row.IsActive && !seenExternalIds.has(row.ExternalId)) {
        await pool.request().input('id', sql.Int, row.Id).query('UPDATE app.Users SET IsActive = 0 WHERE Id = @id');
        invalidateUser(row.Id);
        autoLocked.push(row.Username);
      }
    }

    await pool.request()
      .input('added', sql.Int, added).input('updated', sql.Int, updated).input('autoLocked', sql.Int, autoLocked.length)
      .query(`
        UPDATE app.HcrcWorkspaceSettings
        SET LastSyncAt = SYSUTCDATETIME(), LastSyncStatus = 'SUCCESS', LastSyncError = NULL
        WHERE Id = 1
      `);

    await logAction(req, {
      module: 'Phân quyền', actionType: 'DONG_BO_TAI_KHOAN',
      description: `Đồng bộ tài khoản HCRC Workspace: thêm ${added}, cập nhật ${updated}, tự khoá ${autoLocked.length}${skipped.length ? `, bỏ qua ${skipped.length} (trùng username)` : ''}`
    });
    res.json({ added, updated, autoLocked, skipped });
  } catch (err) {
    if (err.isServiceUnavailable) {
      const pool = await getPool('RP');
      await pool.request().input('error', sql.NVarChar(1000), err.message)
        .query("UPDATE app.HcrcWorkspaceSettings SET LastSyncAt = SYSUTCDATETIME(), LastSyncStatus = 'FAILED', LastSyncError = @error WHERE Id = 1")
        .catch(() => {});
      return res.status(503).json({ error: err.message });
    }
    next(err);
  }
});

module.exports = router;
