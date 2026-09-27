// routes/admin/voucherSettings.js — Trang "Cấu hình Voucher": cấu hình DUY
// NHẤT (Id=1, xem api-db/schema.sql api.VoucherSettings) cho
// lib/voucherRedeemService.js — CHỈ chọn "Nguồn dữ liệu" (api.DataSources)
// nào trỏ DSMART16 Live để đọc/ghi PMCRDINF. Bảng/cột (PMCRDINF/BARCODE/
// STATUS...) CỐ ĐỊNH trong code, không cấu hình ở đây — xem
// lib/voucherRedeemService.js.
const express = require('express');
const { sql, getPool } = require('../../db');
const { requireMenuAccess, requireMenuEdit } = require('../../lib/adminPermissions');
const { logAction } = require('../../lib/auditLog');

const router = express.Router();
router.use(requireMenuAccess('voucher-settings'));

router.get('/', async (req, res, next) => {
  try {
    const pool = await getPool('ADMIN');
    const result = await pool.request().query(`
      SELECT vs.DataSourceId, ds.Name AS DataSourceName
      FROM api.VoucherSettings vs
      LEFT JOIN api.DataSources ds ON ds.Id = vs.DataSourceId
      WHERE vs.Id = 1
    `);
    const row = result.recordset[0];
    res.json({ dataSourceId: row?.DataSourceId || null, dataSourceName: row?.DataSourceName || null });
  } catch (err) { next(err); }
});

router.put('/', requireMenuEdit('voucher-settings'), async (req, res, next) => {
  try {
    const { dataSourceId } = req.body || {};
    if (!dataSourceId) return res.status(400).json({ error: 'Thiếu dataSourceId' });

    const pool = await getPool('ADMIN');
    const sourceCheck = await pool.request().input('id', sql.Int, dataSourceId).query('SELECT 1 FROM api.DataSources WHERE Id = @id AND IsActive = 1');
    if (!sourceCheck.recordset.length) return res.status(400).json({ error: 'Nguồn dữ liệu không tồn tại hoặc đã tắt' });

    await pool.request()
      .input('dataSourceId', sql.Int, dataSourceId)
      .query(`
        MERGE api.VoucherSettings AS target
        USING (SELECT 1 AS Id) AS src ON target.Id = src.Id
        WHEN MATCHED THEN UPDATE SET DataSourceId = @dataSourceId
        WHEN NOT MATCHED THEN INSERT (Id, DataSourceId) VALUES (1, @dataSourceId);
      `);

    await logAction(req, { module: 'Cấu hình Voucher', actionType: 'CAP_NHAT', description: 'Cập nhật Nguồn dữ liệu cho voucher check/redeem' });
    res.json({ ok: true });
  } catch (err) { next(err); }
});

module.exports = router;
