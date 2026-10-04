// lib/schemaMonitor.js — Giám sát cấu trúc bảng (tên + kiểu dữ liệu từng
// cột) của MỌI bảng nguồn mà các job đồng bộ ĐANG BẬT (etl.SyncJobs,
// Type='table') thật sự phụ thuộc vào (bản 8.57, theo yêu cầu người dùng:
// "thay đổi bảng biểu, thay đổi kiến trúc bảng... để tôi biết ngay").
//
// KHÁC lib/syncJobSchemaValidation.js (đã có từ trước, bản 8.13) — hàm đó
// CHỈ kiểm tra "các cột job này cần có còn tồn tại không" (gọi tay, từng
// job, lúc tạo/sửa job hoặc bấm "Kiểm tra schema"). Module NÀY chụp lại
// TOÀN BỘ cột của bảng (không chỉ cột job cần), so với lần chụp trước, bắt
// được CẢ trường hợp syncJobSchemaValidation.js bỏ sót: đổi KIỂU DỮ LIỆU 1
// cột dù TÊN không đổi (vd Decimal -> Nvarchar) — tên cột vẫn "tồn tại" nên
// hàm cũ không báo gì, nhưng dữ liệu đồng bộ từ đó có thể sai/lỗi âm thầm.
//
// Thiết kế lưu trữ:
//   etl.SchemaSnapshots   — 1 dòng/bảng đang giám sát, LUÔN ghi đè bằng cấu
//                           trúc cột MỚI NHẤT mỗi lần chạy (dùng để so sánh
//                           ở LẦN CHẠY SAU, không phải lịch sử).
//   etl.SchemaChangeLog   — lịch sử MỌI thay đổi từng phát hiện được (không
//                           ghi đè, cộng dồn) — dùng để xem lại/kiểm toán.
// 2 bảng cùng ghi 1 giá trị "RunAt" (tính 1 LẦN duy nhất trong Node, không
// để SQL Server tự tính SYSUTCDATETIME() riêng từng câu lệnh) — nhờ đó
// GET /schema-monitor nhận biết CHÍNH XÁC "thay đổi phát hiện ở LẦN CHẠY
// GẦN NHẤT" bằng cách so khớp SchemaChangeLog.DetectedAt = SchemaSnapshots.CapturedAt,
// không lẫn với thay đổi của các lần chạy trước đó.
//
// LẦN CHẠY ĐẦU TIÊN của 1 bảng (chưa có snapshot) — chỉ lưu cấu trúc hiện
// tại làm MỐC, KHÔNG báo "mọi cột đều mới" (sẽ gây nhiễu vô nghĩa) — đúng
// nguyên tắc "so sánh với lần trước", không phải "so với rỗng".
const { sql, getPool } = require('../db');
const schemaBrowser = require('./schemaBrowser');
const { alertSchemaChange } = require('./mailer');

function tableKey(dataSourceId, schemaName, tableName) {
  return `${dataSourceId}::${schemaName}::${tableName}`;
}

// Gom MỌI bảng (+ cột job thật sự cần) từ các job Type='table' đang bật —
// 1 bảng có thể được NHIỀU job dùng (vd bảng chính của job này lại là bảng
// liên kết của job khác) nên gộp theo Map, không theo từng dòng SyncJobs.
async function collectMonitoredTables(pool) {
  const jobs = (await pool.request().query(`
    SELECT Id, Name, DataSourceId, SourceSchema, SourceTable, KeyColumn, DateColumn, UpdatedAtColumn,
           DimensionColumnsJson, MeasureColumnsJson, JoinSchema, JoinTable, LookupJoinColumn, LookupDimensionColumnsJson
    FROM etl.SyncJobs WHERE IsActive = 1 AND Type = 'table'
  `)).recordset;

  const tables = new Map(); // key -> { dataSourceId, schemaName, tableName, requiredColumns: Map<col, Set<jobName>> }
  function touch(dataSourceId, schemaName, tableName) {
    const key = tableKey(dataSourceId, schemaName, tableName);
    if (!tables.has(key)) tables.set(key, { dataSourceId, schemaName, tableName, requiredColumns: new Map() });
    return tables.get(key);
  }
  function require_(entry, columns, jobName) {
    for (const col of columns) {
      if (!col) continue;
      if (!entry.requiredColumns.has(col)) entry.requiredColumns.set(col, new Set());
      entry.requiredColumns.get(col).add(jobName);
    }
  }

  for (const job of jobs) {
    const mainEntry = touch(job.DataSourceId, job.SourceSchema, job.SourceTable);
    const dimCols = JSON.parse(job.DimensionColumnsJson || '[]');
    const measureCols = JSON.parse(job.MeasureColumnsJson || '[]');
    require_(mainEntry, [job.KeyColumn, job.DateColumn, job.UpdatedAtColumn, ...dimCols, ...measureCols], job.Name);

    if (job.JoinTable) {
      const joinEntry = touch(job.DataSourceId, job.JoinSchema, job.JoinTable);
      const lookupDimCols = JSON.parse(job.LookupDimensionColumnsJson || '[]');
      require_(joinEntry, [job.LookupJoinColumn, ...lookupDimCols], job.Name);
    }
  }
  return [...tables.values()];
}

// Chuẩn hoá danh sách cột thật (schemaBrowser) thành object {colName:
// dataType}, sắp xếp theo tên để so sánh ổn định (thứ tự vật lý trong CSDL
// không quan trọng với mục đích giám sát này).
function toColumnMap(columns) {
  const map = {};
  for (const c of columns) map[c.columnName] = c.dataType;
  return map;
}

// So sánh 2 {colName: dataType} -> mảng thay đổi {type, column, before?, after?}.
function diffColumns(oldMap, newMap) {
  const changes = [];
  for (const col of Object.keys(oldMap)) {
    if (!(col in newMap)) changes.push({ type: 'removed', column: col });
    else if (oldMap[col] !== newMap[col]) changes.push({ type: 'typeChanged', column: col, before: oldMap[col], after: newMap[col] });
  }
  for (const col of Object.keys(newMap)) {
    if (!(col in oldMap)) changes.push({ type: 'added', column: col });
  }
  return changes;
}

async function loadSnapshot(pool, dataSourceId, schemaName, tableName) {
  const result = await pool.request()
    .input('dataSourceId', sql.Int, dataSourceId)
    .input('schemaName', sql.NVarChar(100), schemaName)
    .input('tableName', sql.NVarChar(100), tableName)
    .query('SELECT ColumnsJson FROM etl.SchemaSnapshots WHERE DataSourceId = @dataSourceId AND SchemaName = @schemaName AND TableName = @tableName');
  return result.recordset.length ? JSON.parse(result.recordset[0].ColumnsJson) : null;
}

async function saveSnapshot(pool, dataSourceId, schemaName, tableName, columnMap, runAt) {
  await pool.request()
    .input('dataSourceId', sql.Int, dataSourceId)
    .input('schemaName', sql.NVarChar(100), schemaName)
    .input('tableName', sql.NVarChar(100), tableName)
    .input('columnsJson', sql.NVarChar(sql.MAX), JSON.stringify(columnMap))
    .input('runAt', sql.DateTime2(3), runAt)
    .query(`
      MERGE etl.SchemaSnapshots AS target
      USING (SELECT @dataSourceId AS DataSourceId, @schemaName AS SchemaName, @tableName AS TableName) AS src
        ON target.DataSourceId = src.DataSourceId AND target.SchemaName = src.SchemaName AND target.TableName = src.TableName
      WHEN MATCHED THEN UPDATE SET ColumnsJson = @columnsJson, CapturedAt = @runAt
      WHEN NOT MATCHED THEN INSERT (DataSourceId, SchemaName, TableName, ColumnsJson, CapturedAt)
        VALUES (@dataSourceId, @schemaName, @tableName, @columnsJson, @runAt);
    `);
}

async function logChanges(pool, dataSourceId, schemaName, tableName, changes, runAt) {
  for (const c of changes) {
    await pool.request()
      .input('dataSourceId', sql.Int, dataSourceId)
      .input('schemaName', sql.NVarChar(100), schemaName)
      .input('tableName', sql.NVarChar(100), tableName)
      .input('changeType', sql.VarChar(20), c.type)
      .input('columnName', sql.NVarChar(200), c.column)
      .input('oldValue', sql.NVarChar(200), c.before || null)
      .input('newValue', sql.NVarChar(200), c.after || null)
      .input('runAt', sql.DateTime2(3), runAt)
      .query(`
        INSERT INTO etl.SchemaChangeLog (DataSourceId, SchemaName, TableName, ChangeType, ColumnName, OldValue, NewValue, DetectedAt)
        VALUES (@dataSourceId, @schemaName, @tableName, @changeType, @columnName, @oldValue, @newValue, @runAt)
      `);
  }
}

// Chạy 1 lượt giám sát đầy đủ — dùng CHUNG cho job nền (6h sáng, xem
// etl/server.js) VÀ nút "Kiểm tra tất cả ngay" (routes/admin/schemaMonitor.js).
// Trả về { checkedCount, changedTables: [{dataSourceId, schemaName, tableName, changes}] }
// — CHỈ gửi email khi changedTables.length > 0 (không báo "mọi thứ đều ổn"
// mỗi lần chạy, đúng nguyên tắc chống lờn cảnh báo đã áp dụng ở
// rp-server/lib/anomalyAlertRunner.js).
async function runSchemaCheck() {
  const pool = await getPool('ADMIN');
  const runAt = new Date();
  const monitoredTables = await collectMonitoredTables(pool);

  const dataSourceNames = new Map((await pool.request().query('SELECT Id, Name FROM etl.DataSources')).recordset.map(r => [r.Id, r.Name]));
  const changedTables = [];

  for (const entry of monitoredTables) {
    const { dataSourceId, schemaName, tableName, requiredColumns } = entry;
    let columns;
    try {
      columns = await schemaBrowser.listColumns(dataSourceId, schemaName, tableName);
    } catch (err) {
      // Không kết nối được nguồn lúc này (xem "Trạng thái kết nối" riêng) —
      // KHÔNG coi là "bảng đã đổi cấu trúc", bỏ qua lượt này, giữ nguyên
      // snapshot cũ để so sánh ở lần chạy kế tiếp khi nguồn kết nối lại được.
      continue;
    }
    const newMap = toColumnMap(columns);
    const oldMap = await loadSnapshot(pool, dataSourceId, schemaName, tableName);

    if (oldMap !== null) {
      const changes = diffColumns(oldMap, newMap);
      if (changes.length) {
        // Cột bị "removed" mà có job đang CẦN tới -> ghi rõ tên job, giúp
        // người xem biết ngay mức độ nghiêm trọng (removed không ai dùng
        // thì thường vô hại, removed đang dùng thì ảnh hưởng đồng bộ thật).
        for (const c of changes) {
          if (c.type === 'removed' && requiredColumns.has(c.column)) {
            c.usedByJobs = [...requiredColumns.get(c.column)];
          }
        }
        await logChanges(pool, dataSourceId, schemaName, tableName, changes, runAt);
        changedTables.push({ dataSourceId, dataSourceName: dataSourceNames.get(dataSourceId) || `#${dataSourceId}`, schemaName, tableName, changes });
      }
    }
    await saveSnapshot(pool, dataSourceId, schemaName, tableName, newMap, runAt);
  }

  if (changedTables.length) {
    await alertSchemaChange(changedTables).catch(() => { /* lỗi gửi mail không được làm hỏng lượt kiểm tra — đã có log console trong mailer.js */ });
  }

  return { checkedCount: monitoredTables.length, changedTables, runAt };
}

// Danh sách trạng thái hiện tại cho trang "Giám sát cấu trúc CSDL" — đọc
// LẠI dữ liệu đã lưu (không tự chạy kiểm tra), kèm thay đổi của ĐÚNG lần
// chạy gần nhất (so khớp DetectedAt = CapturedAt, xem chú thích đầu file).
async function getStatusList() {
  const pool = await getPool('ADMIN');
  const monitoredTables = await collectMonitoredTables(pool);
  const dataSourceNames = new Map((await pool.request().query('SELECT Id, Name FROM etl.DataSources')).recordset.map(r => [r.Id, r.Name]));

  const rows = [];
  for (const { dataSourceId, schemaName, tableName } of monitoredTables) {
    const snapshotResult = await pool.request()
      .input('dataSourceId', sql.Int, dataSourceId).input('schemaName', sql.NVarChar(100), schemaName).input('tableName', sql.NVarChar(100), tableName)
      .query('SELECT CapturedAt FROM etl.SchemaSnapshots WHERE DataSourceId = @dataSourceId AND SchemaName = @schemaName AND TableName = @tableName');
    const lastCheckedAt = snapshotResult.recordset[0]?.CapturedAt || null;

    let changes = [];
    if (lastCheckedAt) {
      const changeResult = await pool.request()
        .input('dataSourceId', sql.Int, dataSourceId).input('schemaName', sql.NVarChar(100), schemaName).input('tableName', sql.NVarChar(100), tableName)
        .input('runAt', sql.DateTime2(3), lastCheckedAt)
        .query(`
          SELECT ChangeType AS type, ColumnName AS [column], OldValue AS before, NewValue AS after
          FROM etl.SchemaChangeLog
          WHERE DataSourceId = @dataSourceId AND SchemaName = @schemaName AND TableName = @tableName AND DetectedAt = @runAt
        `);
      changes = changeResult.recordset;
    }

    rows.push({
      id: tableKey(dataSourceId, schemaName, tableName),
      dataSourceName: dataSourceNames.get(dataSourceId) || `#${dataSourceId}`,
      schemaName, tableName,
      lastCheckedAt: lastCheckedAt ? lastCheckedAt.toISOString() : null,
      changes
    });
  }
  return rows;
}

module.exports = { runSchemaCheck, getStatusList };
