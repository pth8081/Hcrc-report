// lib/reportEngine.js — Đọc định nghĩa báo cáo (dwh.ReportCatalog) và chạy
// truy vấn tham số hoá trên dwh.ReportFacts. KHÔNG dựng SELECT động theo từng
// cột — luôn lấy nguyên dòng (EntityCode, EventDate, Dimensions, Measures) rồi
// projectColumns() ở tầng JS chọn đúng cột cần trả về theo definition.columns.
//
// definition.columns có 2 dạng phần tử: chuỗi (tên field thô, hành vi cũ) hoặc
// object { key, label, formula } — CỘT TÍNH TOÁN, đánh giá bằng
// lib/formulaEngine.js (bộ đánh giá biểu thức giới hạn, không eval()) SAU khi
// đã có đủ dữ liệu thô của dòng. Đây là nơi công thức nghiệp vụ THẬT SỰ chạy
// khi SourceType='apiReport' (báo cáo đó do api.ReportCatalog định nghĩa) —
// rp-server ở luồng này chỉ forward JSON đã tính sẵn, không tính lại.
//
// Bản sao CÙNG NỘI DUNG cũng có ở rp-server/lib/reportEngine.js — cố ý
// trùng lặp, không dùng chung qua thư mục "shared/", để mỗi server tự chứa đủ
// code khi copy riêng lên máy chủ triển khai (xem tài liệu kiến trúc, mục 08).
const { sql } = require('../db');
const { evaluateFormula } = require('./formulaEngine');

const FIELD_NAME_RE = /^[a-zA-Z0-9_]+$/;

// Field Dimensions nào đã có CỘT TRÍCH XUẤT PERSISTED + INDEX thật trong
// dwh.ReportFacts (xem dwh/schema.sql mục "Tối ưu lọc theo Dimensions") —
// resolveColumn() ưu tiên dùng cột thật (SQL Server seek được qua index)
// thay vì JSON_VALUE(...) (luôn phải quét + parse JSON từng dòng trong
// Domain, không index được). RỖNG mặc định — chỉ thêm dòng ở đây SAU KHI đã
// thực sự chạy ALTER TABLE thêm đúng cột đó trên CSDL thật; một cột
// persisted không ai dùng vẫn tốn chỗ lưu + chi phí tính lại mỗi lần ETL
// upsert, nên KHÔNG thêm "phòng khi cần" — chỉ khi đã xác định rõ 1 báo cáo
// lọc chậm vì field cụ thể nào. Bản sao CÙNG NỘI DUNG cũng có ở
// rp-server/lib/reportEngine.js — sửa cả 2 nơi khi thêm cột mới.
const PERSISTED_DIMENSION_COLUMNS = {
  // deptCode: 'DeptCode', // ví dụ — xem hướng dẫn đầy đủ trong dwh/schema.sql
};

function resolveColumn(field) {
  if (field === 'entityCode') return 'EntityCode';
  if (field === 'eventDate') return 'EventDate';
  if (field === 'sourceSystem') return 'SourceSystem';
  if (PERSISTED_DIMENSION_COLUMNS[field]) return `[${PERSISTED_DIMENSION_COLUMNS[field]}]`;
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

// Cách đọc field TỪ DÒNG DỮ LIỆU ĐÃ LẤY VỀ (khác resolveColumn — đó là đọc
// field để dựng SQL) — dùng chung cho cột thường (chuỗi) lẫn công thức.
function resolveField(row, path) {
  const [head, ...rest] = path;
  if (rest.length === 0) {
    if (head === 'entityCode') return row.entityCode;
    if (head === 'eventDate') return row.eventDate;
    if (head === 'sourceSystem') return row.sourceSystem;
    return row.dimensions ? row.dimensions[head] : undefined;
  }
  if (head === 'measures' && rest.length === 1) return row.measures ? row.measures[rest[0]] : undefined;
  throw new Error(`Đường dẫn field không hợp lệ: "${path.join('.')}"`);
}

function projectColumns(row, columns) {
  const out = {};
  for (const col of columns) {
    if (col && typeof col === 'object' && col.formula) {
      out[col.key] = evaluateFormula(col.formula, (path) => resolveField(row, path));
      continue;
    }
    if (col === 'entityCode') out[col] = row.entityCode;
    else if (col === 'eventDate') out[col] = row.eventDate;
    else if (col === 'sourceSystem') out[col] = row.sourceSystem;
    else if (col.startsWith('measures.')) out[col] = row.measures[col.slice('measures.'.length)];
    else out[col] = row.dimensions[col];
  }
  return out;
}

// Chuẩn hoá definition.columns (chuỗi HOẶC object công thức) thành
// [{key, label}] — hình dạng DUY NHẤT trả về cho bên gọi (hệ ngoài qua API
// key, hoặc rp-server khi SourceType='apiReport'), để nơi hiển thị không cần
// biết cột nào là field thô hay cột tính toán.
function describeColumns(columns) {
  return columns.map(col => (
    col && typeof col === 'object'
      ? { key: col.key, label: col.label || col.key }
      : { key: col, label: col }
  ));
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

module.exports = { runReport, projectColumns, describeColumns };
