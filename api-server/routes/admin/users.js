// routes/admin/users.js — Trang "Phân quyền" (api-admin/): CRUD
// admin.AdminUsers + gán nhóm quyền (admin.AdminUserRoles, xem
// routes/admin/roles.js) — thay mô hình 2 Role cố định cũ ('admin'/'viewer').
// TRƯỚC ĐÂY route này chỉ có xem danh sách + "Đặt lại 2FA" (tạo/sửa tài
// khoản phải chạy tay scripts/seedAdmin.js) — nay đủ create/edit/lock/gán
// vai trò qua UI, mirror etl/routes/admin/users.js. requireMenuEdit('users')
// cho thao tác tài khoản THÔNG THƯỜNG (tạo/sửa/khoá/đặt lại mật khẩu — CÓ
// THỂ giao cho 1 tài khoản không phải vai trò hệ thống); requireSystemRoleActor
// CHẶT hơn cho thao tác NHẠY CẢM (gán vai trò, đặt lại 2FA) — chặn đường leo
// thang: 1 tài khoản chỉ có menu 'users' có thể tự tạo vai trò hệ thống rồi
// gán cho chính mình nếu không chặn riêng (mirror rp-server/routes/users.js).
const express = require('express');
const bcrypt = require('bcryptjs');
const { sql, getPool } = require('../../db');
const { requireAdminAuth } = require('../../lib/adminAuth');
const { requireMenuAccess, requireMenuEdit, requireSystemRoleActor, getAdminContext, invalidateUser } = require('../../lib/adminPermissions');
const { revokeSessions } = require('../../lib/sessionRevocation');
const { logAction } = require('../../lib/auditLog');

const router = express.Router();
router.use(requireAdminAuth);

router.get('/', requireMenuAccess('users'), async (req, res, next) => {
  try {
    const pool = await getPool('ADMIN');
    const users = await pool.request().query(`
      SELECT Id, Username, FullName, IsActive, TwoFactorEnabled, CreatedAt, LastLoginAt FROM admin.AdminUsers ORDER BY Username
    `);
    const roles = await pool.request().query(`
      SELECT aur.AdminUserId, r.Id AS RoleId, r.Code, r.Name, r.IsSystemRole
      FROM admin.AdminUserRoles aur JOIN admin.Roles r ON aur.RoleId = r.Id
    `);
    const rolesByUser = new Map();
    for (const r of roles.recordset) {
      if (!rolesByUser.has(r.AdminUserId)) rolesByUser.set(r.AdminUserId, []);
      rolesByUser.get(r.AdminUserId).push({ id: r.RoleId, code: r.Code, name: r.Name, isSystemRole: !!r.IsSystemRole });
    }
    res.json(users.recordset.map(u => ({ ...u, roles: rolesByUser.get(u.Id) || [] })));
  } catch (err) { next(err); }
});

// Tạo tài khoản CHƯA gán vai trò nào (không thấy trang nào cho tới khi được
// gán qua PUT /:id/roles bên dưới) — bỏ hẳn dropdown Role cố định cũ, cột
// AdminUsers.Role giữ giá trị DEFAULT ('viewer') chỉ để hiển thị/lịch sử,
// không còn quyết định quyền (xem api-db/schema.sql).
router.post('/', requireMenuEdit('users'), async (req, res, next) => {
  try {
    const { username, password, fullName } = req.body || {};
    if (!username || !password || !fullName) return res.status(400).json({ error: 'Thiếu username/password/fullName' });

    const passwordHash = await bcrypt.hash(password, 10);
    const pool = await getPool('ADMIN');
    const result = await pool.request()
      .input('username', sql.NVarChar(50), username)
      .input('passwordHash', sql.NVarChar(200), passwordHash)
      .input('fullName', sql.NVarChar(200), fullName)
      .query(`
        INSERT INTO admin.AdminUsers (Username, PasswordHash, FullName)
        OUTPUT INSERTED.Id
        VALUES (@username, @passwordHash, @fullName)
      `);
    const id = result.recordset[0].Id;
    await logAction(req, { module: 'Phân quyền', actionType: 'TAO_USER', targetObject: String(id), description: `Tạo tài khoản "${username}" (chưa gán vai trò)` });
    res.status(201).json({ id });
  } catch (err) {
    if (err.number === 2627 || err.number === 2601) return res.status(409).json({ error: 'Username đã tồn tại' });
    next(err);
  }
});

router.put('/:id', requireMenuEdit('users'), async (req, res, next) => {
  try {
    const { fullName, isActive } = req.body || {};
    const pool = await getPool('ADMIN');
    await pool.request()
      .input('id', sql.Int, req.params.id)
      .input('fullName', sql.NVarChar(200), fullName)
      .input('isActive', sql.Bit, isActive ? 1 : 0)
      .query('UPDATE admin.AdminUsers SET FullName = @fullName, IsActive = @isActive WHERE Id = @id');
    invalidateUser(parseInt(req.params.id, 10));
    // Khoá tài khoản (isActive=false) — thu hồi NGAY phiên đăng nhập đang có
    // (nếu có), không đợi token tự hết hạn — xem lib/sessionRevocation.js.
    if (!isActive) await revokeSessions(parseInt(req.params.id, 10));
    await logAction(req, { module: 'Phân quyền', actionType: 'SUA_USER', targetObject: req.params.id, description: `Cập nhật tài khoản #${req.params.id} (${isActive ? 'hoạt động' : 'khoá'})` });
    res.json({ ok: true });
  } catch (err) { next(err); }
});

// Gán/đổi vai trò của 1 tài khoản — thao tác NHẠY CẢM, xem chú thích đầu
// file (requireSystemRoleActor, không phải chỉ requireMenuEdit('users')).
router.put('/:id/roles', requireSystemRoleActor, async (req, res, next) => {
  try {
    const { roleIds = [] } = req.body || {};
    const pool = await getPool('ADMIN');
    const tx = new sql.Transaction(pool);
    await tx.begin();
    try {
      await new sql.Request(tx).input('id', sql.Int, req.params.id).query('DELETE FROM admin.AdminUserRoles WHERE AdminUserId = @id');
      for (const roleId of roleIds) {
        await new sql.Request(tx)
          .input('id', sql.Int, req.params.id)
          .input('roleId', sql.Int, roleId)
          .query('INSERT INTO admin.AdminUserRoles (AdminUserId, RoleId) VALUES (@id, @roleId)');
      }
      await tx.commit();
    } catch (err) {
      await tx.rollback().catch(() => {});
      throw err;
    }
    invalidateUser(parseInt(req.params.id, 10));
    await logAction(req, { module: 'Phân quyền', actionType: 'GAN_VAI_TRO', targetObject: req.params.id, description: `Cập nhật vai trò tài khoản #${req.params.id}` });
    res.json({ ok: true });
  } catch (err) { next(err); }
});

router.post('/:id/reset-password', requireMenuEdit('users'), async (req, res, next) => {
  try {
    const { password } = req.body || {};
    if (!password) return res.status(400).json({ error: 'Thiếu password' });
    const passwordHash = await bcrypt.hash(password, 10);
    const pool = await getPool('ADMIN');
    await pool.request()
      .input('id', sql.Int, req.params.id)
      .input('passwordHash', sql.NVarChar(200), passwordHash)
      .query('UPDATE admin.AdminUsers SET PasswordHash = @passwordHash WHERE Id = @id');
    // Đổi mật khẩu -> thu hồi NGAY phiên đăng nhập cũ (xem lib/sessionRevocation.js).
    await revokeSessions(parseInt(req.params.id, 10));
    await logAction(req, { module: 'Phân quyền', actionType: 'DAT_LAI_MAT_KHAU', targetObject: req.params.id, description: `Đặt lại mật khẩu tài khoản #${req.params.id}` });
    res.json({ ok: true });
  } catch (err) { next(err); }
});

// "Đặt lại 2FA" — 1 admin gỡ 2FA giúp admin KHÁC bị mất thiết bị/cần khôi
// phục (xem lib/twoFactor.js). Xoá sạch secret + mã khôi phục cũ — lần đăng
// nhập kế tiếp của tài khoản đó bị bắt đăng ký 2FA lại từ đầu trước khi vào
// được gì khác (2FA vẫn BẮT BUỘC, không phải "tắt hẳn"). Thao tác NHẠY CẢM
// (bỏ lớp bảo vệ thứ 2 của người khác) — LUÔN ghi audit log rõ ai gỡ cho ai.
router.post('/:id/reset-2fa', requireSystemRoleActor, async (req, res, next) => {
  try {
    const pool = await getPool('ADMIN');
    const targetResult = await pool.request().input('id', sql.Int, req.params.id)
      .query('SELECT Username FROM admin.AdminUsers WHERE Id = @id');
    const target = targetResult.recordset[0];
    if (!target) return res.status(404).json({ error: 'Không tìm thấy tài khoản' });
    const targetContext = await getAdminContext(parseInt(req.params.id, 10));
    if (!targetContext?.isSystemRole) return res.status(400).json({ error: '2FA chỉ áp dụng cho vai trò hệ thống' });

    await pool.request().input('id', sql.Int, req.params.id)
      .query('UPDATE admin.AdminUsers SET TwoFactorEnabled = 0, TwoFactorSecretEncrypted = NULL, TwoFactorEnrolledAt = NULL WHERE Id = @id');
    await pool.request().input('id', sql.Int, req.params.id)
      .query('DELETE FROM admin.AdminTwoFactorRecoveryCodes WHERE AdminUserId = @id');
    // Gỡ 2FA -> thu hồi NGAY phiên đăng nhập cũ (xem lib/sessionRevocation.js).
    await revokeSessions(parseInt(req.params.id, 10));

    await logAction(req, {
      module: 'Phân quyền', actionType: 'DAT_LAI_2FA', targetObject: req.params.id,
      description: `Đặt lại 2FA cho tài khoản "${target.Username}" (#${req.params.id}) — lần đăng nhập kế tiếp phải đăng ký lại`
    });
    res.json({ ok: true });
  } catch (err) { next(err); }
});

module.exports = router;
