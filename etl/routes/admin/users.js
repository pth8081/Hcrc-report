// routes/admin/users.js — Trang "Phân quyền": CRUD admin.AdminUsers. Chỉ
// vai trò admin thao tác được (tạo/sửa/đặt lại mật khẩu); ai đăng nhập cũng
// xem được danh sách.
const express = require('express');
const bcrypt = require('bcryptjs');
const { sql, getPool } = require('../../db');
const { requireAdminAuth, requireAdminRole } = require('../../lib/adminAuth');

const router = express.Router();
router.use(requireAdminAuth);

router.get('/', async (req, res, next) => {
  try {
    const pool = await getPool('ADMIN');
    const result = await pool.request().query(`
      SELECT Id, Username, FullName, Role, IsActive, CreatedAt, LastLoginAt FROM admin.AdminUsers ORDER BY Username
    `);
    res.json(result.recordset);
  } catch (err) { next(err); }
});

router.post('/', requireAdminRole, async (req, res, next) => {
  try {
    const { username, password, fullName, role = 'viewer' } = req.body || {};
    if (!username || !password || !fullName) return res.status(400).json({ error: 'Thiếu username/password/fullName' });
    if (!['admin', 'viewer'].includes(role)) return res.status(400).json({ error: 'role phải là "admin" hoặc "viewer"' });

    const passwordHash = await bcrypt.hash(password, 10);
    const pool = await getPool('ADMIN');
    const result = await pool.request()
      .input('username', sql.NVarChar(50), username)
      .input('passwordHash', sql.NVarChar(200), passwordHash)
      .input('fullName', sql.NVarChar(200), fullName)
      .input('role', sql.VarChar(20), role)
      .query(`
        INSERT INTO admin.AdminUsers (Username, PasswordHash, FullName, Role)
        OUTPUT INSERTED.Id
        VALUES (@username, @passwordHash, @fullName, @role)
      `);
    res.status(201).json({ id: result.recordset[0].Id });
  } catch (err) {
    if (err.number === 2627 || err.number === 2601) return res.status(409).json({ error: 'Username đã tồn tại' });
    next(err);
  }
});

router.put('/:id', requireAdminRole, async (req, res, next) => {
  try {
    const { fullName, role, isActive } = req.body || {};
    const pool = await getPool('ADMIN');
    await pool.request()
      .input('id', sql.Int, req.params.id)
      .input('fullName', sql.NVarChar(200), fullName)
      .input('role', sql.VarChar(20), role)
      .input('isActive', sql.Bit, isActive ? 1 : 0)
      .query('UPDATE admin.AdminUsers SET FullName = @fullName, Role = @role, IsActive = @isActive WHERE Id = @id');
    res.json({ ok: true });
  } catch (err) { next(err); }
});

router.post('/:id/reset-password', requireAdminRole, async (req, res, next) => {
  try {
    const { password } = req.body || {};
    if (!password) return res.status(400).json({ error: 'Thiếu password' });
    const passwordHash = await bcrypt.hash(password, 10);
    const pool = await getPool('ADMIN');
    await pool.request()
      .input('id', sql.Int, req.params.id)
      .input('passwordHash', sql.NVarChar(200), passwordHash)
      .query('UPDATE admin.AdminUsers SET PasswordHash = @passwordHash WHERE Id = @id');
    res.json({ ok: true });
  } catch (err) { next(err); }
});

module.exports = router;
