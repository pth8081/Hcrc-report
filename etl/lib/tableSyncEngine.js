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

// connection = { pool, adapter, engine } từ lib/dataSourcePool.js.
async function extractTable(connection, job, lastSyncedAt) {
  const { pool, adapter, engine } = connection;
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
  return { rows, keyCol, dateCol, updatedCol, dimCols, joinCols, engine };
}

// dwh.ReportFacts.EventDate (cột DATE, không giờ) được ghi qua tedious với
// useUTC:true — tedious LẤY getUTCFullYear/getUTCMonth/getUTCDate() của đối
// tượng Date để mã hoá DATE gửi lên SQL Server (xem
// tedious/lib/data-types/date.js). Nguồn 'mssql' đọc cũng qua tedious
// useUTC:true — 2 đầu dùng CHUNG quy ước "coi getUTC* là giá trị thật", tự
// triệt tiêu, không lệch. Nguồn 'mysql'/'mariadb' (mysql2, KHÔNG cấu hình
// `timezone` — mặc định 'local') lại dựng đối tượng Date sao cho GIỜ ĐỊA
// PHƯƠNG (getFullYear/getMonth/getDate — KHÔNG PHẢI getUTC*) khớp đúng giá
// trị chuỗi gốc từ MySQL, bất kể tiến trình Node chạy ở timezone nào. Nếu
// truyền thẳng Date đó cho tedious (đọc getUTC*), 1 dòng có giờ giao dịch
// sớm (0h–6h59 giờ VN, đúng khung POS chốt sổ ban đêm) sẽ bị LÙI 1 NGÀY khi
// tiến trình ETL chạy ở UTC (phổ biến ở server production, xem
// jobs/scheduler.js) — vd "2026-09-01 02:00:00" giờ VN ghi nhầm thành
// EventDate=2026-08-31. Sửa bằng cách dựng LẠI 1 Date "giả UTC" từ ĐÚNG
// các thành phần local đã đúng (getFullYear/getMonth/getDate của Date gốc)
// — khi tedious đọc getUTC* của Date "giả UTC" này sẽ ra đúng ngày lịch
// thật, không phụ thuộc timezone tiến trình. CHỈ áp dụng cho EventDate (cột
// DATE, chỉ cần đúng NGÀY) — KHÔNG đụng tới UpdatedAt/watermark (vẫn dùng
// nguyên Date gốc, giữ đúng logic so sánh watermark hiện có).
function normalizeEventDate(rawValue, engine) {
  if (engine !== 'mysql' || !(rawValue instanceof Date)) return rawValue;
  return new Date(Date.UTC(rawValue.getFullYear(), rawValue.getMonth(), rawValue.getDate()));
}

function transformRow(job, meta, row) {
  const dimensions = {};
  for (const c of meta.dimCols) dimensions[c] = row[`m_${c}`];
  for (const c of meta.joinCols) dimensions[c] = row[`j_${c}`];

  const measures = {};
  for (const c of parseColumnList(job.MeasureColumnsJson)) measures[c] = row[`m_${c}`];

  // trim() cột khoá — nguồn dữ liệu (CHAR cố định độ dài, hoặc admin gõ tay
  // ở bảng trung gian) đôi khi có khoảng trắng thừa đầu/cuối; entityCode
  // dùng làm KHOÁ GHÉP giữa dwh.ReportFacts (đây) và dwh.SalesTargets (xem
  // etl/lib/salesTargetsImport.js — cũng trim) trong
  // rp-server/lib/compositeReportRunner.js — 1 khoảng trắng thừa lọt qua sẽ
  // khiến 2 khối không ghép được, tách thành 2 dòng thay vì 1 (xem
  // hướng_dẫn_báo_cáo.md mục "entityCode phải khớp CHÍNH XÁC"). KHÔNG tự ý
  // đổi HOA/thường — đó vẫn là trách nhiệm admin gõ đúng quy ước, đổi ngầm
  // có thể sai với nguồn cố ý phân biệt hoa/thường.
  const rawEntityCode = row[`m_${meta.keyCol}`];
  return {
    sourceSystem: `ds${job.DataSourceId}`,
    domain: job.TargetDomain,
    entityCode: typeof rawEntityCode === 'string' ? rawEntityCode.trim() : rawEntityCode,
    eventDate: normalizeEventDate(row[`m_${meta.dateCol}`], meta.engine),
    dimensions,
    measures
  };
}

module.exports = { extractTable, transformRow, normalizeEventDate };
