// routes/admin/users.js — Trang "Phân quyền": CRUD admin.AdminUsers. Chỉ
// vai trò admin thao tác được (tạo/sửa/đặt lại mật khẩu); 'viewer' xem được
// danh sách (chỉ không sửa) — 'target_importer' (vai trò hẹp, giao diện đã
// ẩn hẳn trang này khỏi menu) KHÔNG được xem, kể cả gọi thẳng API.
const express = require('express');
const bcrypt = require('bcryptjs');
const { sql, getPool } = require('../../db');
const { requireAdminAuth, requireAdminRole, blockTargetImporter } = require('../../lib/adminAuth');
const { logAction } = require('../../lib/auditLog');

const router = express.Router();
router.use(requireAdminAuth);

router.get('/', blockTargetImporter, async (req, res, next) => {
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
    const id = result.recordset[0].Id;
    await logAction(req, { module: 'Phân quyền', actionType: 'TAO_USER', targetObject: String(id), description: `Tạo tài khoản "${username}" (vai trò ${role})` });
    res.status(201).json({ id });
  } catch (err) {
    if (err.number === 2627 || err.number === 2601) return res.status(409).json({ error: 'Username đã tồn tại' });
    next(err);
  }
});

router.put('/:id', requireAdminRole, async (req, res, next) => {
  try {
    const { fullName, role, isActive } = req.body || {};
    if (!['admin', 'viewer', 'target_importer'].includes(role)) {
      return res.status(400).json({ error: 'role phải là "admin", "viewer" hoặc "target_importer"' });
    }
    const pool = await getPool('ADMIN');
    await pool.request()
      .input('id', sql.Int, req.params.id)
      .input('fullName', sql.NVarChar(200), fullName)
      .input('role', sql.VarChar(20), role)
      .input('isActive', sql.Bit, isActive ? 1 : 0)
      .query('UPDATE admin.AdminUsers SET FullName = @fullName, Role = @role, IsActive = @isActive WHERE Id = @id');
    await logAction(req, { module: 'Phân quyền', actionType: 'SUA_USER', targetObject: req.params.id, description: `Cập nhật tài khoản #${req.params.id} (vai trò ${role}, ${isActive ? 'hoạt động' : 'tắt'})` });
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
    await logAction(req, { module: 'Phân quyền', actionType: 'DAT_LAI_MAT_KHAU', targetObject: req.params.id, description: `Đặt lại mật khẩu tài khoản #${req.params.id}` });
    res.json({ ok: true });
  } catch (err) { next(err); }
});

module.exports = router;
