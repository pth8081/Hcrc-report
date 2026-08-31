// routes/admin/realtimeEndpoints.js — Trang "Endpoint realtime": CRUD
// api.RealtimeEndpointDefs — admin TỰ TẠO một endpoint realtime mới (chọn
// nguồn đã có trong api.DataSources, duyệt bảng/cột thật qua
// routes/admin/dataSources.js -> lib/schemaBrowser.js, KHÔNG gõ tay tên
// bảng/cột), không cần lập trình viên viết route mới — xem
// lib/realtimeEngine.js cho phần chạy query động dựa trên định nghĩa này.
//
// Bảng liên kết TUỲ CHỌN, TỐI ĐA 1 (joinSchema/joinTable/...) — cùng mẫu
// etl.SyncJobs (etl-admin/). Có joinTable thì BẮT BUỘC kèm
// joinSchema/mainJoinColumn/lookupJoinColumn; joinColumns có thể rỗng (join
// chỉ để lọc tồn tại, không lấy thêm cột nào) nhưng vẫn phải đúng schema
// thật nếu có khai.
//
// Cấu hình được đối chiếu với schema THẬT của nguồn ngay lúc LƯU (POST/PUT,
// xem assertSchemaMatches bên dưới) — dùng chung lib/schemaBrowser.js với
// dropdown trên api-admin/, nên endpoint tạo qua script/gọi API thẳng (bỏ qua
// dropdown) vẫn bị chặn ngay nếu sai tên bảng/cột, không đợi tới lúc đối tác
// gọi endpoint mới lộ ra. assertSafeIdentifier trong lib/realtimeEngine.js
// vẫn là lớp chống chèn SQL ở tầng chạy — kiểm tra ở đây không thay thế được
// lớp đó (schema có thể đổi sau khi lưu).
const express = require('express');
const { sql, getPool } = require('../../db');
const { requireAdminAuth, requireAdminRole } = require('../../lib/adminAuth');
const { assertSafeIdentifier } = require('../../lib/realtimeEngine');
const schemaBrowser = require('../../lib/schemaBrowser');
const { logAction } = require('../../lib/auditLog');

const router = express.Router();
router.use(requireAdminAuth);

const ENDPOINT_RE = /^[a-z0-9-]+$/;

// Đối chiếu bảng + cột trong cấu hình endpoint với schema THẬT của nguồn đã
// chọn (cùng nguồn schemaBrowser.js dùng để vẽ dropdown trên api-admin/) —
// chặn ngay lúc LƯU thay vì chỉ lộ lỗi lúc endpoint được GỌI (kể cả bởi đối
// tác ngoài). Quan trọng nhất khi endpoint được tạo qua script/gọi API thẳng
// (bỏ qua dropdown), ví dụ cấu hình hàng loạt nhiều chi nhánh cùng cấu trúc.
async function assertSchemaMatches(dataSourceId, schemaName, tableName, requiredColumns) {
  const tables = await schemaBrowser.listTables(dataSourceId);
  const tableExists = tables.some(t => t.schemaName === schemaName && t.tableName === tableName);
  if (!tableExists) throw new Error(`Bảng "${schemaName}.${tableName}" không tồn tại trên nguồn dữ liệu đã chọn`);
  const cols = await schemaBrowser.listColumns(dataSourceId, schemaName, tableName);
  const colNames = new Set(cols.map(c => c.columnName));
  const missing = [...new Set(requiredColumns.filter(Boolean))].filter(c => !colNames.has(c));
  if (missing.length) throw new Error(`Bảng "${schemaName}.${tableName}" không có cột: ${missing.join(', ')}`);
}

router.get('/', async (req, res, next) => {
  try {
    const pool = await getPool('ADMIN');
    const result = await pool.request().query(`
      SELECT d.Endpoint, d.Label, d.DataSourceId, s.Name AS DataSourceName,
             d.SchemaName, d.TableName, d.KeyColumn, d.ColumnsJson, d.OrderColumn,
             d.JoinSchema, d.JoinTable, d.JoinType, d.MainJoinColumn, d.LookupJoinColumn, d.JoinColumnsJson,
             d.IsActive, d.CreatedAt
      FROM api.RealtimeEndpointDefs d
      JOIN api.DataSources s ON s.Id = d.DataSourceId
      ORDER BY d.Endpoint
    `);
    res.json(result.recordset);
  } catch (err) { next(err); }
});

function validatePayload({ endpoint, dataSourceId, schemaName, tableName, keyColumn, columns, orderColumn, joinSchema, joinTable, mainJoinColumn, lookupJoinColumn, joinColumns }) {
  if (!endpoint || !ENDPOINT_RE.test(endpoint)) return 'endpoint chỉ gồm chữ thường/số/dấu gạch ngang (vd "inventory", "don-hang-dang-xu-ly")';
  if (!dataSourceId || !schemaName || !tableName || !keyColumn || !orderColumn) {
    return 'Thiếu dataSourceId/schemaName/tableName/keyColumn/orderColumn';
  }
  if (!Array.isArray(columns) || !columns.length) return 'Thiếu columns (danh sách cột hiển thị)';
  if (joinTable) {
    if (!joinSchema || !mainJoinColumn || !lookupJoinColumn) {
      return 'Có bảng liên kết (joinTable) thì phải kèm joinSchema/mainJoinColumn/lookupJoinColumn';
    }
    if (joinColumns !== undefined && !Array.isArray(joinColumns)) return 'joinColumns phải là mảng tên cột';
  }
  try {
    const idents = [schemaName, tableName, keyColumn, orderColumn, ...columns];
    if (joinTable) idents.push(joinSchema, joinTable, mainJoinColumn, lookupJoinColumn, ...(joinColumns || []));
    idents.forEach(assertSafeIdentifier);
  } catch (err) {
    return err.message;
  }
  return null;
}

async function assertFullSchemaMatches({ dataSourceId, schemaName, tableName, keyColumn, orderColumn, columns, joinSchema, joinTable, mainJoinColumn, lookupJoinColumn, joinColumns }) {
  const mainRequired = [keyColumn, orderColumn, ...columns];
  if (joinTable) mainRequired.push(mainJoinColumn);
  await assertSchemaMatches(dataSourceId, schemaName, tableName, mainRequired);
  if (joinTable) {
    await assertSchemaMatches(dataSourceId, joinSchema, joinTable, [lookupJoinColumn, ...(joinColumns || [])]);
  }
}

router.post('/', requireAdminRole, async (req, res, next) => {
  try {
    const {
      endpoint, label, dataSourceId, schemaName, tableName, keyColumn, columns, orderColumn,
      joinSchema, joinTable, joinType, mainJoinColumn, lookupJoinColumn, joinColumns = []
    } = req.body || {};
    const validationError = validatePayload({ endpoint, dataSourceId, schemaName, tableName, keyColumn, columns, orderColumn, joinSchema, joinTable, mainJoinColumn, lookupJoinColumn, joinColumns });
    if (validationError) return res.status(400).json({ error: validationError });
    try {
      await assertFullSchemaMatches({ dataSourceId, schemaName, tableName, keyColumn, orderColumn, columns, joinSchema, joinTable, mainJoinColumn, lookupJoinColumn, joinColumns });
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
      .input('columnsJson', sql.NVarChar(sql.MAX), JSON.stringify(columns))
      .input('orderColumn', sql.NVarChar(128), orderColumn)
      .input('joinSchema', sql.NVarChar(128), joinTable ? joinSchema : null)
      .input('joinTable', sql.NVarChar(128), joinTable || null)
      .input('joinType', sql.VarChar(5), joinTable ? (joinType === 'INNER' ? 'INNER' : 'LEFT') : null)
      .input('mainJoinColumn', sql.NVarChar(128), joinTable ? mainJoinColumn : null)
      .input('lookupJoinColumn', sql.NVarChar(128), joinTable ? lookupJoinColumn : null)
      .input('joinColumnsJson', sql.NVarChar(sql.MAX), joinTable ? JSON.stringify(joinColumns) : null)
      .query(`
        INSERT INTO api.RealtimeEndpointDefs (
          Endpoint, Label, DataSourceId, SchemaName, TableName, KeyColumn, ColumnsJson, OrderColumn,
          JoinSchema, JoinTable, JoinType, MainJoinColumn, LookupJoinColumn, JoinColumnsJson
        )
        VALUES (
          @endpoint, @label, @dataSourceId, @schemaName, @tableName, @keyColumn, @columnsJson, @orderColumn,
          @joinSchema, @joinTable, @joinType, @mainJoinColumn, @lookupJoinColumn, @joinColumnsJson
        )
      `);
    await logAction(req, {
      module: 'Endpoint realtime', actionType: 'TAO_ENDPOINT', targetObject: endpoint,
      description: `Tạo endpoint "${endpoint}"${joinTable ? ` (nối thêm ${joinSchema}.${joinTable})` : ''}`
    });
    res.status(201).json({ ok: true });
  } catch (err) {
    if (err.number === 2627 || err.number === 2601) return res.status(409).json({ error: `Endpoint "${req.body.endpoint}" đã tồn tại` });
    next(err);
  }
});

router.put('/:endpoint', requireAdminRole, async (req, res, next) => {
  try {
    const {
      label, dataSourceId, schemaName, tableName, keyColumn, columns, orderColumn, isActive,
      joinSchema, joinTable, joinType, mainJoinColumn, lookupJoinColumn, joinColumns = []
    } = req.body || {};
    const validationError = validatePayload({ endpoint: req.params.endpoint, dataSourceId, schemaName, tableName, keyColumn, columns, orderColumn, joinSchema, joinTable, mainJoinColumn, lookupJoinColumn, joinColumns });
    if (validationError) return res.status(400).json({ error: validationError });
    try {
      await assertFullSchemaMatches({ dataSourceId, schemaName, tableName, keyColumn, orderColumn, columns, joinSchema, joinTable, mainJoinColumn, lookupJoinColumn, joinColumns });
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
      .input('columnsJson', sql.NVarChar(sql.MAX), JSON.stringify(columns))
      .input('orderColumn', sql.NVarChar(128), orderColumn)
      .input('joinSchema', sql.NVarChar(128), joinTable ? joinSchema : null)
      .input('joinTable', sql.NVarChar(128), joinTable || null)
      .input('joinType', sql.VarChar(5), joinTable ? (joinType === 'INNER' ? 'INNER' : 'LEFT') : null)
      .input('mainJoinColumn', sql.NVarChar(128), joinTable ? mainJoinColumn : null)
      .input('lookupJoinColumn', sql.NVarChar(128), joinTable ? lookupJoinColumn : null)
      .input('joinColumnsJson', sql.NVarChar(sql.MAX), joinTable ? JSON.stringify(joinColumns) : null)
      .input('isActive', sql.Bit, isActive ? 1 : 0)
      .query(`
        UPDATE api.RealtimeEndpointDefs
        SET Label = @label, DataSourceId = @dataSourceId, SchemaName = @schemaName, TableName = @tableName,
            KeyColumn = @keyColumn, ColumnsJson = @columnsJson, OrderColumn = @orderColumn,
            JoinSchema = @joinSchema, JoinTable = @joinTable, JoinType = @joinType,
            MainJoinColumn = @mainJoinColumn, LookupJoinColumn = @lookupJoinColumn, JoinColumnsJson = @joinColumnsJson,
            IsActive = @isActive
        WHERE Endpoint = @endpoint
      `);
    await logAction(req, {
      module: 'Endpoint realtime', actionType: 'SUA_ENDPOINT', targetObject: req.params.endpoint,
      description: `Cập nhật endpoint "${req.params.endpoint}"${joinTable ? ` (nối thêm ${joinSchema}.${joinTable})` : ''}`
    });
    res.json({ ok: true });
  } catch (err) { next(err); }
});

router.delete('/:endpoint', requireAdminRole, async (req, res, next) => {
  try {
    const pool = await getPool('ADMIN');
    await pool.request().input('endpoint', sql.VarChar(50), req.params.endpoint)
      .query('DELETE FROM api.RealtimeEndpointDefs WHERE Endpoint = @endpoint');
    await logAction(req, { module: 'Endpoint realtime', actionType: 'XOA_ENDPOINT', targetObject: req.params.endpoint, description: `Xoá endpoint "${req.params.endpoint}"` });
    res.json({ ok: true });
  } catch (err) { next(err); }
});

module.exports = router;
