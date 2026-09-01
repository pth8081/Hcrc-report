// routes/roles.js — Trang "Phân quyền" > vai trò: CRUD Roles + gán 2 lớp
// quyền (RoleMenuAccess, RoleReportAccess — xem tài liệu kiến trúc, mục 03).
// Vai trò IsSystemRole=1 (Admin) không sửa/xoá được qua route này — luôn đủ
// quyền theo thiết kế, không cần và không nên chỉnh tay.
const express = require('express');
const { sql, getPool } = require('../db');
const { requireAuth, requireMenuAccess, requireSystemRoleActor } = require('../lib/auth');
const { invalidateAll } = require('../lib/permissions');
const { logAction } = require('../lib/auditLog');

const router = express.Router();
router.use(requireAuth, requireMenuAccess('system-permissions'));

async function assertNotSystemRole(pool, roleId, res) {
  const result = await pool.request().input('id', sql.Int, roleId).query('SELECT IsSystemRole FROM app.Roles WHERE Id = @id');
  if (!result.recordset.length) {
    res.status(404).json({ error: 'Không tìm thấy vai trò' });
    return false;
  }
  if (result.recordset[0].IsSystemRole) {
    res.status(400).json({ error: 'Không thể sửa vai trò hệ thống' });
    return false;
  }
  return true;
}

router.get('/', async (req, res, next) => {
  try {
    const pool = await getPool('RP');
    const result = await pool.request().query('SELECT Id, Code, Name, IsSystemRole FROM app.Roles ORDER BY Name');
    res.json(result.recordset);
  } catch (err) { next(err); }
});

router.post('/', async (req, res, next) => {
  try {
    const { code, name } = req.body || {};
    if (!code || !name) return res.status(400).json({ error: 'Thiếu code/name' });
    const pool = await getPool('RP');
    const result = await pool.request()
      .input('code', sql.VarChar(50), code)
      .input('name', sql.NVarChar(200), name)
      .query('INSERT INTO app.Roles (Code, Name) OUTPUT INSERTED.Id VALUES (@code, @name)');
    await logAction(req, { module: 'Phân quyền', actionType: 'TAO_VAI_TRO', targetObject: code, description: `Tạo vai trò "${name}" (${code})` });
    res.status(201).json({ id: result.recordset[0].Id });
  } catch (err) {
    if (err.number === 2627 || err.number === 2601) return res.status(409).json({ error: 'Mã vai trò đã tồn tại' });
    next(err);
  }
});

router.put('/:id', async (req, res, next) => {
  try {
    const pool = await getPool('RP');
    if (!(await assertNotSystemRole(pool, req.params.id, res))) return;
    const { name } = req.body || {};
    await pool.request()
      .input('id', sql.Int, req.params.id)
      .input('name', sql.NVarChar(200), name)
      .query('UPDATE app.Roles SET Name = @name WHERE Id = @id');
    invalidateAll();
    await logAction(req, { module: 'Phân quyền', actionType: 'SUA_VAI_TRO', targetObject: req.params.id, description: `Cập nhật vai trò #${req.params.id}` });
    res.json({ ok: true });
  } catch (err) { next(err); }
});

router.delete('/:id', async (req, res, next) => {
  try {
    const pool = await getPool('RP');
    if (!(await assertNotSystemRole(pool, req.params.id, res))) return;
    await pool.request().input('id', sql.Int, req.params.id).query('DELETE FROM app.Roles WHERE Id = @id');
    invalidateAll();
    await logAction(req, { module: 'Phân quyền', actionType: 'XOA_VAI_TRO', targetObject: req.params.id, description: `Xoá vai trò #${req.params.id}` });
    res.json({ ok: true });
  } catch (err) { next(err); }
});

// Quyền hiện có của một vai trò — dùng để tô sẵn checkbox trên giao diện.
router.get('/:id/access', async (req, res, next) => {
  try {
    const pool = await getPool('RP');
    const menu = await pool.request().input('id', sql.Int, req.params.id)
      .query('SELECT MenuItemId FROM app.RoleMenuAccess WHERE RoleId = @id');
    const reports = await pool.request().input('id', sql.Int, req.params.id)
      .query('SELECT ReportId FROM app.RoleReportAccess WHERE RoleId = @id');
    res.json({
      menuItemIds: menu.recordset.map(r => r.MenuItemId),
      reportIds: reports.recordset.map(r => r.ReportId)
    });
  } catch (err) { next(err); }
});

// Cấp quyền MENU tuỳ ý (kể cả menu 'system-*' khác) — chỉ Admin hệ thống
// thật mới làm được, xem chú thích requireSystemRoleActor trong lib/auth.js
// (chặn đường leo thang qua chính route này).
router.put('/:id/menu-access', requireSystemRoleActor, async (req, res, next) => {
  try {
    const { menuItemIds = [] } = req.body || {};
    const pool = await getPool('RP');
    const tx = new sql.Transaction(pool);
    await tx.begin();
    try {
      await new sql.Request(tx).input('id', sql.Int, req.params.id).query('DELETE FROM app.RoleMenuAccess WHERE RoleId = @id');
      for (const menuItemId of menuItemIds) {
        await new sql.Request(tx)
          .input('id', sql.Int, req.params.id)
          .input('menuItemId', sql.Int, menuItemId)
          .query('INSERT INTO app.RoleMenuAccess (RoleId, MenuItemId) VALUES (@id, @menuItemId)');
      }
      await tx.commit();
    } catch (err) {
      await tx.rollback().catch(() => {});
      throw err;
    }
    invalidateAll();
    await logAction(req, { module: 'Phân quyền', actionType: 'GAN_QUYEN_MENU', targetObject: req.params.id, description: `Cập nhật quyền menu vai trò #${req.params.id}` });
    res.json({ ok: true });
  } catch (err) { next(err); }
});

// Cùng lý do — chỉ Admin hệ thống thật mới cấp quyền BÁO CÁO cho 1 vai trò.
router.put('/:id/report-access', requireSystemRoleActor, async (req, res, next) => {
  try {
    const { reportIds = [] } = req.body || {};
    const pool = await getPool('RP');
    const tx = new sql.Transaction(pool);
    await tx.begin();
    try {
      await new sql.Request(tx).input('id', sql.Int, req.params.id).query('DELETE FROM app.RoleReportAccess WHERE RoleId = @id');
      for (const reportId of reportIds) {
        await new sql.Request(tx)
          .input('id', sql.Int, req.params.id)
          .input('reportId', sql.VarChar(80), reportId)
          .query('INSERT INTO app.RoleReportAccess (RoleId, ReportId) VALUES (@id, @reportId)');
      }
      await tx.commit();
    } catch (err) {
      await tx.rollback().catch(() => {});
      throw err;
    }
    invalidateAll();
    await logAction(req, { module: 'Phân quyền', actionType: 'GAN_QUYEN_BAO_CAO', targetObject: req.params.id, description: `Cập nhật quyền báo cáo vai trò #${req.params.id}` });
    res.json({ ok: true });
  } catch (err) { next(err); }
});

module.exports = router;
