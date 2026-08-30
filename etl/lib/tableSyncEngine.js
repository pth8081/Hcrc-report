// lib/tableSyncEngine.js — Sinh câu truy vấn cho job Type='table' (một bảng,
// tuỳ chọn kèm một bảng liên kết cùng nguồn — xem tài liệu kiến trúc "Quản
// Trị ETL HCRC", mục 02) và chuyển đổi dòng kết quả về đúng khuôn
// dwh.ReportFacts. Tên bảng/cột THƯỜNG đến từ lib/schemaBrowser.js (giao
// diện etl-admin cho chọn qua dropdown duyệt schema thật, không gõ tay), và
// route lưu cấu hình (routes/admin/syncJobs.js POST/PUT) NAY đã đối chiếu lại
// với schema thật lúc lưu (assertTableConfigMatchesSchema) — nhưng đó chỉ là
// kiểm tra 1 lần lúc lưu, schema nguồn có thể đổi (đổi tên/xoá cột) sau đó mà
// job không hay biết. Vì vậy `assertSafeIdentifier` dưới đây vẫn là LỚP CHỐNG
// CHÈN SQL DUY NHẤT ở tầng server áp dụng lúc CHẠY job — tên sai/không còn
// tồn tại vẫn qua được (lỗi SQL "invalid object name" bình thường lúc chạy),
// nhưng không có ký tự nào ngoài chữ/số/gạch dưới lọt được vào câu SQL.
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
