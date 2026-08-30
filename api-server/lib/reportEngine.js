// lib/reportEngine.js — Đọc định nghĩa báo cáo (dwh.ReportCatalog) và chạy
// truy vấn tham số hoá trên dwh.ReportFacts. KHÔNG dựng SELECT động theo từng
// cột — luôn lấy nguyên dòng (EntityCode, EventDate, Dimensions, Measures) rồi
// projectColumns() ở tầng JS chọn đúng cột cần trả về theo definition.columns.
//
// Bản sao CÙNG NỘI DUNG cũng có ở rp-server/lib/reportEngine.js — cố ý
// trùng lặp, không dùng chung qua thư mục "shared/", để mỗi server tự chứa đủ
// code khi copy riêng lên máy chủ triển khai (xem tài liệu kiến trúc, mục 08).
const { sql } = require('../db');

const FIELD_NAME_RE = /^[a-zA-Z0-9_]+$/;

function resolveColumn(field) {
  if (field === 'entityCode') return 'EntityCode';
  if (field === 'eventDate') return 'EventDate';
  if (field === 'sourceSystem') return 'SourceSystem';
  if (!FIELD_NAME_RE.test(field)) {
    throw new Error(`Tên field không hợp lệ trong định nghĩa báo cáo: "${field}"`);
  }
  return `JSON_VALUE(Dimensions, '$.${field}')`;
}

function parseRow(row) {
  return {
    id: row.Id,
    sourceSystem: row.SourceSystem,
    entityCode: row.EntityCode,
    eventDate: row.EventDate,
    dimensions: JSON.parse(row.Dimensions || '{}'),
    measures: row.Measures ? JSON.parse(row.Measures) : {},
    syncedAt: row.SyncedAt
  };
}

function projectColumns(row, columns) {
  const out = {};
  for (const col of columns) {
    if (col === 'entityCode') out[col] = row.entityCode;
    else if (col === 'eventDate') out[col] = row.eventDate;
    else if (col === 'sourceSystem') out[col] = row.sourceSystem;
    else if (col.startsWith('measures.')) out[col] = row.measures[col.slice('measures.'.length)];
    else out[col] = row.dimensions[col];
  }
  return out;
}

async function runReport(pool, definition, filterValues = {}, { page = 1, pageSize = 200 } = {}) {
  const request = pool.request();
  const conditions = ['Domain = @domain'];
  request.input('domain', sql.VarChar(50), definition.domain);

  (definition.filters || []).forEach((filterDef, idx) => {
    const value = filterValues[filterDef.field];
    if (value === undefined || value === null || value === '') return;
    const column = resolveColumn(filterDef.field);
    const p = `f${idx}`;

    if (filterDef.type === 'dateRange') {
      if (value.from) {
        request.input(`${p}From`, sql.Date, value.from);
        conditions.push(`${column} >= @${p}From`);
      }
      if (value.to) {
        request.input(`${p}To`, sql.Date, value.to);
        conditions.push(`${column} <= @${p}To`);
      }
    } else if (filterDef.type === 'multiSelect' && Array.isArray(value) && value.length) {
      const paramNames = value.map((v, i) => {
        const name = `${p}_${i}`;
        request.input(name, sql.NVarChar(200), String(v));
        return `@${name}`;
      });
      conditions.push(`${column} IN (${paramNames.join(', ')})`);
    } else {
      request.input(p, sql.NVarChar(200), String(value));
      conditions.push(`${column} = @${p}`);
    }
  });

  const offset = Math.max(0, (page - 1) * pageSize);
  request.input('offset', sql.Int, offset);
  request.input('pageSize', sql.Int, pageSize);

  const result = await request.query(`
    SELECT Id, SourceSystem, EntityCode, EventDate, Dimensions, Measures, SyncedAt
    FROM dwh.ReportFacts
    WHERE ${conditions.join(' AND ')}
    ORDER BY EventDate DESC, Id DESC
    OFFSET @offset ROWS FETCH NEXT @pageSize ROWS ONLY;
  `);

  return result.recordset.map(parseRow);
}

module.exports = { runReport, projectColumns };
