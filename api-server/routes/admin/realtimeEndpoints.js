// routes/admin/realtimeEndpoints.js — Trang "Endpoint realtime": CRUD
// api.RealtimeEndpointDefs — admin TỰ TẠO một endpoint realtime mới (chọn
// nguồn đã có trong api.DataSources, duyệt bảng/cột thật qua
// routes/admin/dataSources.js -> lib/schemaBrowser.js, KHÔNG gõ tay tên
// bảng/cột), không cần lập trình viên viết route mới — xem
// lib/realtimeEngine.js cho phần chạy query động dựa trên định nghĩa này.
const express = require('express');
const { sql, getPool } = require('../../db');
const { requireAdminAuth, requireAdminRole } = require('../../lib/adminAuth');
const { assertSafeIdentifier } = require('../../lib/realtimeEngine');

const router = express.Router();
router.use(requireAdminAuth);

const ENDPOINT_RE = /^[a-z0-9-]+$/;

router.get('/', async (req, res, next) => {
  try {
    const pool = await getPool('ADMIN');
    const result = await pool.request().query(`
      SELECT d.Endpoint, d.Label, d.DataSourceId, s.Name AS DataSourceName,
             d.SchemaName, d.TableName, d.KeyColumn, d.ColumnsJson, d.OrderColumn, d.IsActive, d.CreatedAt
      FROM api.RealtimeEndpointDefs d
      JOIN api.DataSources s ON s.Id = d.DataSourceId
      ORDER BY d.Endpoint
    `);
    res.json(result.recordset);
  } catch (err) { next(err); }
});

function validatePayload({ endpoint, dataSourceId, schemaName, tableName, keyColumn, columns, orderColumn }) {
  if (!endpoint || !ENDPOINT_RE.test(endpoint)) return 'endpoint chỉ gồm chữ thường/số/dấu gạch ngang (vd "inventory", "don-hang-dang-xu-ly")';
  if (!dataSourceId || !schemaName || !tableName || !keyColumn || !orderColumn) {
    return 'Thiếu dataSourceId/schemaName/tableName/keyColumn/orderColumn';
  }
  if (!Array.isArray(columns) || !columns.length) return 'Thiếu columns (danh sách cột hiển thị)';
  try {
    [schemaName, tableName, keyColumn, orderColumn, ...columns].forEach(assertSafeIdentifier);
  } catch (err) {
    return err.message;
  }
  return null;
}

router.post('/', requireAdminRole, async (req, res, next) => {
  try {
    const { endpoint, label, dataSourceId, schemaName, tableName, keyColumn, columns, orderColumn } = req.body || {};
    const validationError = validatePayload({ endpoint, dataSourceId, schemaName, tableName, keyColumn, columns, orderColumn });
    if (validationError) return res.status(400).json({ error: validationError });

    const pool = await getPool('ADMIN');
    await pool.request()
      .input('endpoint', sql.VarChar(50), endpoint)
      .input('label', sql.NVarChar(200), label || endpoint)
      .input('dataSourceId', sql.Int, dataSourceId)
      .input('schemaName', sql.NVarChar(128), schemaName)
      .input('tableName', sql.NVarChar(128), tableName)
      .input('keyColumn', sql.NVarChar(128), keyColumn)
      .input('columnsJson', sql.NVarChar(sql.MAX), JSON.stringify(columns))
      .input('orderColumn', sql.NVarChar(128), orderColumn)
      .query(`
        INSERT INTO api.RealtimeEndpointDefs (Endpoint, Label, DataSourceId, SchemaName, TableName, KeyColumn, ColumnsJson, OrderColumn)
        VALUES (@endpoint, @label, @dataSourceId, @schemaName, @tableName, @keyColumn, @columnsJson, @orderColumn)
      `);
    res.status(201).json({ ok: true });
  } catch (err) {
    if (err.number === 2627 || err.number === 2601) return res.status(409).json({ error: `Endpoint "${req.body.endpoint}" đã tồn tại` });
    next(err);
  }
});

router.put('/:endpoint', requireAdminRole, async (req, res, next) => {
  try {
    const { label, dataSourceId, schemaName, tableName, keyColumn, columns, orderColumn, isActive } = req.body || {};
    const validationError = validatePayload({ endpoint: req.params.endpoint, dataSourceId, schemaName, tableName, keyColumn, columns, orderColumn });
    if (validationError) return res.status(400).json({ error: validationError });

    const pool = await getPool('ADMIN');
    await pool.request()
      .input('endpoint', sql.VarChar(50), req.params.endpoint)
      .input('label', sql.NVarChar(200), label || req.params.endpoint)
      .input('dataSourceId', sql.Int, dataSourceId)
      .input('schemaName', sql.NVarChar(128), schemaName)
      .input('tableName', sql.NVarChar(128), tableName)
      .input('keyColumn', sql.NVarChar(128), keyColumn)
      .input('columnsJson', sql.NVarChar(sql.MAX), JSON.stringify(columns))
      .input('orderColumn', sql.NVarChar(128), orderColumn)
      .input('isActive', sql.Bit, isActive ? 1 : 0)
      .query(`
        UPDATE api.RealtimeEndpointDefs
        SET Label = @label, DataSourceId = @dataSourceId, SchemaName = @schemaName, TableName = @tableName,
            KeyColumn = @keyColumn, ColumnsJson = @columnsJson, OrderColumn = @orderColumn, IsActive = @isActive
        WHERE Endpoint = @endpoint
      `);
    res.json({ ok: true });
  } catch (err) { next(err); }
});

router.delete('/:endpoint', requireAdminRole, async (req, res, next) => {
  try {
    const pool = await getPool('ADMIN');
    await pool.request().input('endpoint', sql.VarChar(50), req.params.endpoint)
      .query('DELETE FROM api.RealtimeEndpointDefs WHERE Endpoint = @endpoint');
    res.json({ ok: true });
  } catch (err) { next(err); }
});

module.exports = router;
