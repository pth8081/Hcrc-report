// lib/adhocReportEngine.js — "Báo cáo tự do" (self-service, hướng Power BI,
// xem hướng_dẫn_báo_cáo.md mục "Báo cáo tự do"): người dùng CUỐI (không
// phải admin) tự chọn Domain + trường nhóm (dimensions) + số liệu tổng hợp
// (measures, kèm hàm tổng hợp) rồi hệ thống tự dựng câu GROUP BY.
//
// KHÁC HẲN lib/reportEngine.js (definition.columns/filters do ADMIN khai
// trong DefinitionJson — nguồn tin cậy được kiểm soát): input ở ĐÂY tới
// thẳng từ request của NGƯỜI DÙNG CUỐI bất kỳ — domain/dimensionFields/
// measureFields/agg đều phải được coi là KHÔNG đáng tin và re-validate lại
// ngay trong module này (không chỉ ở route), không ghép thẳng chuỗi người
// dùng gửi lên vào SQL dưới bất kỳ hình thức nào.
const { sql, getPool } = require('../db');
const { FIELD_NAME_RE } = require('./reportEngine');

// Số dòng MẪU (mới nhất theo EventDate) dùng để dò field thật có trong 1
// Domain — KHÔNG quét toàn bộ Domain (có thể hàng triệu dòng nếu bật "Giữ
// lịch sử theo ngày") để tránh chậm. Đánh đổi: field CHỈ xuất hiện ở dữ
// liệu cũ hơn 500 dòng gần nhất có thể không được liệt kê — ghi rõ trong
// hướng dẫn sử dụng, không coi là lỗi.
const FIELD_SAMPLE_SIZE = 500;

// Giới hạn số dòng KẾT QUẢ SAU GROUP BY — phòng người dùng lỡ chọn field
// gần như duy nhất mỗi dòng (cardinality cao, vd chọn nhầm 1 field định
// danh) làm query nặng bất thường, ảnh hưởng chung pool DWH (nhiều báo cáo
// khác đang dùng chung). Không phải giới hạn dữ liệu THÔ đọc vào (đó vẫn
// giới hạn qua Domain + khoảng ngày).
const MAX_RESULT_ROWS = 5000;

const AGG_SQL = { sum: 'SUM', avg: 'AVG', count: 'COUNT', min: 'MIN', max: 'MAX' };
const AGGS = Object.keys(AGG_SQL);

function assertFieldName(field, label) {
  if (typeof field !== 'string' || !FIELD_NAME_RE.test(field)) {
    throw Object.assign(new Error(`Tên field không hợp lệ (${label}): "${field}"`), { status: 400 });
  }
}

// entityCode là cột THẬT (không nằm trong Dimensions JSON) nhưng vẫn hữu
// ích để nhóm theo — cho phép chọn như 1 "dimension" đặc biệt, không cần
// JSON_VALUE.
function dimensionColumnSql(field) {
  return field === 'entityCode' ? 'EntityCode' : `JSON_VALUE(Dimensions, '$.${field}')`;
}

async function discoverDomainFields(domain) {
  assertFieldName(domain, 'domain');
  const dwhPool = await getPool('DWH');

  const dimReq = dwhPool.request().input('domain', sql.VarChar(50), domain);
  const dimResult = await dimReq.query(`
    SELECT DISTINCT j.[key] AS FieldKey
    FROM (
      SELECT TOP (${FIELD_SAMPLE_SIZE}) Dimensions
      FROM dwh.ReportFacts WHERE Domain = @domain ORDER BY EventDate DESC
    ) t
    CROSS APPLY OPENJSON(t.Dimensions) j
  `);

  const measureReq = dwhPool.request().input('domain', sql.VarChar(50), domain);
  const measureResult = await measureReq.query(`
    SELECT DISTINCT j.[key] AS FieldKey
    FROM (
      SELECT TOP (${FIELD_SAMPLE_SIZE}) Measures
      FROM dwh.ReportFacts WHERE Domain = @domain AND Measures IS NOT NULL ORDER BY EventDate DESC
    ) t
    CROSS APPLY OPENJSON(t.Measures) j
  `);

  const entityReq = dwhPool.request().input('domain', sql.VarChar(50), domain);
  const entityResult = await entityReq.query(`
    SELECT DISTINCT TOP (${FIELD_SAMPLE_SIZE}) EntityCode
    FROM dwh.ReportFacts WHERE Domain = @domain AND EntityCode IS NOT NULL
    ORDER BY EntityCode
  `);

  return {
    dimensionFields: dimResult.recordset.map(r => r.FieldKey),
    measureFields: measureResult.recordset.map(r => r.FieldKey),
    entityCodes: entityResult.recordset.map(r => r.EntityCode)
  };
}

async function runAdhocQuery({ domain, dimensionFields = [], measures = [], dateFrom, dateTo, entityCodes = [] }) {
  assertFieldName(domain, 'domain');
  if (!dateFrom || !dateTo) {
    throw Object.assign(new Error('Thiếu khoảng ngày (dateFrom/dateTo)'), { status: 400 });
  }
  if (!dimensionFields.length && !measures.length) {
    throw Object.assign(new Error('Chọn ít nhất 1 trường nhóm hoặc 1 số liệu'), { status: 400 });
  }

  // KHÔNG tin field/measure client gửi lên — dò lại field THẬT của đúng
  // Domain này ngay trong request, đối chiếu trước khi ghép vào SQL.
  const { dimensionFields: validDims, measureFields: validMeasures } = await discoverDomainFields(domain);
  const validDimSet = new Set([...validDims, 'entityCode']);
  const validMeasureSet = new Set(validMeasures);

  for (const field of dimensionFields) {
    assertFieldName(field, 'dimensionFields');
    if (!validDimSet.has(field)) {
      throw Object.assign(new Error(`Trường nhóm "${field}" không tồn tại trong Domain "${domain}"`), { status: 400 });
    }
  }
  for (const m of measures) {
    assertFieldName(m.field, 'measures[].field');
    if (!validMeasureSet.has(m.field)) {
      throw Object.assign(new Error(`Số liệu "${m.field}" không tồn tại trong Domain "${domain}"`), { status: 400 });
    }
    if (!AGGS.includes(m.agg)) {
      throw Object.assign(new Error(`Hàm tổng hợp không hợp lệ: "${m.agg}" (chỉ nhận ${AGGS.join('/')})`), { status: 400 });
    }
  }

  const pool = await getPool('DWH');
  const request = pool.request();
  request.input('domain', sql.VarChar(50), domain);
  request.input('dateFrom', sql.Date, dateFrom);
  request.input('dateTo', sql.Date, dateTo);

  const conditions = ['Domain = @domain', 'EventDate >= @dateFrom', 'EventDate <= @dateTo'];
  if (entityCodes.length) {
    const names = entityCodes.map((code, i) => {
      request.input(`entity${i}`, sql.NVarChar(100), String(code));
      return `@entity${i}`;
    });
    conditions.push(`EntityCode IN (${names.join(', ')})`);
  }

  const selectParts = dimensionFields.map(f => `${dimensionColumnSql(f)} AS [${f}]`);
  selectParts.push(...measures.map(m => `${AGG_SQL[m.agg]}(CASE WHEN TRY_CONVERT(FLOAT, JSON_VALUE(Measures, '$.${m.field}')) IS NOT NULL THEN TRY_CONVERT(FLOAT, JSON_VALUE(Measures, '$.${m.field}')) END) AS [${m.field}_${m.agg}]`));
  const groupByParts = dimensionFields.map(dimensionColumnSql);

  const sqlText = groupByParts.length
    ? `SELECT TOP (${MAX_RESULT_ROWS}) ${selectParts.join(', ')}
       FROM dwh.ReportFacts
       WHERE ${conditions.join(' AND ')}
       GROUP BY ${groupByParts.join(', ')}
       ORDER BY ${groupByParts.map((_, i) => i + 1).join(', ')}`
    // Không chọn dimension nào -> 1 dòng tổng cộng duy nhất, không GROUP BY.
    : `SELECT TOP (${MAX_RESULT_ROWS}) ${selectParts.join(', ')}
       FROM dwh.ReportFacts
       WHERE ${conditions.join(' AND ')}`;

  const result = await request.query(sqlText);

  const columns = [
    ...dimensionFields.map(f => ({ key: f, label: f })),
    ...measures.map(m => ({ key: `${m.field}_${m.agg}`, label: `${m.field} (${m.agg})` }))
  ];

  return {
    columns,
    rows: result.recordset,
    truncated: result.recordset.length >= MAX_RESULT_ROWS
  };
}

module.exports = { discoverDomainFields, runAdhocQuery, AGGS };
