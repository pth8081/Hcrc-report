// routes/admin/voucherSettings.js — Trang "Cấu hình Voucher": DANH SÁCH
// (bản 9.59, theo yêu cầu người dùng — nhiều máy chủ DSMART khác nhau, vd
// thêm chi nhánh "Fuji") — TRƯỚC ĐÂY chỉ 1 dòng DUY NHẤT (Id=1). Mỗi dòng
// CHỈ chọn "Nguồn dữ liệu" (api.DataSources) nào trỏ DSMART16 Live cho
// lib/voucherRedeemService.js — ConfigKey dùng THẲNG trên URL
// (POST /api/v1/vouchers/:configKey/redeem — xem routes/v1/vouchers.js),
// KHÔNG đổi được sau khi tạo (đối tác đã cấu hình gọi theo đúng URL đó).
// Bảng/cột (PMCRDINF/BARCODE/STATUS...) CỐ ĐỊNH trong code, không cấu hình
// ở đây — xem lib/voucherRedeemService.js.
const express = require('express');
const { sql, getPool } = require('../../db');
const { requireAdminAuth } = require('../../lib/adminAuth');
const { requireMenuAccess, requireMenuEdit } = require('../../lib/adminPermissions');
const { logAction } = require('../../lib/auditLog');

const router = express.Router();
router.use(requireAdminAuth, requireMenuAccess('voucher-settings'));

const CONFIG_KEY_RE = /^[a-z0-9-]{1,50}$/; // cùng quy ước Endpoint (api.RealtimeEndpointDefs) — chữ thường/số/gạch ngang, dùng thẳng trên URL
const DEFAULT_CONFIG_KEY = 'default'; // cứng trong routes/v1/vouchers.js (route KHÔNG :configKey) — không được đổi/xoá

router.get('/', async (req, res, next) => {
  try {
    const pool = await getPool('ADMIN');
    const result = await pool.request().query(`
      SELECT vs.ConfigKey, vs.Name, vs.DataSourceId, ds.Name AS DataSourceName
      FROM api.VoucherSettings vs
      LEFT JOIN api.DataSources ds ON ds.Id = vs.DataSourceId
      ORDER BY CASE WHEN vs.ConfigKey = 'default' THEN 0 ELSE 1 END, vs.Name
    `);
    res.json(result.recordset);
  } catch (err) { next(err); }
});

async function assertDataSourceActive(pool, dataSourceId) {
  if (!dataSourceId) return;
  const check = await pool.request().input('id', sql.Int, dataSourceId).query('SELECT 1 FROM api.DataSources WHERE Id = @id AND IsActive = 1');
  if (!check.recordset.length) throw Object.assign(new Error('Nguồn dữ liệu không tồn tại hoặc đã tắt'), { status: 400 });
}

router.post('/', requireMenuEdit('voucher-settings'), async (req, res, next) => {
  try {
    const { configKey, name, dataSourceId } = req.body || {};
    if (!configKey || !CONFIG_KEY_RE.test(configKey)) {
      return res.status(400).json({ error: 'ConfigKey chỉ gồm chữ thường/số/gạch ngang, tối đa 50 ký tự' });
    }
    if (!name) return res.status(400).json({ error: 'Thiếu tên hiển thị' });

    const pool = await getPool('ADMIN');
    try {
      await assertDataSourceActive(pool, dataSourceId);
    } catch (err) {
      if (err.status) return res.status(err.status).json({ error: err.message });
      throw err;
    }

    const existing = await pool.request().input('configKey', sql.VarChar(50), configKey).query('SELECT 1 FROM api.VoucherSettings WHERE ConfigKey = @configKey');
    if (existing.recordset.length) return res.status(400).json({ error: `ConfigKey "${configKey}" đã tồn tại` });

    await pool.request()
      .input('configKey', sql.VarChar(50), configKey)
      .input('name', sql.NVarChar(200), name)
      .input('dataSourceId', sql.Int, dataSourceId || null)
      .query('INSERT INTO api.VoucherSettings (ConfigKey, Name, DataSourceId) VALUES (@configKey, @name, @dataSourceId)');

    await logAction(req, { module: 'Cấu hình Voucher', actionType: 'TAO_MOI', targetObject: configKey, description: `Tạo cấu hình Voucher "${configKey}" (${name})` });
    res.status(201).json({ ok: true });
  } catch (err) { next(err); }
});

router.put('/:configKey', requireMenuEdit('voucher-settings'), async (req, res, next) => {
  try {
    const { name, dataSourceId } = req.body || {};
    if (!name) return res.status(400).json({ error: 'Thiếu tên hiển thị' });

    const pool = await getPool('ADMIN');
    try {
      await assertDataSourceActive(pool, dataSourceId);
    } catch (err) {
      if (err.status) return res.status(err.status).json({ error: err.message });
      throw err;
    }

    const result = await pool.request()
      .input('configKey', sql.VarChar(50), req.params.configKey)
      .input('name', sql.NVarChar(200), name)
      .input('dataSourceId', sql.Int, dataSourceId || null)
      .query('UPDATE api.VoucherSettings SET Name = @name, DataSourceId = @dataSourceId WHERE ConfigKey = @configKey');
    if (!result.rowsAffected[0]) return res.status(404).json({ error: 'Không tìm thấy cấu hình' });

    await logAction(req, { module: 'Cấu hình Voucher', actionType: 'CAP_NHAT', targetObject: req.params.configKey, description: `Cập nhật cấu hình Voucher "${req.params.configKey}" (${name})` });
    res.json({ ok: true });
  } catch (err) { next(err); }
});

router.delete('/:configKey', requireMenuEdit('voucher-settings'), async (req, res, next) => {
  try {
    // 'default' BẮT BUỘC luôn tồn tại — routes/v1/vouchers.js:/check,/redeem
    // (KHÔNG :configKey, hành vi CŨ cho đối tác hiện tại) LUÔN trỏ vào đúng
    // dòng này, xoá đi là app voucher hiện tại mất kết nối ngay lập tức.
    if (req.params.configKey === DEFAULT_CONFIG_KEY) {
      return res.status(400).json({ error: `Không thể xoá cấu hình "${DEFAULT_CONFIG_KEY}" — API /vouchers/check,/redeem (đối tác hiện tại) luôn trỏ vào đây` });
    }
    const pool = await getPool('ADMIN');
    const result = await pool.request().input('configKey', sql.VarChar(50), req.params.configKey).query('DELETE FROM api.VoucherSettings WHERE ConfigKey = @configKey');
    if (!result.rowsAffected[0]) return res.status(404).json({ error: 'Không tìm thấy cấu hình' });

    await logAction(req, { module: 'Cấu hình Voucher', actionType: 'XOA', targetObject: req.params.configKey, description: `Xoá cấu hình Voucher "${req.params.configKey}"` });
    res.json({ ok: true });
  } catch (err) { next(err); }
});

module.exports = router;
