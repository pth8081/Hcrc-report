// lib/tableSyncEngine.js — Sinh câu truy vấn cho job Type='table' (một bảng,
// tuỳ chọn kèm một bảng liên kết cùng nguồn — xem tài liệu kiến trúc "Quản
// Trị ETL HCRC", mục 02) và chuyển đổi dòng kết quả về đúng khuôn
// dwh.ReportFacts. Toàn bộ tên bảng/cột đã được xác nhận tồn tại thật lúc
// lưu cấu hình (qua lib/schemaBrowser.js, gọi từ routes/admin/dataSources.js)
// — kiểm tra định dạng dưới đây chỉ là lớp phòng thủ thứ hai, không phải cơ
// chế chống chèn SQL duy nhất.
const IDENT_RE = /^[A-Za-z0-9_]+$/;

function assertSafeIdentifier(name) {
  if (!IDENT_RE.test(name)) throw new Error(`Tên không hợp lệ trong cấu hình đồng bộ: "${name}"`);
  return name;
}

function parseColumnList(json) {
  if (!json) return [];
  const list = JSON.parse(json);
  return list.map(assertSafeIdentifier);
}

// connection = { pool, adapter } từ lib/dataSourcePool.js.
async function extractTable(connection, job, lastSyncedAt) {
  const { pool, adapter } = connection;
  const q = adapter.quoteIdent;
  const p = adapter.param;

  const mainSchema = assertSafeIdentifier(job.SourceSchema);
  const mainTable = assertSafeIdentifier(job.SourceTable);
  const keyCol = assertSafeIdentifier(job.KeyColumn);
  const dateCol = assertSafeIdentifier(job.DateColumn);
  const updatedCol = assertSafeIdentifier(job.UpdatedAtColumn);
  const dimCols = parseColumnList(job.DimensionColumnsJson);
  const measureCols = parseColumnList(job.MeasureColumnsJson);

  const mainCols = [...new Set([keyCol, dateCol, updatedCol, ...dimCols, ...measureCols])];
  const selectParts = mainCols.map(c => `m.${q(c)} AS m_${c}`);

  let joinClause = '';
  let joinCols = [];
  if (job.JoinTable) {
    const joinSchema = assertSafeIdentifier(job.JoinSchema);
    const joinTable = assertSafeIdentifier(job.JoinTable);
    const mainJoinCol = assertSafeIdentifier(job.MainJoinColumn);
    const lookupJoinCol = assertSafeIdentifier(job.LookupJoinColumn);
    const joinType = job.JoinType === 'INNER' ? 'INNER' : 'LEFT';
    joinCols = parseColumnList(job.LookupDimensionColumnsJson);
    selectParts.push(...joinCols.map(c => `j.${q(c)} AS j_${c}`));
    joinClause = `${joinType} JOIN ${q(joinSchema)}.${q(joinTable)} j ON m.${q(mainJoinCol)} = j.${q(lookupJoinCol)}`;
  }

  const sqlText = `
    SELECT ${selectParts.join(', ')}
    FROM ${q(mainSchema)}.${q(mainTable)} m
    ${joinClause}
    WHERE m.${q(updatedCol)} > ${p('lastSyncedAt')}
    ORDER BY m.${q(updatedCol)} ASC
  `;

  const rows = await adapter.query(pool, sqlText, { lastSyncedAt });
  return { rows, keyCol, dateCol, updatedCol, dimCols, joinCols };
}

function transformRow(job, meta, row) {
  const dimensions = {};
  for (const c of meta.dimCols) dimensions[c] = row[`m_${c}`];
  for (const c of meta.joinCols) dimensions[c] = row[`j_${c}`];

  const measures = {};
  for (const c of parseColumnList(job.MeasureColumnsJson)) measures[c] = row[`m_${c}`];

  return {
    sourceSystem: `ds${job.DataSourceId}`,
    domain: job.TargetDomain,
    entityCode: row[`m_${meta.keyCol}`],
    eventDate: row[`m_${meta.dateCol}`],
    dimensions,
    measures
  };
}

module.exports = { extractTable, transformRow };
