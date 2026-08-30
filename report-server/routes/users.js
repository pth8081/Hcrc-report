// routes/users.js — Trang "Phân quyền" > danh sách người dùng. Không có route
// XOÁ người dùng — chỉ khoá (IsActive=0) — vì app.AuditLog tham chiếu UserId,
// xoá cứng sẽ mất dấu vết nhật ký của chính người đó đã từng làm gì.
const express = require('express');
const bcrypt = require('bcryptjs');
const { sql, getPool } = require('../db');
const { requireAuth, requireMenuAccess } = require('../lib/auth');
const { invalidateUser } = require('../lib/permissions');
const { logAction } = require('../lib/auditLog');

const router = express.Router();
router.use(requireAuth, requireMenuAccess('system-permissions'));

router.get('/', async (req, res, next) => {
  try {
    const pool = await getPool('RP');
    const users = await pool.request().query(`
      SELECT Id, Username, FullName, Email, IsActive, CreatedAt, LastLoginAt FROM app.Users ORDER BY Username
    `);
    const roles = await pool.request().query(`
      SELECT ur.UserId, r.Id AS RoleId, r.Code, r.Name
      FROM app.UserRoles ur JOIN app.Roles r ON ur.RoleId = r.Id
    `);
    const rolesByUser = new Map();
    for (const r of roles.recordset) {
      if (!rolesByUser.has(r.UserId)) rolesByUser.set(r.UserId, []);
      rolesByUser.get(r.UserId).push({ id: r.RoleId, code: r.Code, name: r.Name });
    }
    res.json(users.recordset.map(u => ({ ...u, roles: rolesByUser.get(u.Id) || [] })));
  } catch (err) { next(err); }
});

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
        INSERT INTO app.Users (Username, PasswordHash, FullName, Email)
        OUTPUT INSERTED.Id
        VALUES (@username, @passwordHash, @fullName, @email)
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
    const { fullName, email, isActive } = req.body || {};
    const pool = await getPool('RP');
    await pool.request()
      .input('id', sql.Int, req.params.id)
      .input('fullName', sql.NVarChar(200), fullName)
      .input('email', sql.NVarChar(200), email || null)
      .input('isActive', sql.Bit, isActive ? 1 : 0)
      .query('UPDATE app.Users SET FullName = @fullName, Email = @email, IsActive = @isActive WHERE Id = @id');
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

router.put('/:id/roles', async (req, res, next) => {
  try {
    const { roleIds = [] } = req.body || {};
    const pool = await getPool('RP');
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

module.exports = router;
