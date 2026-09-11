// routes/admin/roles.js — Trang "Vai trò": CRUD admin.Roles + gán quyền
// menu (admin.RoleMenuAccess, kèm cờ CanEdit — xem etl-db/schema.sql) mirror
// rp-server/routes/roles.js. Vai trò IsSystemRole=1 (admin) không sửa/xoá/
// gán lại quyền được qua route này — luôn đủ mọi quyền theo thiết kế.
// MenuCode ở etl là danh sách CỐ ĐỊNH khai trong code (không có bảng
// MenuItems riêng như rp-db — số trang ít, không có CRUD thêm trang mới).
const express = require('express');
const { sql, getPool } = require('../../db');
const { requireAdminAuth } = require('../../lib/adminAuth');
const { requireMenuAccess, requireSystemRoleActor, invalidateAll } = require('../../lib/adminPermissions');
const { logAction } = require('../../lib/auditLog');

const router = express.Router();
router.use(requireAdminAuth, requireMenuAccess('roles'));

// Danh sách MenuCode hợp lệ — dùng để giao diện tự vẽ checkbox, không cần
// gõ tay. CHỈ liệt kê đúng các trang đã gắn requireMenuAccess/requireMenuEdit
// thật trong routes/admin/*.js (xem báo cáo khảo sát khi xây tính năng này).
const MENU_CATALOG = [
  { code: 'dashboard', label: 'Bảng điều khiển' },
  { code: 'data-sources', label: 'Nguồn dữ liệu' },
  { code: 'sync-jobs', label: 'Đồng bộ dữ liệu' },
  { code: 'branch-code-map', label: 'Ánh xạ mã chi nhánh' },
  { code: 'sales-targets', label: 'Nhập chỉ tiêu' },
  { code: 'log', label: 'Nhật ký đồng bộ' },
  { code: 'audit-log', label: 'Nhật ký thao tác' },
  { code: 'users', label: 'Phân quyền' },
  { code: 'roles', label: 'Vai trò' }
];

async function assertNotSystemRole(pool, roleId, res) {
  const result = await pool.request().input('id', sql.Int, roleId).query('SELECT IsSystemRole FROM admin.Roles WHERE Id = @id');
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

router.get('/menu-catalog', (req, res) => res.json(MENU_CATALOG));

router.get('/', async (req, res, next) => {
  try {
    const pool = await getPool('ADMIN');
    const result = await pool.request().query('SELECT Id, Code, Name, IsSystemRole FROM admin.Roles ORDER BY Name');
    res.json(result.recordset);
  } catch (err) { next(err); }
});

router.post('/', async (req, res, next) => {
  try {
    const { code, name } = req.body || {};
    if (!code || !name) return res.status(400).json({ error: 'Thiếu code/name' });
    const pool = await getPool('ADMIN');
    const result = await pool.request()
      .input('code', sql.VarChar(50), code)
      .input('name', sql.NVarChar(200), name)
      .query('INSERT INTO admin.Roles (Code, Name) OUTPUT INSERTED.Id VALUES (@code, @name)');
    await logAction(req, { module: 'Vai trò', actionType: 'TAO_VAI_TRO', targetObject: code, description: `Tạo vai trò "${name}" (${code})` });
    res.status(201).json({ id: result.recordset[0].Id });
  } catch (err) {
    if (err.number === 2627 || err.number === 2601) return res.status(409).json({ error: 'Mã vai trò đã tồn tại' });
    next(err);
  }
});

router.put('/:id', async (req, res, next) => {
  try {
    const pool = await getPool('ADMIN');
    if (!(await assertNotSystemRole(pool, req.params.id, res))) return;
    const { name } = req.body || {};
    await pool.request()
      .input('id', sql.Int, req.params.id)
      .input('name', sql.NVarChar(200), name)
      .query('UPDATE admin.Roles SET Name = @name WHERE Id = @id');
    invalidateAll();
    await logAction(req, { module: 'Vai trò', actionType: 'SUA_VAI_TRO', targetObject: req.params.id, description: `Cập nhật vai trò #${req.params.id}` });
    res.json({ ok: true });
  } catch (err) { next(err); }
});

router.delete('/:id', async (req, res, next) => {
  try {
    const pool = await getPool('ADMIN');
    if (!(await assertNotSystemRole(pool, req.params.id, res))) return;
    await pool.request().input('id', sql.Int, req.params.id).query('DELETE FROM admin.Roles WHERE Id = @id');
    invalidateAll();
    await logAction(req, { module: 'Vai trò', actionType: 'XOA_VAI_TRO', targetObject: req.params.id, description: `Xoá vai trò #${req.params.id}` });
    res.json({ ok: true });
  } catch (err) { next(err); }
});

// Quyền hiện có của một vai trò — dùng để tô sẵn checkbox trên giao diện.
router.get('/:id/access', async (req, res, next) => {
  try {
    const pool = await getPool('ADMIN');
    const result = await pool.request().input('id', sql.Int, req.params.id)
      .query('SELECT MenuCode, CanEdit FROM admin.RoleMenuAccess WHERE RoleId = @id');
    res.json({ menuAccess: result.recordset.map(r => ({ menuCode: r.MenuCode, canEdit: !!r.CanEdit })) });
  } catch (err) { next(err); }
});

// Cấp quyền MENU (kèm CanEdit) tuỳ ý cho 1 vai trò — chỉ vai trò hệ thống
// thật mới làm được, chặn đường leo thang: 1 tài khoản chỉ có menu 'roles'
// không thể tự cấp thêm quyền cho vai trò của chính mình (mirror
// rp-server/routes/roles.js, requireSystemRoleActor).
router.put('/:id/menu-access', requireSystemRoleActor, async (req, res, next) => {
  try {
    const { menuAccess = [] } = req.body || {};
    const pool = await getPool('ADMIN');
    const tx = new sql.Transaction(pool);
    await tx.begin();
    try {
      await new sql.Request(tx).input('id', sql.Int, req.params.id).query('DELETE FROM admin.RoleMenuAccess WHERE RoleId = @id');
      for (const entry of menuAccess) {
        await new sql.Request(tx)
          .input('id', sql.Int, req.params.id)
          .input('menuCode', sql.VarChar(50), entry.menuCode)
          .input('canEdit', sql.Bit, entry.canEdit ? 1 : 0)
          .query('INSERT INTO admin.RoleMenuAccess (RoleId, MenuCode, CanEdit) VALUES (@id, @menuCode, @canEdit)');
      }
      await tx.commit();
    } catch (err) {
      await tx.rollback().catch(() => {});
      throw err;
    }
    invalidateAll();
    await logAction(req, { module: 'Vai trò', actionType: 'GAN_QUYEN_MENU', targetObject: req.params.id, description: `Cập nhật quyền menu vai trò #${req.params.id}` });
    res.json({ ok: true });
  } catch (err) { next(err); }
});

module.exports = router;
