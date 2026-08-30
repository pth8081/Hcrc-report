// lib/reportRunner.js — Tải định nghĩa báo cáo (app.ReportCatalog) và chạy
// đúng SourceType (directDb/apiReport/apiRealtime/externalApi), tách ra từ
// routes/reports.js để dùng chung với jobs/reportEmailScheduler.js (gửi báo
// cáo qua email theo lịch cũng cần chạy đúng logic này, không phải chỉ khi
// có request HTTP từ rp-user).
const { sql, getPool } = require('../db');
const { getPoolForDataSource } = require('./dataSourcePool');
const { runReport, projectColumns, describeColumns } = require('./reportEngine');
const { runApiReport } = require('./apiReportClient');
const { runExternalReport } = require('./externalReportClient');

async function loadDefinition(reportId) {
  const rpPool = await getPool('RP');
  const result = await rpPool.request()
    .input('reportId', sql.VarChar(80), reportId)
    .query(`
      SELECT Title, Domain, DataSourceId, SourceType, ApiConnectionId, ApiTarget, ExternalConnectionId, DefinitionJson, IsActive
      FROM app.ReportCatalog WHERE ReportId = @reportId
    `);
  if (!result.recordset.length) return null;
  const row = result.recordset[0];
  return {
    ...JSON.parse(row.DefinitionJson),
    dataSourceId: row.DataSourceId,
    sourceType: row.SourceType,
    apiConnectionId: row.ApiConnectionId,
    apiTarget: row.ApiTarget,
    externalConnectionId: row.ExternalConnectionId,
    isActive: row.IsActive
  };
}

async function resolveFactsPool(definition) {
  if (definition.dataSourceId) return getPoolForDataSource(definition.dataSourceId);
  return getPool('DWH');
}

// Trả {columns, rows} — columns LUÔN [{key,label}] (xem
// reportEngine.js:describeColumns()), dù cột nào là field thô hay công thức
// tính toán, dù báo cáo chạy trực tiếp, qua API Server, hay qua API đối tác,
// để bên gọi (rp-user, hoặc jobs/reportEmailScheduler.js) không cần biết
// khác biệt đó. 'directDb' tự chiếu cột + tính công thức tại chỗ;
// 'apiReport'/'apiRealtime' forward NGUYÊN response từ API Server (đã chiếu
// cột VÀ tính công thức ở phía đó); 'externalApi' tự chiếu cột + tính công
// thức tại chỗ (giống 'directDb') nhưng đọc từ JSON đối tác thay vì SQL
// Server — KHÔNG áp lại definition.columns của rp-server lên response đã
// chiếu sẵn từ nơi khác, tránh tính 2 lần với 2 định nghĩa khác nhau nếu 2
// bên có khai báo cột không khớp.
async function runDefinition(definition, filterValues, pagination) {
  if (definition.sourceType === 'externalApi') {
    return runExternalReport(definition, filterValues);
  }
  if (definition.sourceType && definition.sourceType !== 'directDb') {
    return runApiReport(definition, filterValues, pagination);
  }
  const pool = await resolveFactsPool(definition);
  const rows = await runReport(pool, definition, filterValues, pagination);
  return { columns: describeColumns(definition.columns), rows: rows.map(r => projectColumns(r, definition.columns)) };
}

module.exports = { loadDefinition, runDefinition };
