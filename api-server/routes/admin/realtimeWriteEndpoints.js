// routes/admin/realtimeWriteEndpoints.js — Trang "Endpoint ghi": CRUD
// api.RealtimeWriteEndpointDefs — admin TỰ TẠO một endpoint ghi ngược lại
// nguồn dữ liệu vận hành mới (chọn nguồn đã có trong api.DataSources, duyệt
// bảng/cột thật qua routes/admin/dataSources.js -> lib/schemaBrowser.js,
// KHÔNG gõ tay tên bảng/cột), không cần lập trình viên viết route mới — xem
// lib/realtimeWriteEngine.js cho phần chạy UPDATE động dựa trên định nghĩa
// này. Mirror hẳn routes/admin/realtimeEndpoints.js (đọc) nhưng cấu hình
// ĐƠN GIẢN hơn nhiều (không JOIN, không nhiều cột) vì chỉ hỗ trợ đúng 1
// thao tác: đổi StatusColumn của 1 dòng sang UsedValue.
//
// Cấu hình được đối chiếu với schema THẬT của nguồn ngay lúc LƯU (POST/PUT,
// assertSchemaMatches — dùng chung lib/schemaBrowser.js với dropdown trên
// api-admin/) — endpoint tạo qua script/gọi API thẳng (bỏ qua dropdown)
// vẫn bị chặn ngay nếu sai tên bảng/cột.
const express = require('express');
const { sql, getPool } = require('../../db');
const { requireAdminAuth, requireAdminRole } = require('../../lib/adminAuth');
const { assertSafeIdentifier } = require('../../lib/realtimeWriteEngine');
const schemaBrowser = require('../../lib/schemaBrowser');
const { logAction } = require('../../lib/auditLog');

const router = express.Router();
router.use(requireAdminAuth);

const ENDPOINT_RE = /^[a-z0-9-]+$/;

async function assertSchemaMatches(dataSourceId, schemaName, tableName, requiredColumns) {
  const tables = await schemaBrowser.listTables(dataSourceId);
  const tableExists = tables.some(t => t.schemaName === schemaName && t.tableName === tableName);
  if (!tableExists) throw new Error(`Bảng "${schemaName}.${tableName}" không tồn tại trên nguồn dữ liệu đã chọn`);
  const cols = await schemaBrowser.listColumns(dataSourceId, schemaName, tableName);
  const colNames = new Set(cols.map(c => c.columnName));
  const missing = [...new Set(requiredColumns.filter(Boolean))].filter(c => !colNames.has(c));
  if (missing.length) throw new Error(`Bảng "${schemaName}.${tableName}" không có cột: ${missing.join(', ')}`);
}

function validatePayload({ endpoint, dataSourceId, schemaName, tableName, keyColumn, statusColumn, usedValue }) {
  if (!endpoint || !ENDPOINT_RE.test(endpoint)) return 'endpoint chỉ gồm chữ thường/số/dấu gạch ngang (vd "vouchers-redeem")';
  if (!dataSourceId || !schemaName || !tableName || !keyColumn || !statusColumn) {
    return 'Thiếu dataSourceId/schemaName/tableName/keyColumn/statusColumn';
  }
  if (!usedValue) return 'Thiếu usedValue (giá trị gán vào statusColumn khi đánh dấu đã dùng)';
  if (keyColumn === statusColumn) return 'keyColumn và statusColumn phải là 2 cột khác nhau';
  try {
    [schemaName, tableName, keyColumn, statusColumn].forEach(assertSafeIdentifier);
  } catch (err) {
    return err.message;
  }
  return null;
}

router.get('/', async (req, res, next) => {
  try {
    const pool = await getPool('ADMIN');
    const result = await pool.request().query(`
      SELECT d.Endpoint, d.Label, d.DataSourceId, s.Name AS DataSourceName,
             d.SchemaName, d.TableName, d.KeyColumn, d.StatusColumn, d.UsedValue,
             d.IsActive, d.CreatedAt
      FROM api.RealtimeWriteEndpointDefs d
      JOIN api.DataSources s ON s.Id = d.DataSourceId
      ORDER BY d.Endpoint
    `);
    res.json(result.recordset);
  } catch (err) { next(err); }
});

router.post('/', requireAdminRole, async (req, res, next) => {
  try {
    const { endpoint, label, dataSourceId, schemaName, tableName, keyColumn, statusColumn, usedValue } = req.body || {};
    const validationError = validatePayload({ endpoint, dataSourceId, schemaName, tableName, keyColumn, statusColumn, usedValue });
    if (validationError) return res.status(400).json({ error: validationError });
    try {
      await assertSchemaMatches(dataSourceId, schemaName, tableName, [keyColumn, statusColumn]);
    } catch (err) {
      return res.status(400).json({ error: err.message });
    }

    const pool = await getPool('ADMIN');
    await pool.request()
      .input('endpoint', sql.VarChar(50), endpoint)
      .input('label', sql.NVarChar(200), label || endpoint)
      .input('dataSourceId', sql.Int, dataSourceId)
      .input('schemaName', sql.NVarChar(128), schemaName)
      .input('tableName', sql.NVarChar(128), tableName)
      .input('keyColumn', sql.NVarChar(128), keyColumn)
      .input('statusColumn', sql.NVarChar(128), statusColumn)
      .input('usedValue', sql.NVarChar(50), usedValue)
      .query(`
        INSERT INTO api.RealtimeWriteEndpointDefs (Endpoint, Label, DataSourceId, SchemaName, TableName, KeyColumn, StatusColumn, UsedValue)
        VALUES (@endpoint, @label, @dataSourceId, @schemaName, @tableName, @keyColumn, @statusColumn, @usedValue)
      `);
    await logAction(req, { module: 'Endpoint ghi', actionType: 'TAO_ENDPOINT_GHI', targetObject: endpoint, description: `Tạo endpoint ghi "${endpoint}" (${schemaName}.${tableName}.${statusColumn} -> "${usedValue}")` });
    res.status(201).json({ ok: true });
  } catch (err) {
    if (err.number === 2627 || err.number === 2601) return res.status(409).json({ error: `Endpoint "${req.body.endpoint}" đã tồn tại` });
    next(err);
  }
});

router.put('/:endpoint', requireAdminRole, async (req, res, next) => {
  try {
    const { label, dataSourceId, schemaName, tableName, keyColumn, statusColumn, usedValue, isActive } = req.body || {};
    const validationError = validatePayload({ endpoint: req.params.endpoint, dataSourceId, schemaName, tableName, keyColumn, statusColumn, usedValue });
    if (validationError) return res.status(400).json({ error: validationError });
    try {
      await assertSchemaMatches(dataSourceId, schemaName, tableName, [keyColumn, statusColumn]);
    } catch (err) {
      return res.status(400).json({ error: err.message });
    }

    const pool = await getPool('ADMIN');
    await pool.request()
      .input('endpoint', sql.VarChar(50), req.params.endpoint)
      .input('label', sql.NVarChar(200), label || req.params.endpoint)
      .input('dataSourceId', sql.Int, dataSourceId)
      .input('schemaName', sql.NVarChar(128), schemaName)
      .input('tableName', sql.NVarChar(128), tableName)
      .input('keyColumn', sql.NVarChar(128), keyColumn)
      .input('statusColumn', sql.NVarChar(128), statusColumn)
      .input('usedValue', sql.NVarChar(50), usedValue)
      .input('isActive', sql.Bit, isActive ? 1 : 0)
      .query(`
        UPDATE api.RealtimeWriteEndpointDefs
        SET Label = @label, DataSourceId = @dataSourceId, SchemaName = @schemaName, TableName = @tableName,
            KeyColumn = @keyColumn, StatusColumn = @statusColumn, UsedValue = @usedValue, IsActive = @isActive
        WHERE Endpoint = @endpoint
      `);
    await logAction(req, { module: 'Endpoint ghi', actionType: 'SUA_ENDPOINT_GHI', targetObject: req.params.endpoint, description: `Cập nhật endpoint ghi "${req.params.endpoint}" (${schemaName}.${tableName}.${statusColumn} -> "${usedValue}")` });
    res.json({ ok: true });
  } catch (err) { next(err); }
});

// "Kiểm tra schema" — đối chiếu LẠI endpoint ĐÃ LƯU với schema THẬT hiện tại
// của nguồn (bắt trường hợp bảng/cột nguồn bị đổi tên/xoá SAU khi endpoint
// đã tạo). Đọc-only, không đổi dữ liệu gì.
router.post('/:endpoint/check-schema', async (req, res, next) => {
  try {
    const pool = await getPool('ADMIN');
    const result = await pool.request().input('endpoint', sql.VarChar(50), req.params.endpoint).query(`
      SELECT DataSourceId, SchemaName, TableName, KeyColumn, StatusColumn
      FROM api.RealtimeWriteEndpointDefs WHERE Endpoint = @endpoint
    `);
    if (!result.recordset.length) return res.status(404).json({ error: 'Không tìm thấy endpoint' });
    const d = result.recordset[0];
    try {
      await assertSchemaMatches(d.DataSourceId, d.SchemaName, d.TableName, [d.KeyColumn, d.StatusColumn]);
    } catch (err) {
      await logAction(req, { module: 'Endpoint ghi', actionType: 'KIEM_TRA_SCHEMA_GHI', targetObject: req.params.endpoint, description: `Kiểm tra schema endpoint ghi "${req.params.endpoint}": LỆCH — ${err.message}`, status: 'FAILED' });
      return res.json({ ok: false, error: err.message });
    }
    await logAction(req, { module: 'Endpoint ghi', actionType: 'KIEM_TRA_SCHEMA_GHI', targetObject: req.params.endpoint, description: `Kiểm tra schema endpoint ghi "${req.params.endpoint}": khớp schema nguồn` });
    res.json({ ok: true });
  } catch (err) { next(err); }
});

router.delete('/:endpoint', requireAdminRole, async (req, res, next) => {
  try {
    const pool = await getPool('ADMIN');
    await pool.request().input('endpoint', sql.VarChar(50), req.params.endpoint)
      .query('DELETE FROM api.RealtimeWriteEndpointDefs WHERE Endpoint = @endpoint');
    await logAction(req, { module: 'Endpoint ghi', actionType: 'XOA_ENDPOINT_GHI', targetObject: req.params.endpoint, description: `Xoá endpoint ghi "${req.params.endpoint}"` });
    res.json({ ok: true });
  } catch (err) { next(err); }
});

module.exports = router;
