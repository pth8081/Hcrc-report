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
    const domains = await pool.request().input('id', sql.Int, req.params.id)
      .query('SELECT Domain FROM app.RoleDomainAccess WHERE RoleId = @id');
    const dashboardGroups = await pool.request().input('id', sql.Int, req.params.id)
      .query('SELECT DashboardId, GroupKey, CanView, CanExport FROM app.RoleDashboardGroupAccess WHERE RoleId = @id');
    res.json({
      menuItemIds: menu.recordset.map(r => r.MenuItemId),
      reportIds: reports.recordset.map(r => r.ReportId),
      domains: domains.recordset.map(r => r.Domain),
      dashboardGroupAccess: dashboardGroups.recordset.map(r => ({
        dashboardId: r.DashboardId, groupKey: r.GroupKey, canView: !!r.CanView, canExport: !!r.CanExport
      }))
    });
  } catch (err) { next(err); }
});

// Toàn bộ "nhóm" (tile.group/groupLabel/groupIcon, bản 8.42) đang có trên
// MỌI dashboard — nguồn liệt kê cho checkbox "Dashboard được xem (theo
// nhóm)" bên dưới. Nhóm sống trong DefinitionJson.tiles (không phải bảng
// danh mục riêng) nên phải ĐỌC + QUÉT JSON của từng dashboard ở đây, không
// SELECT thẳng được như report-catalog/domains-catalog bên dưới.
router.get('/dashboard-groups-catalog', async (req, res, next) => {
  try {
    const pool = await getPool('RP');
    const result = await pool.request().query('SELECT DashboardId, Title, DefinitionJson FROM app.Dashboards WHERE IsActive = 1');
    const groups = [];
    const seen = new Set();
    for (const row of result.recordset) {
      let definition;
      try { definition = JSON.parse(row.DefinitionJson); } catch { continue; }
      for (const tile of definition.tiles || []) {
        if (!tile.group) continue;
        const dedupeKey = `${row.DashboardId}::${tile.group}`;
        if (seen.has(dedupeKey)) continue;
        seen.add(dedupeKey);
        groups.push({
          dashboardId: row.DashboardId, dashboardTitle: row.Title,
          groupKey: tile.group, groupLabel: tile.groupLabel || tile.group, groupIcon: tile.groupIcon || ''
        });
      }
    }
    res.json(groups);
  } catch (err) { next(err); }
});

// Danh sách báo cáo (chỉ ReportId+Title) CHO MỤC ĐÍCH TICK CHỌN ở màn "Gán
// quyền" bên dưới — route RIÊNG, chỉ cần menu 'system-permissions' (đang bảo
// vệ chính trang Vai trò), KHÔNG dùng chung GET /system/report-catalog
// (routes/reportCatalog.js — đòi thêm menu 'system-report-catalog' để quản
// trị danh mục báo cáo, mục đích khác hẳn). Thiếu route riêng này trước đây
// khiến 1 vai trò được giao đúng CHỦ ĐÍCH "chỉ quản lý Phân quyền, không cần
// là Admin hệ thống" (xem lib/auth.js:264-274) không tải được danh sách báo
// cáo để tick — mirror đúng cách domains-catalog bên dưới đã làm.
router.get('/report-catalog', async (req, res, next) => {
  try {
    const pool = await getPool('RP');
    const result = await pool.request().query('SELECT ReportId, Title FROM app.ReportCatalog ORDER BY Title');
    res.json(result.recordset);
  } catch (err) { next(err); }
});

// Toàn bộ Domain THẬT đang có trong Data Warehouse — nguồn liệt kê cho
// checkbox "Báo cáo tự do" bên dưới (KHÁC app.ReportCatalog.Domain, chỉ là
// nhãn mô tả — đây đọc thẳng dwh.ReportFacts, đúng Domain có thể tự khám
// phá được).
router.get('/domains-catalog', async (req, res, next) => {
  try {
    const dwhPool = await getPool('DWH');
    const result = await dwhPool.request().query('SELECT DISTINCT Domain FROM dwh.ReportFacts ORDER BY Domain');
    res.json(result.recordset.map(r => r.Domain));
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

// Ma trận phân quyền báo cáo (bản 8.94, theo yêu cầu người dùng) — TOÀN BỘ
// Vai trò × Báo cáo + quyền hiện có trong 1 lần gọi, thay vì phải mở từng
// Vai trò một (GET /:id/access ở trên) mới thấy được quyền của riêng vai
// trò đó. Dùng để vẽ bảng lưới (hàng=Vai trò, cột=Báo cáo) ở giao diện
// "Ma trận phân quyền". KHÔNG thêm route ghi riêng — lưu vẫn dùng LẠI
// PUT /:id/report-access đã có (gửi nguyên mảng reportIds đầy đủ của đúng
// 1 hàng vừa đổi), tránh viết trùng logic transaction DELETE+INSERT.
router.get('/access-matrix', async (req, res, next) => {
  try {
    const pool = await getPool('RP');
    const roles = await pool.request().query('SELECT Id, Code, Name, IsSystemRole FROM app.Roles ORDER BY Name');
    const reports = await pool.request().query('SELECT ReportId, Title, Domain FROM app.ReportCatalog ORDER BY Domain, Title');
    const access = await pool.request().query('SELECT RoleId, ReportId FROM app.RoleReportAccess');
    const accessByRole = {};
    for (const row of access.recordset) {
      (accessByRole[row.RoleId] ||= []).push(row.ReportId);
    }
    res.json({
      roles: roles.recordset.map(r => ({ id: r.Id, code: r.Code, name: r.Name, isSystemRole: !!r.IsSystemRole })),
      reports: reports.recordset.map(r => ({ reportId: r.ReportId, title: r.Title, domain: r.Domain || '' })),
      access: accessByRole
    });
  } catch (err) { next(err); }
});

// Mirror access-matrix ở trên nhưng cho Dashboard (theo nhóm, bản 8.42) —
// dùng chung dashboard-groups-catalog đã có, chỉ thêm phần quyền hiện có
// của MỌI vai trò trong 1 lần gọi. Lưu vẫn dùng LẠI
// PUT /:id/dashboard-group-access đã có.
router.get('/dashboard-access-matrix', async (req, res, next) => {
  try {
    const pool = await getPool('RP');
    const roles = await pool.request().query('SELECT Id, Code, Name, IsSystemRole FROM app.Roles ORDER BY Name');
    const access = await pool.request().query('SELECT RoleId, DashboardId, GroupKey, CanView, CanExport FROM app.RoleDashboardGroupAccess');
    const accessByRole = {};
    for (const row of access.recordset) {
      const key = `${row.DashboardId}::${row.GroupKey}`;
      (accessByRole[row.RoleId] ||= {})[key] = { canView: !!row.CanView, canExport: !!row.CanExport };
    }
    res.json({
      roles: roles.recordset.map(r => ({ id: r.Id, code: r.Code, name: r.Name, isSystemRole: !!r.IsSystemRole })),
      access: accessByRole
    });
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

// Cùng lý do — chỉ Admin hệ thống thật mới cấp quyền tự khám phá DOMAIN cho
// 1 vai trò (Báo cáo tự do, xem routes/adhocReports.js).
router.put('/:id/domain-access', requireSystemRoleActor, async (req, res, next) => {
  try {
    const { domains = [] } = req.body || {};
    const pool = await getPool('RP');
    const tx = new sql.Transaction(pool);
    await tx.begin();
    try {
      await new sql.Request(tx).input('id', sql.Int, req.params.id).query('DELETE FROM app.RoleDomainAccess WHERE RoleId = @id');
      for (const domain of domains) {
        await new sql.Request(tx)
          .input('id', sql.Int, req.params.id)
          .input('domain', sql.VarChar(50), domain)
          .query('INSERT INTO app.RoleDomainAccess (RoleId, Domain) VALUES (@id, @domain)');
      }
      await tx.commit();
    } catch (err) {
      await tx.rollback().catch(() => {});
      throw err;
    }
    invalidateAll();
    await logAction(req, { module: 'Phân quyền', actionType: 'GAN_QUYEN_DOMAIN', targetObject: req.params.id, description: `Cập nhật quyền Domain (Báo cáo tự do) vai trò #${req.params.id}` });
    res.json({ ok: true });
  } catch (err) { next(err); }
});

// Cùng lý do — chỉ Admin hệ thống thật mới cấp quyền Dashboard THEO NHÓM
// cho 1 vai trò (bản 8.43). entries: [{dashboardId, groupKey, canView, canExport}].
// Xoá-ghi-lại TOÀN BỘ (giống 3 route quyền khác ở trên) — chỉ ghi dòng có
// canView HOẶC canExport (bỏ dòng cả 2 đều false, tương đương "không cấp",
// tránh rác vô nghĩa trong bảng).
router.put('/:id/dashboard-group-access', requireSystemRoleActor, async (req, res, next) => {
  try {
    const { entries = [] } = req.body || {};
    const pool = await getPool('RP');
    const tx = new sql.Transaction(pool);
    await tx.begin();
    try {
      await new sql.Request(tx).input('id', sql.Int, req.params.id).query('DELETE FROM app.RoleDashboardGroupAccess WHERE RoleId = @id');
      for (const entry of entries) {
        if (!entry?.dashboardId || !entry?.groupKey || (!entry.canView && !entry.canExport)) continue;
        await new sql.Request(tx)
          .input('id', sql.Int, req.params.id)
          .input('dashboardId', sql.VarChar(80), entry.dashboardId)
          .input('groupKey', sql.VarChar(80), entry.groupKey)
          .input('canView', sql.Bit, entry.canView ? 1 : 0)
          .input('canExport', sql.Bit, entry.canExport ? 1 : 0)
          .query(`
            INSERT INTO app.RoleDashboardGroupAccess (RoleId, DashboardId, GroupKey, CanView, CanExport)
            VALUES (@id, @dashboardId, @groupKey, @canView, @canExport)
          `);
      }
      await tx.commit();
    } catch (err) {
      await tx.rollback().catch(() => {});
      throw err;
    }
    invalidateAll();
    await logAction(req, { module: 'Phân quyền', actionType: 'GAN_QUYEN_DASHBOARD', targetObject: req.params.id, description: `Cập nhật quyền Dashboard theo nhóm vai trò #${req.params.id}` });
    res.json({ ok: true });
  } catch (err) { next(err); }
});

module.exports = router;
